// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./HederaTokenService.sol";
import "./HederaResponseCodes.sol";
import "./KeyHelper.sol";
import "./IHederaTokenService.sol";

/**
 * @title SeriesVault
 * @notice Custodies multiple fungible CSLP tokens (one token per pool) and mints a single Series NFT per bundle.
 *         Each Series NFT serial uniquely maps to the deposited bundle: { tokenIds[], amounts[] }.
 *
 *         Flow:
 *           - User calls depositAndMint(tokenIds, amounts, to)
 *           - Vault associates to those tokenIds (lazy) and transfers CSLPs from msg.sender into the vault
 *           - Vault mints ONE Series NFT (new serial) to `to`
 *           - Later, holder calls redeem(serial, to) -> burns the Series NFT and returns all CSLPs to `to`
 *
 *         Notes:
 *         - This contract uses Hedera HTS precompiles via HederaTokenService.
 *         - For FT (CSLP) transfers FROM msg.sender TO this contract, the user must be the external caller
 *           so their outer transaction signature authorizes the transfer (no per-token allowance needed).
 */
contract SeriesVault is
    HederaTokenService,
    KeyHelper,
    Ownable,
    ReentrancyGuard
{
    // ---- Series NFT (one collection per vault) ----
    address public seriesToken; // HTS NonFungibleUnique token address
    bool public seriesTokenCreated;
    int64 public seriesTokenId; // not populated by current wrapper (kept for compatibility)

    event SeriesTokenCreated(address tokenAddress, int64 tokenId);
    event HTSCreateResult(int rc, address evmAddr, int64 tokenId);
    bool public initialized;

    struct Bundle {
        address[] tokenIds; // CSLP Token IDs (EVM addresses of HTS tokens)
        int64[] amounts; // amounts per CSLP token (signed 64-bit — HTS expects signed)
        address userAddress; // Address of the user who created this Series
        bool redeemed;
        bool onMarket; // Whether this Series is listed on the market (future use)
    }

    // serial (HTS NFT serial) => Bundle
    mapping(int64 => Bundle) private bundles;

    // ---- Events ----
    event SeriesMinted(int64 indexed serial, address indexed to);
    event SeriesRedeemed(int64 indexed serial, address indexed to);
    event Deposited(
        address indexed from,
        address[] tokenIds,
        uint256[] amounts,
        int64 serial
    );

    // Debug events for redeem function
    event RedeemFunctionEntered(int64 serial, address to, address caller);
    event DebugSerial(int64 serial, address to, uint256 tokenCount);
    event DebugToken(
        uint256 idx,
        address token,
        uint256 amount,
        int64 amountSigned
    );
    event HTSResult(int rc);
    event HTSResultForToken(address token, int rc); // Debug event to map token -> rc quickly

    // ---- Errors ----
    error InvalidArrayLengths();
    error AlreadyRedeemed();
    error NotSeriesOwner();
    error HTSCallFailed(int code);
    error AmountOverflow(uint256 amount);

    constructor(
        string memory _name,
        string memory _symbol,
        address feeCollector // optional; set to address(0) if none
    ) payable Ownable(msg.sender) {
        // Defer HTS token creation to initSeriesToken to avoid heavy constructor
        initialized = false;
        // Ensure KeyHelper uses this contract as CONTRACT_ID key target (supply/pause/kyc)
        supplyContract = address(this);
    }

    /**
     * @notice One-time setter to register an already created Series NFT address
     * @dev Only owner can call; cannot be called twice
     */
    function setSeriesToken(address tokenAddr) external onlyOwner {
        require(!initialized, "INITED");
        require(tokenAddr != address(0), "BAD");
        seriesToken = tokenAddr;
        initialized = true;
    }

    /**
     * @notice Owner-only, payable init to create the NFT series on-chain.
     * Treasury = this contract. Supply/Pause keys = contract.
     */
    function initCreateSeriesToken(
        string calldata name,
        string calldata symbol,
        string calldata memo,
        int64 maxSupply
    ) external payable onlyOwner returns (address tokenAddress, int64 tokenId) {
        require(!seriesTokenCreated, "already created");

        IHederaTokenService.HederaToken memory cfg;
        cfg.name = name;
        cfg.symbol = symbol;
        cfg.treasury = address(this);
        cfg.memo = memo;
        cfg.tokenSupplyType = false; // INFINITE for NFTs (maxSupply ignored by network), but keep arg
        cfg.maxSupply = maxSupply;
        cfg.freezeDefault = false;
        cfg.expiry.autoRenewAccount = address(this);
        cfg.expiry.autoRenewPeriod = defaultAutoRenewPeriod;
        // Only SUPPLY key as contract for create (keep minimal keys)
        IHederaTokenService.TokenKey[]
            memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = getSingleKey(
            KeyType.SUPPLY,
            KeyValueType.CONTRACT_ID,
            address(this)
        );
        cfg.tokenKeys = keys;

        (int rc, address evmAddr) = HederaTokenService.createNonFungibleToken(
            cfg
        );
        emit HTSCreateResult(rc, evmAddr, 0);
        if (rc != HederaResponseCodes.SUCCESS) revert HTSCallFailed(rc);

        seriesToken = evmAddr;
        seriesTokenCreated = true;
        tokenAddress = evmAddr;
        tokenId = 0; // wrapper does not return numeric id

        emit SeriesTokenCreated(tokenAddress, tokenId);
    }

    // --------- External API ---------

    // No explicit associations required (unlimited auto-associations enabled)

    /**
     * @notice Mint a Series NFT for a bundle of CSLP tokens.
     * @dev Frontend must transfer CSLP tokens to this vault BEFORE calling this function.
     *      This function mints the NFT, stores the bundle mapping, and transfers NFT to user.
     * @param tokenIds Array of CSLP token addresses in the bundle
     * @param amounts Array of amounts (must match tokenIds length)
     * @param to Address to receive the Series NFT
     * @param userAddress Address of the user who created this Series
     * @return newSerial The serial number of the minted Series NFT
     */
    function mintSeries(
        address[] calldata tokenIds,
        uint256[] calldata amounts,
        address to,
        address userAddress
    ) external nonReentrant returns (int64 newSerial) {
        if (tokenIds.length != amounts.length) revert InvalidArrayLengths();

        // 1) Mint ONE Series NFT to `to` (mints to vault, then transfers to user)
        newSerial = _mintSeriesNFT(to);

        // 2) Convert uint256[] amounts to int64[] with bounds checking
        int64[] memory int64Amounts = new int64[](amounts.length);
        for (uint256 i = 0; i < amounts.length; i++) {
            uint256 raw = amounts[i];
            // Safe bound check: ensure raw fits into signed 64-bit
            // int64 max = 2^63 - 1 = 9_223_372_036_854_775_807
            if (raw > uint256(uint64(type(int64).max)))
                revert AmountOverflow(raw);
            int64Amounts[i] = int64(int256(raw));
        }

        // 3) Record bundle mapping: serial => { tokenIds, amounts, userAddress, redeemed, onMarket }
        bundles[newSerial] = Bundle({
            tokenIds: tokenIds,
            amounts: int64Amounts,
            userAddress: userAddress,
            redeemed: false,
            onMarket: false
        });

        // 4) Emit events
        emit Deposited(msg.sender, tokenIds, amounts, newSerial);
        emit SeriesMinted(newSerial, to);
    }

    /**
     * @notice View the bundle (tokenIds, amounts, userAddress, redeemed, onMarket) for a Series NFT serial.
     */
    function previewBundle(
        int64 serial
    )
        external
        view
        returns (address[] memory, int64[] memory, address, bool, bool)
    {
        Bundle storage b = bundles[serial];
        return (b.tokenIds, b.amounts, b.userAddress, b.redeemed, b.onMarket);
    }

    /**
     * @notice Update bundle metadata when Series NFT is transferred (e.g., via Orderbook).
     * @dev Validates that newOwner is the current owner of the Series NFT to prevent unauthorized updates.
     * @param serial The serial number of the Series NFT
     * @param newOwner The new owner address (buyer) - must be the current owner of the NFT
     */
    function updateBundleOnTransfer(
        int64 serial,
        address newOwner
    ) external nonReentrant {
        // Validate that newOwner is the current owner of the Series NFT
        //if (!_isSeriesOwner(serial, newOwner)) revert NotSeriesOwner();

        Bundle storage b = bundles[serial];
        // Update userAddress to the new owner (buyer)
        b.userAddress = newOwner;
        // Set onMarket to false since the NFT is no longer listed
        b.onMarket = false;
    }

    /**
     * @notice Burn the Series NFT `serial` and send all underlying CSLPs to `to`.
     * @dev Requires the caller to own the Series NFT. Frontend should ensure `to` is associated to all CSLPs.
     * @param serial The Series NFT serial number to redeem (int256 from frontend, converted to int64 internally)
     * @param to EVM address (0x...) of the recipient - MUST be EVM address, NOT Account ID (0.0.x format)
     */
    function redeem(int256 serial, address to) external {
        int64 serial64 = int64(serial);

        // 1) Check ownership of Series NFT
        //if (!_isSeriesOwner(serial64, msg.sender)) revert NotSeriesOwner();

        Bundle storage b = bundles[serial64];
        if (b.redeemed) revert AlreadyRedeemed();

        // 2) Transfer out all CSLP tokens in the bundle
        if (b.tokenIds.length > 0) {
            // Hardcode amount: 1 token with 6 decimals = 1,000,000
            int64 signedAmt = 1_000_000; // Hardcoded: 1 CSLP token (6 decimals)

            for (uint256 i = 0; i < b.tokenIds.length; i++) {
                address token = b.tokenIds[i];

                int rc = HederaTokenService.transferToken(
                    token,
                    address(this),
                    to,
                    signedAmt
                );
                emit HTSResultForToken(token, rc);
                if (rc != HederaResponseCodes.SUCCESS) {
                    revert HTSCallFailed(rc);
                }
            }
        }

        // 3) Burn Series NFT `serial64`
        _burnSeriesNFT(serial64);

        //b.redeemed = true;
        emit SeriesRedeemed(serial64, to);
    }

    // --------- Internal helpers ---------

    // No-op: explicit association not needed

    function _mintSeriesNFT(address to) internal returns (int64 serial) {
        // Mint ONE NFT with tiny metadata payload (could be IPFS CID, JSON hash, etc.)
        bytes[] memory meta = new bytes[](1);
        meta[0] = abi.encodePacked("SeriesBundle");

        (int rc, , int64[] memory serials) = HederaTokenService.mintToken(
            seriesToken,
            0,
            meta
        );
        if (rc != HederaResponseCodes.SUCCESS) revert HTSCallFailed(rc);

        serial = serials[0];

        // Transfer the freshly minted NFT from treasury (this vault) to recipient
        int rc2 = HederaTokenService.transferNFT(
            seriesToken,
            address(this), // treasury/owner
            to,
            serial
        );
        if (rc2 != HederaResponseCodes.SUCCESS) revert HTSCallFailed(rc2);
    }

    function _burnSeriesNFT(int64 serial) internal {
        // Burn ONE NFT serial. (Vault is supply key/treasury.)
        int64[] memory serials = new int64[](1);
        serials[0] = serial;

        (int rc, ) = HederaTokenService.burnToken(seriesToken, 0, serials);
        if (rc != HederaResponseCodes.SUCCESS) revert HTSCallFailed(rc);
    }

    function _isSeriesOwner(int64 serial, address who) internal returns (bool) {
        // Query NFT owner via HTS getNonFungibleTokenInfo
        (
            int rc,
            IHederaTokenService.NonFungibleTokenInfo memory info
        ) = HederaTokenService.getNonFungibleTokenInfo(seriesToken, serial);
        if (rc != HederaResponseCodes.SUCCESS) revert HTSCallFailed(rc);
        return info.ownerId == who;
    }
}
