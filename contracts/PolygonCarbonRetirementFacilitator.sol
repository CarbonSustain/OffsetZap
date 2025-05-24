// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// OpenZeppelin upgradeable base contracts
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

// LayerZero
import "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroReceiver.sol";
import "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";

// Toucan Protocol retirements interface (simplified)
interface IToucanRetirement {
    function retireCarbon(
        address projectToken,
        uint256 amount,
        string calldata beneficiary,
        string calldata beneficiaryAddress,
        string calldata retirementMessage
    ) external returns (bytes32 retirementId);
}

// DEX router interface (QuickSwap/SushiSwap compatible)
interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

contract PolygonCarbonRetirementFacilitator is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    ILayerZeroReceiver
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // ─── Events ───────────────────────────────────────────────────────────────
    event LocalRetirement(
        address indexed user,
        address indexed projectToken,
        uint256 amountToken,
        uint256 amountRetiredTonnes,
        bytes32 retirementId,
        uint256 timestamp
    );
    event CrossChainRetirementProcessed(
        bytes indexed srcChain,
        bytes indexed srcAddress,
        address indexed projectToken,
        uint256 amountToken,
        uint256 amountRetiredTonnes,
        bytes32 retirementId,
        uint256 timestamp
    );
    event RetirementConfirmationSent(
        bytes indexed destChain,
        bytes indexed destAddress,
        bytes32 retirementRequestId,
        bytes32 retirementId,
        uint256 timestamp
    );
    event FeeChanged(uint16 newFeeBps);
    event BridgeEndpointChanged(address newEndpoint);
    event RouterChanged(address newRouter);
    event ToucanRetirementContractChanged(address newToucan);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error ZeroAddress();
    error InvalidFee();
    error SwapFailed();
    error RetirementFailed();
    error UnauthorizedCaller();
    error InsufficientAmount();
    error EndpointNotSet();

    // ─── State Variables ─────────────────────────────────────────────────────
    // LayerZero endpoint for sending/receiving cross-chain messages
    ILayerZeroEndpoint public lzEndpoint;
    // Authorized BaseCarbonBridge address on this chain
    bytes public authorizedBridgeAddress;
    // DEX router (QuickSwap / SushiSwap)
    IUniswapV2Router public router;
    // Toucan retirement contract
    IToucanRetirement public toucanRetirement;
    // Fee in basis points (default 100 = 1%)
    uint16 public feeBps;
    // Fee recipient
    address public feeRecipient;

    // ─── Structs ──────────────────────────────────────────────────────────────
    struct RetirementRequest {
        address projectToken;
        uint256 amountToken;
        string beneficiary;
        string beneficiaryAddress;
        string message;
    }

    // ─── Initializer ──────────────────────────────────────────────────────────
    /// @notice Initialize the contract (replaces constructor for proxies)
    /// @param _endpoint LayerZero endpoint address
    /// @param _bridgeAddress Encoded address of BaseCarbonBridge on source chain
    /// @param _router QuickSwap/SushiSwap router
    /// @param _toucan Toucan retirement contract
    /// @param _feeRecipient Address to collect fees
    /// @param _feeBps Fee in basis points (max 1000 = 10%)
    function initialize(
        address _endpoint,
        bytes calldata _bridgeAddress,
        address _router,
        address _toucan,
        address _feeRecipient,
        uint16 _feeBps
    ) external initializer {
        if (_endpoint == address(0) || _router == address(0) || _toucan == address(0) || _feeRecipient == address(0))
            revert ZeroAddress();
        if (_feeBps > 1000) revert InvalidFee();

        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        lzEndpoint = ILayerZeroEndpoint(_endpoint);
        authorizedBridgeAddress = _bridgeAddress;
        router = IUniswapV2Router(_router);
        toucanRetirement = IToucanRetirement(_toucan);
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
    }

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyBridge() {
        // msg.sender is the LayerZero endpoint
        // _fromAddress is validated in lzReceive
        _;
    }

    // ─── External Admin Functions ─────────────────────────────────────────────
    /// @notice Update the LayerZero endpoint
    function setEndpoint(address _endpoint) external onlyOwner {
        if (_endpoint == address(0)) revert ZeroAddress();
        lzEndpoint = ILayerZeroEndpoint(_endpoint);
        emit BridgeEndpointChanged(_endpoint);
    }

    /// @notice Update DEX router
    function setRouter(address _router) external onlyOwner {
        if (_router == address(0)) revert ZeroAddress();
        router = IUniswapV2Router(_router);
        emit RouterChanged(_router);
    }

    /// @notice Update Toucan retirement contract
    function setToucanRetirement(address _toucan) external onlyOwner {
        if (_toucan == address(0)) revert ZeroAddress();
        toucanRetirement = IToucanRetirement(_toucan);
        emit ToucanRetirementContractChanged(_toucan);
    }

    /// @notice Update fee basis points (max 10%)
    function setFeeBps(uint16 _feeBps) external onlyOwner {
        if (_feeBps > 1000) revert InvalidFee();
        feeBps = _feeBps;
        emit FeeChanged(_feeBps);
    }

    /// @notice Update fee recipient
    function setFeeRecipient(address _recipient) external onlyOwner {
        if (_recipient == address(0)) revert ZeroAddress();
        feeRecipient = _recipient;
    }

    /// @notice Emergency withdraw ERC20
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        IERC20Upgradeable(token).safeTransfer(to, amount);
    }

    // ─── Core Logic ────────────────────────────────────────────────────────────

    /// @notice Perform a direct retirement on Polygon.
    /// @param projectToken Toucan project token (TCO2/BCT/NCT)
    /// @param amountToken Amount of project tokens to retire
    /// @param beneficiary Name or description of beneficiary
    /// @param beneficiaryAddress Identifier (e.g. email or wallet) for beneficiary
    /// @param message Optional retirement message
    function retireLocal(
        address projectToken,
        uint256 amountToken,
        string calldata beneficiary,
        string calldata beneficiaryAddress,
        string calldata message
    ) external nonReentrant {
        if (amountToken == 0) revert InsufficientAmount();
        // Transfer in project tokens
        IERC20Upgradeable(projectToken).safeTransferFrom(msg.sender, address(this), amountToken);

        // Calculate and collect fee
        uint256 fee = (amountToken * feeBps) / 10000;
        if (fee > 0) {
            IERC20Upgradeable(projectToken).safeTransfer(feeRecipient, fee);
        }
        uint256 netAmount = amountToken - fee;

        // Approve Toucan and retire
        IERC20Upgradeable(projectToken).safeApprove(address(toucanRetirement), netAmount);
        bytes32 retirementId = toucanRetirement.retireCarbon(
            projectToken,
            netAmount,
            beneficiary,
            beneficiaryAddress,
            message
        );

        // Note: Toucan emits its own event with tonnes retired. We log for off-chain tracking.
        emit LocalRetirement(
            msg.sender,
            projectToken,
            netAmount,
            netAmount, // we assume 1 token = 1 tonne in this interface
            retirementId,
            block.timestamp
        );
    }

    /// @notice Receive cross-chain retirement requests from BaseCarbonBridge.
    /// @param _srcChainId LayerZero source chain identifier
    /// @param _srcAddress LayerZero-encoded source contract address
    /// @param _payload ABI-encoded RetirementRequest
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64, /*_nonce*/
        bytes calldata _payload
    ) external override nonReentrant {
        if (msg.sender != address(lzEndpoint)) revert UnauthorizedCaller();
        if (_srcAddress.length != authorizedBridgeAddress.length || keccak256(_srcAddress) != keccak256(authorizedBridgeAddress))
            revert UnauthorizedCaller();

        // Decode the payload
        RetirementRequest memory req = abi.decode(_payload, (RetirementRequest));
        if (req.amountToken == 0) revert InsufficientAmount();

        // Pull tokens from this contract's balance (assumes BaseBridge pre-funded)
        IERC20Upgradeable(req.projectToken).safeTransferFrom(address(this), address(this), req.amountToken);
        // Collect fee
        uint256 fee = (req.amountToken * feeBps) / 10000;
        if (fee > 0) {
            IERC20Upgradeable(req.projectToken).safeTransfer(feeRecipient, fee);
        }
        uint256 netAmount = req.amountToken - fee;

        // Approve & retire
        IERC20Upgradeable(req.projectToken).safeApprove(address(toucanRetirement), netAmount);
        bytes32 retirementId = toucanRetirement.retireCarbon(
            req.projectToken,
            netAmount,
            req.beneficiary,
            req.beneficiaryAddress,
            req.message
        );

        emit CrossChainRetirementProcessed(
            abi.encodePacked(_srcChainId),
            _srcAddress,
            req.projectToken,
            netAmount,
            netAmount,
            retirementId,
            block.timestamp
        );

        // Send confirmation back to Base
        _sendConfirmation(_srcChainId, _srcAddress, retirementId);
    }

    /// @dev Internal helper to send a confirmation back to the source chain
    function _sendConfirmation(
        uint16 _dstChainId,
        bytes memory _dstAddress,
        bytes32 _retirementId
    ) internal {
        bytes memory confirmationPayload = abi.encode(_retirementId);
        // We pay the LayerZero fee in native MATIC (msg.value must cover this; here we assume owner tops up)
        lzEndpoint.send{value: msg.value}(
            _dstChainId,
            _dstAddress,
            confirmationPayload,
            payable(msg.sender),
            address(0),
            bytes("")
        );
        emit RetirementConfirmationSent(_dstChainId == 0 ? "" : abi.encodePacked(_dstChainId), _dstAddress, _retirementId, _retirementId, block.timestamp);
    }

    // ─── UUPS Authorizer ────────────────────────────────────────────────────────
    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── Fallback to receive native fees ───────────────────────────────────────
    receive() external payable {}
}

