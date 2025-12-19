// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./HederaTokenService.sol";
import "./HederaResponseCodes.sol";
import "./KeyHelper.sol";

// Interface for factory contract
interface IClearSkyFactory {
    function mintCSLP(
        address poolAddress,
        address user,
        uint256 amount
    ) external;
    function mintFCDR(
        address poolAddress,
        address fcdrOwner,
        uint256 hbarAmount
    ) external;
    function burnCSLP(address poolAddress, uint256 amount) external;
}

/**
 * @title ClearSky HBAR-Only Liquidity Pool V3
 * @notice A simplified liquidity pool that accepts only HBAR with split token creation
 * @dev Built for Hedera network with HTS LP tokens using HIP-1028 (split deployment)
 */
contract ClearSkyLiquidityPoolV3 is
    Ownable,
    ReentrancyGuard,
    HederaTokenService,
    KeyHelper
{
    // Factory contract address
    address public immutable factory;

    // Pool user (the user this pool belongs to - for tracking only)
    address public poolUser;

    // Shared tokens (set by factory)
    address public immutable cslpToken;
    address public immutable fcdr1155Contract; // FCDR1155 contract address

    // Pool state
    uint256 public totalHBAR;
    uint256 public totalLPTokens;
    uint256 public totalValue; // Total value in HBAR (8 decimals)

    // Maturation percentage with 2-decimal precision (store as integer scaled by 100)
    // Example: 12.34% is stored as 1234
    uint256 public maturationPct2dp;

    // Retirement URL (default: empty)
    string public retirement_url;

    // Fees (in basis points: 100 = 1%)
    uint256 public constant FEE_BPS = 30; // 0.3% fee
    uint256 public constant FEE_DENOMINATOR = 10000;

    // Minimum liquidity amounts
    uint256 public constant MIN_LIQUIDITY = 100000; // 0.001 HBAR in wei (8 decimals)

    // Note: TokenInfo struct removed - using shared cslpToken from factory

    // Purchase metadata for tracking individual purchases
    struct PurchaseMetadata {
        uint256 hbarAmount; // HBAR used for this purchase
        uint256 timestamp; // Date and time of purchase
        uint256 numUsed; // The calculated maturation amount (for reference)
        uint256 cslpTokensMinted; // Actual CSLP tokens minted in this purchase
        address purchaser; // Wallet address of the buyer
        address lpAddress; // Liquidity pool contract address
        address cslpTokenAddress; // CSLP token address used for this purchase
    }

    // Storage for purchase metadata
    mapping(uint256 => PurchaseMetadata) public purchaseMetadata;
    mapping(address => uint256[]) public userPurchases; // Maps user address to their purchase IDs
    uint256 public totalPurchases;

    // Tracks if a user has already received CSLP from this pool (enforce 1 CSLP per user per pool)
    mapping(address => bool) public hasReceivedCSLPFromThisPool;

    event LiquidityAdded(
        address indexed user,
        uint256 hbarAmount,
        uint256 lpTokensMinted,
        uint256 timestamp
    );

    // HTS Events
    event HTSMintAttempt(
        address indexed token,
        address indexed to,
        int64 amount
    );
    event HTSMintSuccess(
        address indexed token,
        address indexed to,
        int64 amount,
        int64 newTotalSupply
    );

    // Custom errors
    error InsufficientHBAR();
    error InsufficientLPBalance();
    error PoolNotActive();
    error InvalidAmounts();
    error SlippageExceeded();
    error NoLiquidityProvided();
    error InsufficientInitialLiquidity();
    error PoolAlreadyInitialized();
    // Note: Token errors removed - using shared tokens from factory

    /**
     * @notice Constructor - Factory pattern setup with individual tokens
     * @param _factory Factory contract address
     * @param _poolUser User address this pool belongs to
     * @param _cslpToken CSLP token address (can be address(0) initially)
     * @param _fcdr1155Contract FCDR1155 contract address
     * @param _owner Global owner address who can administer this pool
     */
    constructor(
        address _factory,
        address _poolUser,
        address _cslpToken,
        address _fcdr1155Contract,
        address _owner
    ) Ownable(_owner) {
        require(_factory != address(0), "BAD_FACTORY");
        require(_poolUser != address(0), "BAD_USER");
        require(_cslpToken != address(0), "BAD_CSLP");
        require(_fcdr1155Contract != address(0), "BAD_FCDR");
        require(_owner != address(0), "BAD_OWNER");
        factory = _factory;
        poolUser = _poolUser;
        cslpToken = _cslpToken;
        fcdr1155Contract = _fcdr1155Contract;

        // Note: Token association will be handled by the frontend after pool creation
    }

    /**
     * @notice Associate this contract with CSLP token (Owner only)
     * @dev This function must be called after pool creation to enable token operations
     *      FCDR tokens are now handled by ERC-1155 contract, no association needed
     */
    function associateTokens() external onlyOwner {
        // Associate with CSLP token
        int responseCode = HederaTokenService.associateToken(
            address(this),
            cslpToken
        );
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert(
                string(
                    abi.encodePacked(
                        "CSLP token association failed: ",
                        getErrorMessage(int32(responseCode))
                    )
                )
            );
        }
    }

    /**
     * @notice Initialize the pool with initial HBAR liquidity (Owner only)
     * @dev This function must be called after token creation
     */
    function initializePool() external payable onlyOwner nonReentrant {
        require(cslpToken != address(0), "NO_CSLP");
        require(totalLPTokens == 0, "INITED");
        require(msg.value >= MIN_LIQUIDITY, "LIQ_MIN");

        // Store initial HBAR
        totalHBAR = msg.value;
        totalValue = msg.value;

        // Calculate initial LP tokens (1:1 ratio with HBAR but adjusted for decimals)
        // HBAR has 8 decimals, LP token has 6 decimals
        uint256 lpTokenAmount = msg.value / 100; // Convert from 8 decimals to 6 decimals

        // Mint initial CSLP tokens to caller using factory
        emit HTSMintAttempt(
            cslpToken,
            msg.sender,
            int64(uint64(lpTokenAmount))
        );

        // Call factory to mint CSLP tokens
        IClearSkyFactory(factory).mintCSLP(
            address(this),
            msg.sender,
            lpTokenAmount
        );

        totalLPTokens = lpTokenAmount;
        emit HTSMintSuccess(
            cslpToken,
            msg.sender,
            int64(uint64(lpTokenAmount)),
            0
        ); // newTotalSupply not available from factory

        emit LiquidityAdded(
            msg.sender,
            msg.value,
            lpTokenAmount,
            block.timestamp
        );
    }

    /**
     * @notice Add liquidity to the pool - Conditionally mints CSLP tokens
     * @param usdAmount Amount in USD (2 decimals, e.g., 1000 = $10.00)
     * @param maturationAmount Maturation amount in USD (2 decimals, e.g., 11000 = $110.00)
     * @param cslpTokensToMint Number of CSLP tokens to mint (0 = no minting, just accept HBAR; >0 = mint tokens)
     */
    function addLiquidity(
        uint256 /*minLPTokens*/,
        uint256 usdAmount,
        uint256 maturationAmount,
        uint256 cslpTokensToMint
    ) external payable nonReentrant {
        require(cslpToken != address(0), "NO_CSLP");
        require(msg.value > 0, "NO_HBAR");
        require(usdAmount > 0, "USD_ZERO");
        require(maturationAmount > 0, "MAT_ZERO");
        require(cslpTokensToMint >= 0, "CSLP_NEG");

        // 🚀 AUTO-INITIALIZATION: If pool is not initialized, initialize it with first liquidity
        if (totalLPTokens == 0) {
            // This is the first liquidity addition - initialize the pool
            totalHBAR = msg.value;
            totalValue = msg.value;

            // 🎯 Enforce 1 CSLP per user per pool
            uint256 desiredMint = hasReceivedCSLPFromThisPool[msg.sender]
                ? 0
                : 1_000_000; // 1 CSLP with 6 decimals
            if (desiredMint > 0) {
                // Mint CSLP tokens using factory (factory has the supply key)
                emit HTSMintAttempt(
                    cslpToken,
                    msg.sender,
                    int64(uint64(desiredMint))
                );
                IClearSkyFactory(factory).mintCSLP(
                    address(this),
                    msg.sender,
                    desiredMint
                );
                hasReceivedCSLPFromThisPool[msg.sender] = true;
                totalLPTokens = desiredMint; // initialize supply to minted amount
                emit HTSMintSuccess(
                    cslpToken,
                    msg.sender,
                    int64(uint64(desiredMint)),
                    0
                );
            } else {
                // Should not happen on very first add by pool user, but keep safety
                totalLPTokens = 1; // mark initialized
            }

            // Store purchase metadata
            PurchaseMetadata memory metadata = PurchaseMetadata({
                hbarAmount: msg.value,
                timestamp: block.timestamp,
                numUsed: calculateCSLPFromUSD(usdAmount, maturationAmount),
                cslpTokensMinted: desiredMint,
                purchaser: msg.sender,
                lpAddress: address(this),
                cslpTokenAddress: cslpToken
            });

            // Store metadata and track purchase
            purchaseMetadata[totalPurchases] = metadata;
            userPurchases[msg.sender].push(totalPurchases);
            totalPurchases++;

            emit LiquidityAdded(
                msg.sender,
                msg.value,
                desiredMint,
                block.timestamp
            );
            return; // Pool is now initialized, exit early
        }

        // Calculate what the maturation amount would be using USD-based calculation (for reference in metadata)
        uint256 calculatedMaturation = calculateCSLPFromUSD(
            usdAmount,
            maturationAmount
        );

        // Update pool state
        totalHBAR += msg.value;
        totalValue += msg.value;

        // 🎯 Enforce 1 CSLP per user per pool on subsequent adds
        uint256 subsequentMint = hasReceivedCSLPFromThisPool[msg.sender]
            ? 0
            : 1_000_000;
        if (subsequentMint > 0) {
            emit HTSMintAttempt(
                cslpToken,
                msg.sender,
                int64(uint64(subsequentMint))
            );
            IClearSkyFactory(factory).mintCSLP(
                address(this),
                msg.sender,
                subsequentMint
            );
            hasReceivedCSLPFromThisPool[msg.sender] = true;
            totalLPTokens += subsequentMint;
            emit HTSMintSuccess(
                cslpToken,
                msg.sender,
                int64(uint64(subsequentMint)),
                0
            );
        }

        // 🎯 STORE METADATA FOR THIS PURCHASE
        purchaseMetadata[totalPurchases] = PurchaseMetadata({
            hbarAmount: msg.value, // HBAR used for this purchase
            timestamp: block.timestamp, // Date and time
            numUsed: calculatedMaturation, // The calculated maturation amount (for reference)
            cslpTokensMinted: subsequentMint, // Actual CSLP tokens minted in this purchase
            purchaser: msg.sender, // Wallet address of the buyer
            lpAddress: address(this), // Liquidity pool contract address
            cslpTokenAddress: cslpToken // CSLP token address used for this purchase
        });

        // 🎯 TRACK WHICH USER MADE WHICH PURCHASE
        userPurchases[msg.sender].push(totalPurchases);
        totalPurchases++;

        emit LiquidityAdded(
            msg.sender,
            msg.value,
            subsequentMint,
            block.timestamp
        );
    }

    /**
     * @notice Calculate CSLP tokens for a given USD amount (fixed conversion)
     * @param usdAmount Amount in USD (2 decimals, e.g., 1000 = $10.00)
     * @param maturationAmount Maturation amount in USD (2 decimals, e.g., 11000 = $110.00)
     * @return cslpTokens CSLP tokens to mint (6 decimals)
     */
    function calculateCSLPFromUSD(
        uint256 usdAmount,
        uint256 maturationAmount
    ) public pure returns (uint256 cslpTokens) {
        require(usdAmount > 0, "USD_ZERO");
        require(maturationAmount > 0, "MAT_ZERO");

        // CSLP = (USD amount * 1e6) / maturation amount
        // This gives us CSLP tokens in 6 decimals
        cslpTokens = (usdAmount * 1e6) / maturationAmount;
    }

    // calculateHBAR removed (unused)

    // getUserShare removed (unused)

    /**
     * @notice Get current pool information
     * @return _totalHBAR Total HBAR in pool
     * @return _totalLPTokens Total LP tokens minted
     * @return _totalValue Total pool value in HBAR
     */
    function getPoolInfo()
        external
        view
        returns (
            uint256 _totalHBAR,
            uint256 _totalLPTokens,
            uint256 _totalValue
        )
    {
        return (totalHBAR, totalLPTokens, totalValue);
    }

    /**
     * @notice Get the value per LP token in HBAR
     * @return valuePerToken Value per LP token (in HBAR, 8 decimals)
     */
    function getValuePerLPToken()
        external
        view
        returns (uint256 valuePerToken)
    {
        if (totalLPTokens == 0) {
            return 0;
        }

        // Convert from 6 decimal LP tokens to 8 decimal HBAR
        // totalValue is in 8 decimals, totalLPTokens is in 6 decimals
        // So we need to divide totalValue by (totalLPTokens / 100) to get 8 decimal result
        return (totalValue / 100) / totalLPTokens;
    }

    // getUserValue removed (unused)

    // Note: getTokenInfo() function removed - using shared cslpToken from factory

    /**
     * @notice Get all purchase IDs for a specific user (by wallet address)
     * @param user User's wallet address
     * @return Array of purchase IDs
     */
    function getUserPurchases(
        address user
    ) external view returns (uint256[] memory) {
        return userPurchases[user];
    }

    /**
     * @notice Get metadata for a specific purchase
     * @param purchaseId Purchase ID
     * @return Purchase metadata struct
     */
    function getPurchaseMetadata(
        uint256 purchaseId
    ) external view returns (PurchaseMetadata memory) {
        return purchaseMetadata[purchaseId];
    }

    /**
     * @notice Get total number of purchases
     * @return Total number of purchases made
     */
    function getTotalPurchases() external view returns (uint256) {
        return totalPurchases;
    }

    // Note: isTokenCreated() function removed - using shared cslpToken from factory

    /**
     * @notice Get human-readable error message for Hedera response code
     * @param responseCode The Hedera response code
     * @return errorMessage Human-readable error message
     */
    function getErrorMessage(
        int32 responseCode
    ) public pure returns (string memory errorMessage) {
        if (responseCode == HederaResponseCodes.SUCCESS) return "SUCCESS";
        if (responseCode == HederaResponseCodes.INSUFFICIENT_TX_FEE)
            return "INSUFFICIENT_TX_FEE - Not enough gas/fee provided";
        if (responseCode == HederaResponseCodes.INSUFFICIENT_PAYER_BALANCE)
            return
                "INSUFFICIENT_PAYER_BALANCE - Payer account has insufficient HBAR";
        if (responseCode == HederaResponseCodes.INVALID_SIGNATURE)
            return "INVALID_SIGNATURE - Transaction signature is invalid";
        if (responseCode == HederaResponseCodes.INVALID_ACCOUNT_ID)
            return
                "INVALID_ACCOUNT_ID - Account ID is invalid or does not exist";
        if (responseCode == HederaResponseCodes.INVALID_CONTRACT_ID)
            return
                "INVALID_CONTRACT_ID - Contract ID is invalid or does not exist";
        if (responseCode == HederaResponseCodes.INSUFFICIENT_GAS)
            return "INSUFFICIENT_GAS - Not enough gas supplied";
        if (responseCode == HederaResponseCodes.CONTRACT_EXECUTION_EXCEPTION)
            return "CONTRACT_EXECUTION_EXCEPTION - Contract execution failed";
        if (responseCode == HederaResponseCodes.MAX_GAS_LIMIT_EXCEEDED)
            return "MAX_GAS_LIMIT_EXCEEDED - Gas limit exceeded";
        if (
            responseCode ==
            HederaResponseCodes.INVALID_TREASURY_ACCOUNT_FOR_TOKEN
        )
            return
                "INVALID_TREASURY_ACCOUNT_FOR_TOKEN - Treasury account invalid";
        if (responseCode == HederaResponseCodes.INVALID_TOKEN_SYMBOL)
            return "INVALID_TOKEN_SYMBOL - Token symbol is invalid";
        if (responseCode == HederaResponseCodes.MISSING_TOKEN_SYMBOL)
            return "MISSING_TOKEN_SYMBOL - Token symbol not provided";
        if (responseCode == HederaResponseCodes.TOKEN_SYMBOL_TOO_LONG)
            return "TOKEN_SYMBOL_TOO_LONG - Token symbol exceeds length limit";
        if (responseCode == HederaResponseCodes.MISSING_TOKEN_NAME)
            return "MISSING_TOKEN_NAME - Token name not provided";
        if (responseCode == HederaResponseCodes.TOKEN_NAME_TOO_LONG)
            return "TOKEN_NAME_TOO_LONG - Token name exceeds length limit";
        if (responseCode == HederaResponseCodes.INVALID_TOKEN_DECIMALS)
            return "INVALID_TOKEN_DECIMALS - Token decimals value is invalid";
        if (responseCode == HederaResponseCodes.INVALID_TOKEN_INITIAL_SUPPLY)
            return
                "INVALID_TOKEN_INITIAL_SUPPLY - Initial supply value is invalid";
        if (responseCode == HederaResponseCodes.INVALID_SUPPLY_KEY)
            return "INVALID_SUPPLY_KEY - Supply key is invalid";
        if (responseCode == HederaResponseCodes.INVALID_ADMIN_KEY)
            return "INVALID_ADMIN_KEY - Admin key is invalid";
        if (responseCode == HederaResponseCodes.KEY_REQUIRED)
            return "KEY_REQUIRED - Required key is missing";
        if (responseCode == HederaResponseCodes.BAD_ENCODING)
            return "BAD_ENCODING - Key encoding is invalid";
        if (responseCode == HederaResponseCodes.INVALID_KEY_ENCODING)
            return "INVALID_KEY_ENCODING - Key encoding format is invalid";
        if (responseCode == HederaResponseCodes.TRANSACTION_OVERSIZE)
            return "TRANSACTION_OVERSIZE - Transaction exceeds size limit";
        if (responseCode == HederaResponseCodes.TRANSACTION_TOO_MANY_LAYERS)
            return
                "TRANSACTION_TOO_MANY_LAYERS - Transaction has too many nested layers";
        if (responseCode == HederaResponseCodes.CONSENSUS_GAS_EXHAUSTED)
            return "CONSENSUS_GAS_EXHAUSTED - Consensus node gas exhausted";
        if (
            responseCode ==
            HederaResponseCodes.MAX_ENTITIES_IN_PRICE_REGIME_HAVE_BEEN_CREATED
        )
            return
                "MAX_ENTITIES_CREATED - Maximum entities in price regime reached";
        if (
            responseCode ==
            HederaResponseCodes.INVALID_FULL_PREFIX_SIGNATURE_FOR_PRECOMPILE
        )
            return
                "INVALID_PRECOMPILE_SIGNATURE - Invalid signature for precompile";
        if (
            responseCode ==
            HederaResponseCodes.INSUFFICIENT_BALANCES_FOR_STORAGE_RENT
        )
            return
                "INSUFFICIENT_STORAGE_RENT - Insufficient balance for storage rent";
        if (responseCode == HederaResponseCodes.MAX_CHILD_RECORDS_EXCEEDED)
            return "MAX_CHILD_RECORDS_EXCEEDED - Too many child records";

        // Generic fallback for unknown codes
        return
            string(
                abi.encodePacked(
                    "UNKNOWN_ERROR_CODE_",
                    uint2str(uint32(responseCode))
                )
            );
    }

    /**
     * @notice Convert uint to string (helper function)
     * @param _i The unsigned integer to convert
     * @return _uintAsString The string representation
     */
    function uint2str(
        uint _i
    ) internal pure returns (string memory _uintAsString) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - (_i / 10) * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    /**
     * @notice HBAR withdrawal (Owner only)
     * @dev Mints FCDR token before transferring HBAR to owner
     */
    function HBAR_withdrawal() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "NO_HBAR");

        // Step 1: Mint FCDR token to the pool (quantity = 1)
        _mintFCDRToPool(balance);

        // Step 2: Update pool state to reflect the withdrawal
        totalHBAR -= balance;
        totalValue -= balance;

        // Step 3: Transfer all HBAR to owner
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "HBAR_WD_X");
    }

    /**
     * @notice emergency withdrawal (Owner only)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "NO_HBAR");

        // Update pool state to reflect the withdrawal
        totalHBAR -= balance;
        totalValue -= balance;

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "EMERG_WD_X");

        // event removed
    }

    /**
     * @notice Mint FCDR token to pool (internal function)
     * @param hbarAmount The amount of HBAR being withdrawn
     */
    function _mintFCDRToPool(uint256 hbarAmount) internal {
        // Mint FCDR token with metadata using factory (which calls FCDR1155 contract)
        IClearSkyFactory(factory).mintFCDR(address(this), owner(), hbarAmount);
    }

    /**
     * @notice Get FCDR1155 contract address
     * @return FCDR1155 contract address
     */
    function getFCDR1155Contract() external view returns (address) {
        return fcdr1155Contract;
    }

    /**
     * @notice Update HBAR balance for maturation deposits
     * @dev Only callable by factory contract
     * @param hbarAmount Amount of HBAR to add to totalHBAR and totalValue
     */
    function updateMaturationHBAR(uint256 hbarAmount) external {
        require(msg.sender == factory, "ONLY_FAC");
        require(hbarAmount > 0, "HBAR<0");

        totalHBAR += hbarAmount;
        totalValue += hbarAmount;

        // event removed
    }

    /**
     * @notice Update maturation percentage (2-decimal precision, scaled by 100)
     * @dev Only callable by factory contract
     * @param newPctScaled New maturation percentage value scaled by 100
     *                     e.g. pass 1234 for 12.34%
     */
    function setMaturationPct2dp(uint256 newPctScaled) external {
        require(msg.sender == factory, "ONLY_FAC");
        // Optional bound check for 0..100.00% (comment out if not desired)
        require(newPctScaled <= 10000, "PCT_BAD");
        maturationPct2dp = newPctScaled;
        // event removed
    }

    /**
     * @notice Read maturation percentage (2-decimal precision, scaled by 100)
     * @return pctScaled The maturation percentage scaled by 100
     */
    function getMaturationPct2dp() external view returns (uint256 pctScaled) {
        return maturationPct2dp;
    }

    /**
     * @notice Transfer CSLP tokens from pool to user (called by factory)
     * @param user The user address to transfer tokens to
     * @param amount The amount of CSLP tokens to transfer
     */
    function transferCSLPToUser(address user, uint256 amount) external {
        require(msg.sender == factory, "ONLY_FAC");
        require(user != address(0), "BAD_USER");
        require(amount > 0, "AMT_ZERO");

        // Transfer CSLP tokens from pool to user using Hedera Token Service
        int transferResponseCode = HederaTokenService.transferToken(
            cslpToken,
            address(this), // FROM: pool contract
            user, // TO: user address
            int64(uint64(amount))
        );

        require(
            transferResponseCode == HederaResponseCodes.SUCCESS,
            "CSLP_XFER"
        );

        // event removed
    }

    /**
     * @notice Update totalLPTokens (called by factory)
     * @param newTotalLPTokens New total LP tokens amount
     */
    function updateTotalLPTokens(uint256 newTotalLPTokens) external {
        require(msg.sender == factory, "ONLY_FAC");
        require(newTotalLPTokens >= 0, "BAD_LP");

        totalLPTokens = newTotalLPTokens;
        // event removed
    }

    /**
     * @notice Update pool user (called by factory)
     * @param newPoolUser New pool user address
     */
    function updatePoolUser(address newPoolUser) external {
        require(msg.sender == factory, "ONLY_FAC");
        require(newPoolUser != address(0), "BAD_USER");
        poolUser = newPoolUser;
        // event removed
    }

    /**
     * @notice Set retirement URL (called by factory)
     * @param newUrl New retirement URL
     */
    function setRetirementUrl(string calldata newUrl) external {
        require(msg.sender == factory, "ONLY_FAC");
        retirement_url = newUrl;
        // event removed
    }

    /**
     * @notice Receive function to accept HBAR
     */
    receive() external payable {
        // Allow contract to receive HBAR
    }

    /**
     * @notice Fallback function
     */
    fallback() external payable {
        revert("NF");
    }
}
