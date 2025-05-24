// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
   CarbonRetirementFacilitatorCeloUpgradeable.sol

   An upgradeable facilitator for Toucan protocol retirements on Celo,
   extended with LayerZero cross-chain message reception from a Base bridge
   and confirmation messages back to Base.

   Key features:
   - Direct retirements via purchaseAndRetire()
   - Fee-on-top mechanism
   - Admin controls (owner-only)
   - LayerZero integration (ILayerZeroReceiver) for cross-chain retirements
   - Validation of incoming messages from the authorized Base bridge
   - Emission of CrossChainRetirementReceived and CrossChainRetirementCompleted
   - Confirmation messages sent back to Base
   - ReentrancyGuard and Checks-Effects-Interactions pattern
*/

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroReceiver.sol";
import "@layerzerolabs/solidity-examples/contracts/interfaces/ILayerZeroEndpoint.sol";
import "./interfaces/IToucanContractRegistry.sol";
import "./interfaces/ICarbonProjectVintages.sol";
import "./interfaces/IRetirementCertificate.sol";

/**
 * @title CarbonRetirementFacilitatorCeloUpgradeable
 * @notice Processes Toucan retirements on Celo, supports direct and cross-chain
 * @dev Upgradeable. Integrates LayerZero for cross-chain messages.
 */
contract CarbonRetirementFacilitatorCeloUpgradeable is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    ILayerZeroReceiver
{
    /// -----------------------------------------------------------------------
    /// Errors
    /// -----------------------------------------------------------------------
    error ZeroAddressNotAllowed();
    error InvalidFee();
    error UnauthorizedBridge();
    error InvalidPayload();
    error RetirementFailed();
    error ConfirmationFailed();
    error SendingMessageFailed();

    /// -----------------------------------------------------------------------
    /// Events
    /// -----------------------------------------------------------------------
    event FeeUpdated(uint256 newFeeBasisPoints);
    event DirectRetirement(
        address indexed beneficiary,
        address indexed projectVintage,
        uint256 amount,
        string retireMessage
    );
    event CrossChainRetirementReceived(
        uint16 srcChainId,
        bytes srcAddress,
        address beneficiary,
        address projectVintage,
        uint256 amount,
        string retireMessage
    );
    event CrossChainRetirementCompleted(
        uint16 dstChainId,
        bytes dstAddress,
        address beneficiary,
        address projectVintage,
        uint256 amount,
        string retireMessage
    );

    /// -----------------------------------------------------------------------
    /// Storage
    /// -----------------------------------------------------------------------
    // Toucan registry to look up contract addresses
    IToucanContractRegistry public registry;
    // Fee in basis points (e.g., 50 = 0.5%)
    uint256 public feeBasisPoints;
    // LayerZero endpoint for Celo
    ILayerZeroEndpoint public lzEndpoint;
    // Authorized bridge address on Base (as bytes)
    bytes public authorizedBridgeAddress;
    // Destination Chain ID for confirmations (Base chain ID)
    uint16 public baseChainId;

    /// -----------------------------------------------------------------------
    /// Modifiers
    /// -----------------------------------------------------------------------
    modifier nonZeroAddress(address _addr) {
        if (_addr == address(0)) revert ZeroAddressNotAllowed();
        _;
    }

    modifier onlyBridge(uint16 _srcChainId, bytes calldata _srcAddress) {
        // Validate chain ID
        if (_srcChainId != baseChainId || keccak256(_srcAddress) != keccak256(authorizedBridgeAddress))
            revert UnauthorizedBridge();
        _;
    }

    /// -----------------------------------------------------------------------
    /// Initialization
    /// -----------------------------------------------------------------------
    /**
     * @notice Initialize the facilitator
     * @param _registry Toucan contract registry
     * @param _feeBasisPoints fee on top of retirement amount
     * @param _lzEndpoint LayerZero endpoint on Celo
     * @param _baseChainId LayerZero chain ID for Base
     * @param _authorizedBridgeAddress the Base bridge address (bytes)
     */
    function initialize(
        address _registry,
        uint256 _feeBasisPoints,
        address _lzEndpoint,
        uint16 _baseChainId,
        bytes calldata _authorizedBridgeAddress
    ) external initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        registry = IToucanContractRegistry(_registry);
        _setFee(_feeBasisPoints);
        lzEndpoint = ILayerZeroEndpoint(_lzEndpoint);
        baseChainId = _baseChainId;
        authorizedBridgeAddress = _authorizedBridgeAddress;
    }

    /// -----------------------------------------------------------------------
    /// Admin functions
    /// -----------------------------------------------------------------------
    /**
     * @notice Update fee in basis points
     * @param _newFeeBasisPoints new fee (bps)
     */
    function setFee(uint256 _newFeeBasisPoints) external onlyOwner {
        _setFee(_newFeeBasisPoints);
    }

    function _setFee(uint256 _bps) internal {
        if (_bps > 10_000) revert InvalidFee();
        feeBasisPoints = _bps;
        emit FeeUpdated(_bps);
    }

    /**
     * @notice Update authorized bridge parameters
     * @param _chainId LayerZero chain ID for Base
     * @param _bridgeAddress Base bridge address in bytes
     */
    function setBridgeConfig(uint16 _chainId, bytes calldata _bridgeAddress) external onlyOwner {
        baseChainId = _chainId;
        authorizedBridgeAddress = _bridgeAddress;
    }

    /// -----------------------------------------------------------------------
    /// Direct retirement
    /// -----------------------------------------------------------------------
    /**
     * @notice Purchase and retire a Toucan carbon token
     * @param projectVintage address of project vintage
     * @param amount amount of TCO2 tokens
     * @param retireMessage optional retirement message
     */
    function purchaseAndRetire(
        address projectVintage,
        uint256 amount,
        string calldata retireMessage
    ) external nonReentrant {
        if (projectVintage == address(0)) revert ZeroAddressNotAllowed();
        if (amount == 0) revert InvalidPayload();

        // Transfer tokens from user
        IERC20(projectVintage).transferFrom(msg.sender, address(this), amount);

        // Calculate fee and net
        uint256 fee = (amount * feeBasisPoints) / 10_000;
        uint256 netAmount = amount - fee;

        // Approve and retire via Toucan registry
        ICarbonProjectVintages(projectVintage).approve(address(registry), netAmount);
        registry.retire(projectVintage, netAmount, msg.sender, retireMessage);

        // Send fee to owner
        if (fee > 0) {
            IERC20(projectVintage).transfer(owner(), fee);
        }

        emit DirectRetirement(msg.sender, projectVintage, netAmount, retireMessage);
    }

    /// -----------------------------------------------------------------------
    /// Cross-chain reception (ILayerZeroReceiver)
    /// -----------------------------------------------------------------------
    /**
     * @notice LayerZero receiver entry point
     * @dev Validates and dispatches to _handleCrossChainRetirement
     * @param _srcChainId chain ID of sender
     * @param _srcAddress sender address in bytes
     * @param _nonce message nonce
     * @param _payload encoded retirement request
     */
    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64 _nonce,
        bytes calldata _payload
    ) external override {
        // only endpoint can call
        if (msg.sender != address(lzEndpoint)) revert UnauthorizedBridge();
        // only authorized bridge
        if (_srcChainId != baseChainId || keccak256(_srcAddress) != keccak256(authorizedBridgeAddress))
            revert UnauthorizedBridge();

        // decode payload: (address beneficiary, address projectVintage, uint256 amount, string retireMessage)
        (address beneficiary, address projectVintage, uint256 amount, string memory retireMessage) =
            abi.decode(_payload, (address, address, uint256, string));

        // payload validation
        if (beneficiary == address(0) || projectVintage == address(0) || amount == 0) revert InvalidPayload();

        emit CrossChainRetirementReceived(_srcChainId, _srcAddress, beneficiary, projectVintage, amount, retireMessage);

        // process retirement
        _processCrossChainRetirement(beneficiary, projectVintage, amount, retireMessage, _srcAddress);
    }

    /// -----------------------------------------------------------------------
    /// Internal cross-chain processing
    /// -----------------------------------------------------------------------
    function _processCrossChainRetirement(
        address beneficiary,
        address projectVintage,
        uint256 amount,
        string memory retireMessage,
        bytes calldata srcAddress
    ) internal nonReentrant {
        // Transfer tokens that the bridge pre-funded to facilitator
        IERC20(projectVintage).transferFrom(authorizedBridgeAddress.toAddress(), address(this), amount);

        // Calculate fee and net
        uint256 fee = (amount * feeBasisPoints) / 10_000;
        uint256 netAmount = amount - fee;

        // Approve & retire
        ICarbonProjectVintages(projectVintage).approve(address(registry), netAmount);
        try registry.retire(projectVintage, netAmount, beneficiary, retireMessage) {
            // send fee to owner
            if (fee > 0) IERC20(projectVintage).transfer(owner(), fee);
        } catch {
            revert RetirementFailed();
        }

        // send confirmation back to Base
        _sendConfirmation(srcAddress, beneficiary, projectVintage, netAmount, retireMessage);

        emit CrossChainRetirementCompleted(baseChainId, srcAddress, beneficiary, projectVintage, netAmount, retireMessage);
    }

    /// -----------------------------------------------------------------------
    /// Send confirmation
    /// -----------------------------------------------------------------------
    function _sendConfirmation(
        bytes calldata dstAddress,
        address beneficiary,
        address projectVintage,
        uint256 amount,
        string memory retireMessage
    ) internal {
        bytes memory payload = abi.encode(beneficiary, projectVintage, amount, retireMessage);

        // zero adaptorParams = default
        uint16 version = 1;
        bytes memory adapterParams = abi.encodePacked(version, uint256(200_000)); // gas limit for remote

        try
            lzEndpoint.send{value: msg.value}(
                baseChainId,           // destination chain
                dstAddress,            // destination contract
                payload,               // message payload
                payable(msg.sender),   // refund address
                address(0),            // zroPaymentAddress
                adapterParams          // adapterParams
            )
        {
            // success
        } catch {
            revert SendingMessageFailed();
        }
    }

    /// -----------------------------------------------------------------------
    /// Utilities
    /// -----------------------------------------------------------------------
    /**
     * @dev Convert bytes to address (expects right padded 20 bytes)
     */
    function toAddress(bytes memory bys) internal pure returns (address addr) {
        require(bys.length == 20, "Invalid address length");
        assembly {
            addr := mload(add(bys, 20))
        }
    }

    // Allow contract to receive native tokens for LayerZero gas
    receive() external payable {}
    fallback() external payable {}
}

