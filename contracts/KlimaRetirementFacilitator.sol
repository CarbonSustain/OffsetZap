// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Enable IR-based code generation to handle stack too deep errors
pragma experimental ABIEncoderV2;

// OpenZeppelin Upgradeable
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// ERC20
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// LayerZero
import "./interfaces/ILayerZeroReceiver.sol";
import "./interfaces/ILayerZeroEndpoint.sol";

// KlimaDAO Interfaces
import "./interfaces/IRetirementAggregator.sol";
import "./interfaces/ICarbonPool.sol";

// SushiSwap Router
import "./interfaces/ISushiSwapRouter.sol";

/// @title KlimaRetirementFacilitator
/// @notice Upgradeable contract on Polygon that accepts cross-chain retirement requests from BaseCarbonBridge,
///         purchases KLIMA via SushiSwap, retires BCT/NCT via KlimaDAO, tracks, and confirms back to Base.
contract KlimaRetirementFacilitator is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    ILayerZeroReceiver
{
    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    /// @notice Emitted when a direct local retirement occurs
    event LocalRetired(
        uint256 indexed retireId,
        address indexed user,
        uint256 klimaUsed,
        uint256 carbonAmount,
        address carbonPool,
        address beneficiary,
        string carbonType,
        uint256 timestamp
    );
    /// @notice Emitted when a cross-chain retirement is processed
    event CrossChainRetired(
        uint256 indexed requestId,
        address indexed user,
        uint256 klimaUsed,
        uint256 carbonAmount,
        address carbonPool,
        address beneficiary,
        string carbonType,
        uint16 srcChainId,
        uint256 timestamp
    );
    /// @notice Emitted when a confirmation is sent back to Base
    event RetirementConfirmed(
        uint256 indexed requestId,
        uint16 dstChainId,
        bytes payload,
        uint256 timestamp
    );
    /// @notice Emitted when admin parameters are updated
    event ConfigUpdated();
    /// @notice Emitted when fees are withdrawn
    event FeesWithdrawn(address to, uint256 amount);
    /// @notice Emitted on emergency withdraw
    event EmergencyWithdraw(address token, address to, uint256 amount);

    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------
    error ZeroAddress();
    error ZeroAmount();
    error Unauthorized();
    error SwapFailed();
    error RetirementFailed();
    error InvalidCarbonType();
    error OnlyBridge();

    /// -----------------------------------------------------------------------
    /// Structs
    /// -----------------------------------------------------------------------
    struct RetirementRecord {
        address user;
        uint256 klimaUsed;
        uint256 carbonAmount;    // tons retired
        address pool;            // BCT or NCT pool
        address beneficiary;
        string carbonType;       // "BCT" or "NCT"
        uint16 srcChain;         // source chain for cross‐chain
        bool fulfilled;
    }

    // New struct to handle stack too deep errors
    struct RetirementParams {
        uint256 requestId;
        address user;
        uint256 klimaAmount;
        uint256 carbonTons;
        address poolAddress;
        address beneficiary;
        string carbonType;
        uint16 srcChainId;
    }

    // New struct for payload decoding to reduce local variables
    struct PayloadData {
        uint256 requestId;
        address user;
        string carbonType;
        address beneficiary;
        uint256 amountBase;
    }

    /// -----------------------------------------------------------------------
    /// State Variables
    /// -----------------------------------------------------------------------
    ILayerZeroEndpoint public lzEndpoint;
    address public baseBridge;                  // trusted BaseCarbonBridge address
    ISushiSwapRouter public swapRouter;         // SushiSwap Router
    IRetirementAggregator public aggregator;    // KlimaDAO RetirementAggregator
    ICarbonPool public poolBCT;                 // KlimaDAO BCT pool
    ICarbonPool public poolNCT;                 // KlimaDAO NCT pool
    IERC20 public KLIMA;                        // KLIMA token
    uint16 public feeBps;                       // fee in bps (default 100)
    uint256 public nextRetireId;                // incremental local retirement ID

    mapping(uint256 => RetirementRecord) public records; // retireId/requestId => record

    /// -----------------------------------------------------------------------
    /// Modifiers
    /// -----------------------------------------------------------------------
    modifier onlyBridge() {
        if (msg.sender != baseBridge) revert OnlyBridge();
        _;
    }
    
    modifier onlyEndpoint() {
        if (msg.sender != address(lzEndpoint)) revert Unauthorized();
        _;
    }

    /// -----------------------------------------------------------------------
    /// Initialization
    /// -----------------------------------------------------------------------
    /// @notice Initialize the facilitator
    /// @param _endpoint LayerZero endpoint on Polygon
    /// @param _bridge BaseCarbonBridge address on Base
    /// @param _router SushiSwap router
    /// @param _aggregator KlimaDAO RetirementAggregator
    /// @param _poolBCT KlimaDAO BCT pool
    /// @param _poolNCT KlimaDAO NCT pool
    /// @param _klima KLIMA token
    function initialize(
        address _endpoint,
        address _bridge,
        address _router,
        address _aggregator,
        address _poolBCT,
        address _poolNCT,
        address _klima
    ) external initializer {
        if (
            _endpoint == address(0) ||
            _bridge == address(0) ||
            _router == address(0) ||
            _aggregator == address(0) ||
            _poolBCT == address(0) ||
            _poolNCT == address(0) ||
            _klima == address(0)
        ) revert ZeroAddress();

        __Ownable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        lzEndpoint    = ILayerZeroEndpoint(_endpoint);
        baseBridge    = _bridge;
        swapRouter    = ISushiSwapRouter(_router);
        aggregator    = IRetirementAggregator(_aggregator);
        poolBCT       = ICarbonPool(_poolBCT);
        poolNCT       = ICarbonPool(_poolNCT);
        KLIMA         = IERC20(_klima);

        feeBps        = 100; // 1%
        nextRetireId  = 1;
    }

    /// -----------------------------------------------------------------------
    /// External Functions
    /// -----------------------------------------------------------------------
    /// @notice Directly retire carbon on Polygon using native MATIC => swap to KLIMA => retire
    /// @param carbonType "BCT" or "NCT"
    /// @param beneficiary Address receiving carbon retirement credit
    function retireLocal(
        string calldata carbonType,
        address beneficiary
    ) external payable nonReentrant returns (uint256 retireId) {
        if (msg.value == 0) revert ZeroAmount();
        if (beneficiary == address(0)) revert ZeroAddress();

        // Deduct fee
        uint256 fee    = (msg.value * feeBps) / 10_000;
        uint256 amount = msg.value - fee;

        // Swap MATIC -> KLIMA via SushiSwap
        address[] memory path = new address[](2);
        path[0] = swapRouter.WETH();
        path[1] = address(KLIMA);
        uint256[] memory amounts = swapRouter.swapExactETHForTokens{value: amount}(
            0,
            path,
            address(this),
            block.timestamp
        );
        uint256 klimaAmount = amounts[amounts.length - 1];
        if (klimaAmount == 0) revert SwapFailed();

        // Retire via aggregator
        ICarbonPool pool = _poolByType(carbonType);
        // Call retireExactCarbon and ignore the return value since we're not using it
        aggregator.retireExactCarbon(
            pool,
            klimaAmount,
            beneficiary
        );
        // retrieve carbon retired via pool conversion rate
        uint256 carbonTons = pool.tonnesRetired(beneficiary);

        // store record
        retireId = nextRetireId++;
        records[retireId] = RetirementRecord({
            user: msg.sender,
            klimaUsed: klimaAmount,
            carbonAmount: carbonTons,
            pool: address(pool),
            beneficiary: beneficiary,
            carbonType: carbonType,
            srcChain: 137, // Polygon chainId
            fulfilled: true
        });

        emit LocalRetired(
            retireId,
            msg.sender,
            klimaAmount,
            carbonTons,
            address(pool),
            beneficiary,
            carbonType,
            block.timestamp
        );
    }

    /// @inheritdoc ILayerZeroReceiver
    /// @notice Process a cross-chain retirement request from BaseCarbonBridge
    ///         payload: abi.encode(requestId, user, carbonType, beneficiary, amountBase)
    function lzReceive(
        uint16 srcChainId,
        bytes calldata,       // srcAddress
        uint64,               // nonce
        bytes calldata payload
    ) external override onlyEndpoint nonReentrant {
        // Process the cross-chain request in a separate function to avoid stack too deep error
        _processCrossChainRequest(srcChainId, payload);
    }
    
    /// @dev Internal function to process cross-chain retirement requests
    /// @param srcChainId The source chain ID
    /// @param payload The encoded payload from the source chain
    function _processCrossChainRequest(uint16 srcChainId, bytes calldata payload) internal {
        // Store the current ETH balance that was sent with the message
        uint256 receivedValue = address(this).balance;
        
        // Decode payload into a struct to reduce local variables
        PayloadData memory data = _decodePayload(payload);
        
        // Process retirement and get results
        (bytes32 proof, ) = _processAndRecordRetirement(srcChainId, data);
        
        // Calculate fee
        uint256 fee = (data.amountBase * feeBps) / 10_000;
        
        // Send confirmation back to Base
        _sendConfirmation(data.requestId, proof, receivedValue - fee);
        
        emit RetirementConfirmed(data.requestId, uint16(1), abi.encode(data.requestId, proof), block.timestamp);
    }
    
    /// @dev Decode the payload into a struct to reduce local variables
    function _decodePayload(bytes calldata payload) internal pure returns (PayloadData memory data) {
        (data.requestId, data.user, data.carbonType, data.beneficiary, data.amountBase) =
            abi.decode(payload, (uint256, address, string, address, uint256));
        return data;
    }
    
    /// @dev Process retirement and record it
    function _processAndRecordRetirement(uint16 srcChainId, PayloadData memory data) 
        internal returns (bytes32 proof, RetirementParams memory params) {
        // Process the retirement
        uint256 klimaAmount;
        uint256 carbonTons;
        address poolAddress;
        
        // Deduct fee
        uint256 fee = (data.amountBase * feeBps) / 10_000;
        uint256 amount = data.amountBase - fee;
        
        // Swap tokens
        address[] memory path = new address[](2);
        path[0] = swapRouter.WETH();
        path[1] = address(KLIMA);
        uint256[] memory amounts = swapRouter.swapExactETHForTokens{value: amount}(
            0,
            path,
            address(this),
            block.timestamp
        );
        klimaAmount = amounts[1];
        if (klimaAmount == 0) revert SwapFailed();
        
        // Retire carbon
        ICarbonPool pool = _poolByType(data.carbonType);
        poolAddress = address(pool);
        proof = aggregator.retireExactCarbon(pool, klimaAmount, data.beneficiary);
        carbonTons = pool.tonnesRetired(data.beneficiary);
        
        // Create params struct
        params = RetirementParams({
            requestId: data.requestId,
            user: data.user,
            klimaAmount: klimaAmount,
            carbonTons: carbonTons,
            poolAddress: poolAddress,
            beneficiary: data.beneficiary,
            carbonType: data.carbonType,
            srcChainId: srcChainId
        });
        
        // Record the retirement
        _recordRetirement(params);
        
        return (proof, params);
    }
    
    /// @dev Record a retirement in storage
    function _storeRetirementRecord(RetirementParams memory params) internal {
        // Record it
        records[params.requestId] = RetirementRecord({
            user: params.user,
            klimaUsed: params.klimaAmount,
            carbonAmount: params.carbonTons,
            pool: params.poolAddress,
            beneficiary: params.beneficiary,
            carbonType: params.carbonType,
            srcChain: params.srcChainId,
            fulfilled: true
        });
    }
    
    /// @dev Emit the CrossChainRetired event
    function _emitCrossChainRetired(RetirementParams memory params) internal {
        emit CrossChainRetired(
            params.requestId,
            params.user,
            params.klimaAmount,
            params.carbonTons,
            params.poolAddress,
            params.beneficiary,
            params.carbonType,
            params.srcChainId,
            block.timestamp
        );
    }
    
    /// @dev Record a retirement and emit event using a struct to avoid stack too deep
    function _recordRetirement(RetirementParams memory params) internal {
        // Store the record
        _storeRetirementRecord(params);
        
        // Emit the event
        _emitCrossChainRetired(params);
    }

    /// -----------------------------------------------------------------------
    /// Admin & Config
    /// -----------------------------------------------------------------------
    /// @notice Update fee BPS (max 500 = 5%)
    function setFeeBps(uint16 _bps) external onlyOwner {
        if (_bps > 500) revert Unauthorized();
        feeBps = _bps;
        emit ConfigUpdated();
    }

    /// @notice Update Base bridge address
    function setBaseBridge(address _bridge) external onlyOwner {
        if (_bridge == address(0)) revert ZeroAddress();
        baseBridge = _bridge;
        emit ConfigUpdated();
    }

    /// @notice Withdraw collected fees (native MATIC)
    function withdrawFees(address payable to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = address(this).balance;
        to.transfer(bal);
        emit FeesWithdrawn(to, bal);
    }

    /// @notice Emergency withdraw any ERC20 or native
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "ETH transfer failed");
        } else {
            IERC20(token).transfer(to, amount);
        }
        emit EmergencyWithdraw(token, to, amount);
    }

    /// -----------------------------------------------------------------------
    /// Internal & Utils
    /// -----------------------------------------------------------------------
    function _poolByType(string memory carbonType) internal view returns (ICarbonPool) {
        bytes32 t = keccak256(bytes(carbonType));
        if (t == keccak256("BCT")) return poolBCT;
        if (t == keccak256("NCT")) return poolNCT;
        revert InvalidCarbonType();
    }

    /// @dev Send confirmation back to Base chain
    /// @param requestId The original request ID
    /// @param proof The retirement proof
    /// @param value The amount of ETH to send with the message
    function _sendConfirmation(uint256 requestId, bytes32 proof, uint256 value) internal {
        bytes memory confirmation = abi.encode(requestId, proof);
        lzEndpoint.send{value: value}(
            uint16(1),                      // Base chain ID (LayerZero)
            abi.encodePacked(baseBridge),   // destination
            confirmation,
            payable(address(this)),
            address(0),
            bytes("")
        );
    }

    /// @dev Required by UUPS
    function _authorizeUpgrade(address) internal override onlyOwner {}

    receive() external payable {}    // accept native for swap/retire
}
