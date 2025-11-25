// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
/// @notice Minimal interface to a Hedera-compatible DEX router (SaucerSwap / HeliSwap etc.)
interface IDexRouter {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
}
/// @notice ERC20 interface for HTS-wrapped USDC on Hedera EVM
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}
/// @title HederaCarbonRetirer
/// @notice Users pay HBAR, contract swaps to USDC on Hedera, emits event for an off-chain relayer.
///         Relayer later confirms Polygon-side retirement via `confirmRetirement`.
contract HederaCarbonRetirer {
    // ----------------- TYPES -----------------
    struct RetirementRequest {
        address hederaUser; // msg.sender on Hedera
        address polygonReceiver; // user’s Polygon EVM address
        uint256 hbarPaid;
        uint256 usdcAmount; // USDC (HTS) equivalent swapped
        uint256 minTons; // user requested minimum carbon tonnes
        string beneficiary;
        string message;
        bool processed; // set true when Polygon retirement confirmed
    }
    // ----------------- STATE -----------------
    address public owner;
    address public relayer; // off-chain agent address on Hedera (EOA or contract)
    IDexRouter public dexRouter; // Hedera DEX router (e.g., Saucer or HeliSwap)
    address public hbarWrapped; // optional, if router needs WHBAR (can be address(0))
    address public usdcHedera; // USDC HTS as ERC20 on Hedera EVM
    uint256 public nextRequestId;
    mapping(uint256 => RetirementRequest) public requests;
    // ----------------- EVENTS -----------------
    /// @notice Emitted when user initiates a retirement via HBAR.
    event RetirementRequested(
        uint256 indexed requestId,
        address indexed hederaUser,
        address indexed polygonReceiver,
        uint256 hbarPaid,
        uint256 usdcAmount,
        uint256 minTons,
        string beneficiary,
        string message
    );
    /// @notice Emitted when relayer confirms Polygon retirement.
    event RetirementConfirmed(
        uint256 indexed requestId,
        string polygonTxHash,
        uint256 retiredTons,
        string detailsURI
    );
    // ----------------- MODIFIERS -----------------
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }
    // ----------------- CONSTRUCTOR -----------------
    constructor(
        address _dexRouter,
        address _usdcHedera,
        address _hbarWrapped,
        address _relayer
    ) {
        owner = msg.sender;
        dexRouter = IDexRouter(_dexRouter);
        usdcHedera = _usdcHedera;
        hbarWrapped = _hbarWrapped;
        relayer = _relayer;
        nextRequestId = 1;
    }
    // ----------------- ADMIN -----------------
    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }
    function setDexRouter(address _dexRouter) external onlyOwner {
        dexRouter = IDexRouter(_dexRouter);
    }
    function setUsdcHedera(address _usdcHedera) external onlyOwner {
        usdcHedera = _usdcHedera;
    }
    // ----------------- MAIN ENTRYPOINT -----------------
    /// @notice User pays HBAR on Hedera to retire NCT/BCT on Polygon.
    /// @param minTons   Minimum tonnes of carbon they expect to retire
    /// @param beneficiary  Name or identifier for retirement certificate
    /// @param message      Optional message (e.g. for whom/what this offset is)
    /// @param polygonReceiver Polygon EVM address that should be linked to this retirement
    function retireWithHBAR(
        uint256 minTons,
        string calldata beneficiary,
        string calldata message,
        address polygonReceiver
    ) external payable {
        require(msg.value > 0, "No HBAR sent");
        require(polygonReceiver != address(0), "Invalid polygonReceiver");
        // 1. Swap HBAR -> USDC on Hedera via DEX
        uint256 usdcAmount = _swapHBARForUSDC(msg.value);
        uint256 requestId = nextRequestId++;
        requests[requestId] = RetirementRequest({
            hederaUser: msg.sender,
            polygonReceiver: polygonReceiver,
            hbarPaid: msg.value,
            usdcAmount: usdcAmount,
            minTons: minTons,
            beneficiary: beneficiary,
            message: message,
            processed: false
        });
        emit RetirementRequested(
            requestId,
            msg.sender,
            polygonReceiver,
            msg.value,
            usdcAmount,
            minTons,
            beneficiary,
            message
        );
    }
    /// @dev Internal swap logic; dev must adjust path + router for chosen DEX on Hedera.
    function _swapHBARForUSDC(
        uint256 hbarAmount
    ) internal returns (uint256 usdcAmount) {
        require(address(dexRouter) != address(0), "DEX router not set");
        require(usdcHedera != address(0), "USDC not set");

        address[] memory path = new address[](2);
        if (hbarWrapped == address(0)) {
            // Some routers (e.g., HeliSwap/SaucerSwap) accept native HBAR by using the zero address sentinel.
            path[0] = address(0);
        } else {
            path[0] = hbarWrapped;
        }
        path[1] = usdcHedera;

        uint256 beforeBalance = IERC20(usdcHedera).balanceOf(address(this));
        // NOTE: amountOutMin set to 0 for simplicity – in production, use real slippage settings!
        dexRouter.swapExactETHForTokens{value: hbarAmount}(
            0,
            path,
            address(this),
            block.timestamp + 900
        );
        uint256 afterBalance = IERC20(usdcHedera).balanceOf(address(this));
        require(afterBalance > beforeBalance, "No USDC received");
        usdcAmount = afterBalance - beforeBalance;
    }
    // ----------------- RELAYER CONFIRMATION -----------------
    /// @notice Called by off-chain relayer when Polygon retirement is successfully completed.
    /// @param requestId      Request identifier from RetirementRequested event
    /// @param polygonTxHash  Tx hash of the Polygon retirement (for reference/traceability)
    /// @param retiredTons    Actual tonnes retired on Polygon
    /// @param detailsURI     URI (e.g. IPFS/HTTPS) with detailed proof
    function confirmRetirement(
        uint256 requestId,
        string calldata polygonTxHash,
        uint256 retiredTons,
        string calldata detailsURI
    ) external onlyRelayer {
        RetirementRequest storage req = requests[requestId];
        require(req.hederaUser != address(0), "Unknown request");
        require(!req.processed, "Already processed");
        req.processed = true;
        emit RetirementConfirmed(
            requestId,
            polygonTxHash,
            retiredTons,
            detailsURI
        );
        // OPTIONAL: Here you could mint an HTS NFT/soulbound token to req.hederaUser
        //           as an on-chain certificate on Hedera.
    }
    // ----------------- RESCUE / HOUSEKEEPING -----------------
    /// @notice Let owner withdraw leftover USDC (e.g. fees) or mistakenly stuck tokens.
    function rescueToken(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(IERC20(token).transfer(to, amount), "transfer failed");
    }
    /// @notice Let owner withdraw native HBAR if somehow stuck.
    function rescueHBAR(address payable to, uint256 amount) external onlyOwner {
        to.transfer(amount);
    }
}
