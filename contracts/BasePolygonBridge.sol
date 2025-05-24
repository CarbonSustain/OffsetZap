// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title BaseCarbonBridge
 * @dev Upgradeable contract on Base chain for cross-chain carbon credit retirement to Celo & Polygon via LayerZero.
 *      Accepts native ETH and USDC, locks funds, sends retirement requests cross-chain, tracks statuses,
 *      and stores proofs on completion.
 */

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./interfaces/ILayerZeroReceiver.sol";
import "./interfaces/ILayerZeroEndpoint.sol";

contract BaseCarbonBridge is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    ILayerZeroReceiver
{
    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    event RetirementInitiated(
        uint256 indexed requestId,
        address indexed user,
        uint256 amountBase,           // in wei or USDC smallest unit
        uint16 dstChainId,
        string carbonType,
        address beneficiary
    );
    event RetirementCompleted(
        uint256 indexed requestId,
        address indexed user,
        uint256 amountBase,
        uint16 srcChainId,
        bytes proof
    );
    event FeesWithdrawn(address to, uint256 amount);
    event FeePercentUpdated(uint16 newFeeBps);
    event EndpointUpdated(address newEndpoint);
    event EmergencyWithdrawn(address token, address to, uint256 amount);

    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------
    error InvalidCarbonType();
    error InvalidChain();
    error ZeroAmount();
    error ZeroAddress();
    error NotLZEndpoint();
    error AlreadyCompleted();
    error InsufficientValue();
    error TransferFailed();
    error Unauthorized();

    /// -----------------------------------------------------------------------
    /// Structs & Enums
    /// -----------------------------------------------------------------------
    struct RetirementRequest {
        address user;
        uint256 amount;        // in base chain currency
        uint16 dstChainId;
        string carbonType;
        address beneficiary;
        bool completed;
        bytes proof;
    }

    /// -----------------------------------------------------------------------
    /// State Variables
    /// -----------------------------------------------------------------------

    // LayerZero endpoint on Base
    ILayerZeroEndpoint public lzEndpoint;

    // USDC on Base
    IERC20Upgradeable public usdc;

    // Fee in basis points (default 100 = 1%)
    uint16 public feeBps;

    // auto-incremented request counter
    uint256 public nextRequestId;

    // Mapping requestId => RetirementRequest
    mapping(uint256 => RetirementRequest) public requests;

    // Supported carbon credit types
    mapping(string => bool) public supportedCarbonTypes;

    // Supported destination chain IDs
    mapping(uint16 => bool) public supportedChains;

    /// -----------------------------------------------------------------------
    /// Modifiers
    /// -----------------------------------------------------------------------
    modifier onlyEndpoint() {
        if (msg.sender != address(lzEndpoint)) revert NotLZEndpoint();
        _;
    }

    /// -----------------------------------------------------------------------
    /// Initialization
    /// -----------------------------------------------------------------------
    /**
     * @dev Initialize contract with LayerZero endpoint & USDC address.
     * @param _endpoint LayerZero Endpoint
     * @param _usdc USDC token address on Base
     */
    function initialize(address _endpoint, address _usdc) external initializer {
        if (_endpoint == address(0) || _usdc == address(0)) revert ZeroAddress();
        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        lzEndpoint = ILayerZeroEndpoint(_endpoint);
        usdc = IERC20Upgradeable(_usdc);
        feeBps = 100; //1%
        nextRequestId = 1;

        // default supported chains: Celo = 26, Polygon = 109
        supportedChains[26] = true;
        supportedChains[109] = true;

        // default supported carbon types
        supportedCarbonTypes["toucan_bct"] = true;
        supportedCarbonTypes["toucan_nct"] = true;
        supportedCarbonTypes["klima_bct"] = true;
    }

    /// -----------------------------------------------------------------------
    /// Public Functions
    /// -----------------------------------------------------------------------

    /**
     * @notice Initiate a carbon credit retirement request.
     * @dev User must send native ETH (msg.value) for ETH highways or approve & transfer USDC before calling for USDC.
     * @param useUSDC Set true to use USDC, false for native ETH
     * @param amount Amount of base asset (wei or USDC smallest unit)
     * @param dstChainId Destination LayerZero chain ID (Celo=26, Polygon=109)
     * @param carbonType One of supported carbon credit types
     * @param beneficiary Address on destination chain to retire to
     */
    function initiateRetirement(
        bool useUSDC,
        uint256 amount,
        uint16 dstChainId,
        string calldata carbonType,
        address beneficiary
    ) external payable nonReentrant returns (uint256 requestId) {
        if (amount == 0) revert ZeroAmount();
        if (!supportedChains[dstChainId]) revert InvalidChain();
        if (!supportedCarbonTypes[carbonType]) revert InvalidCarbonType();
        if (beneficiary == address(0)) revert ZeroAddress();

        // handle payment
        uint256 paid;
        if (useUSDC) {
            // user must have approved
            usdc.transferFrom(msg.sender, address(this), amount);
            paid = amount;
        } else {
            // native ETH
            if (msg.value != amount) revert InsufficientValue();
            paid = msg.value;
        }

        // compute and deduct fees
        uint256 fee = (paid * feeBps) / 10_000;
        uint256 netAmount = paid - fee;

        // store request
        requestId = nextRequestId++;
        RetirementRequest storage r = requests[requestId];
        r.user = msg.sender;
        r.amount = netAmount;
        r.dstChainId = dstChainId;
        r.carbonType = carbonType;
        r.beneficiary = beneficiary;

        // encode payload: abi.encode(requestId, user, netAmount, carbonType, beneficiary)
        bytes memory payload = abi.encode(
            requestId,
            msg.sender,
            netAmount,
            carbonType,
            beneficiary
        );

        // send cross-chain message
        lzEndpoint.send{value: msg.value - (useUSDC ? 0 : fee)}(
            dstChainId,
            abi.encodePacked(address(this)),
            payload,
            payable(msg.sender),
            address(0),
            bytes("")
        );

        emit RetirementInitiated(requestId, msg.sender, netAmount, dstChainId, carbonType, beneficiary);
    }

    /**
     * @inheritdoc ILayerZeroReceiver
     * @dev LayerZero endpoint calls this when a message arrives from another chain.
     *      Expected payload: abi.encode(requestId, completedProof)
     */
    function lzReceive(
        uint16 srcChainId,
        bytes calldata,            // srcAddress
        uint64,                    // nonce
        bytes calldata payload
    ) external override onlyEndpoint nonReentrant {
        (uint256 requestId, bytes memory proof) = abi.decode(payload, (uint256, bytes));
        RetirementRequest storage r = requests[requestId];

        if (r.completed) revert AlreadyCompleted();
        r.completed = true;
        r.proof = proof;

        emit RetirementCompleted(requestId, r.user, r.amount, srcChainId, proof);
    }

    /// -----------------------------------------------------------------------
    /// View Functions
    /// -----------------------------------------------------------------------

    /**
     * @notice Returns status & proof of a given request
     * @param requestId The retirement request ID
     */
    function getRequest(uint256 requestId)
        external
        view
        returns (
            address user,
            uint256 amount,
            uint16 dstChainId,
            string memory carbonType,
            address beneficiary,
            bool completed,
            bytes memory proof
        )
    {
        RetirementRequest storage r = requests[requestId];
        return (r.user, r.amount, r.dstChainId, r.carbonType, r.beneficiary, r.completed, r.proof);
    }

    /// -----------------------------------------------------------------------
    /// Admin Functions
    /// -----------------------------------------------------------------------

    /**
     * @notice Withdraw accumulated fees (ETH & USDC) to owner
     * @param to Recipient address
     */
    function withdrawFees(address payable to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        // withdraw native ETH
        uint256 balEth = address(this).balance;
        if (balEth > 0) {
            (bool sent,) = to.call{value: balEth}("");
            if (!sent) revert TransferFailed();
        }

        // withdraw USDC
        uint256 balUsdc = usdc.balanceOf(address(this));
        if (balUsdc > 0) {
            usdc.transfer(to, balUsdc);
        }

        emit FeesWithdrawn(to, balEth + balUsdc);
    }

    /**
     * @notice Owner can add/remove supported carbon types
     */
    function setCarbonType(string calldata carbonType, bool enabled) external onlyOwner {
        supportedCarbonTypes[carbonType] = enabled;
    }

    /**
     * @notice Owner can add/remove supported destination chains
     */
    function setSupportedChain(uint16 chainId, bool enabled) external onlyOwner {
        supportedChains[chainId] = enabled;
    }

    /**
     * @notice Update fee BPS (max 1000 = 10%)
     */
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high");
        feeBps = newFeeBps;
        emit FeePercentUpdated(newFeeBps);
    }

    /**
     * @notice Update LayerZero endpoint
     */
    function setEndpoint(address newEndpoint) external onlyOwner {
        if (newEndpoint == address(0)) revert ZeroAddress();
        lzEndpoint = ILayerZeroEndpoint(newEndpoint);
        emit EndpointUpdated(newEndpoint);
    }

    /// -----------------------------------------------------------------------
    /// Emergency Functions
    /// -----------------------------------------------------------------------

    /**
     * @notice Emergency withdraw stuck tokens or ETH
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();

        if (token == address(0)) {
            // withdraw ETH
            (bool sent,) = to.call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20Upgradeable(token).transfer(to, amount);
        }

        emit EmergencyWithdrawn(token, to, amount);
    }

    /// -----------------------------------------------------------------------
    /// Upgradeability
    /// -----------------------------------------------------------------------

    function _authorizeUpgrade(address) internal override onlyOwner {}

    /// -----------------------------------------------------------------------
    /// Fallback to accept native ETH payments
    /// -----------------------------------------------------------------------
    receive() external payable {}
}