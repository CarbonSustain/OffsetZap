// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/interfaces/IERC1820Registry.sol";
import "@openzeppelin/contracts/interfaces/IERC777Recipient.sol";

/**
 * @title IKlimaRetirementAggregator
 * @notice Interface for the KlimaDAO Retirement Aggregator Diamond contract
 */
interface IKlimaRetirementAggregator {
    function retireExactSourceDefault(
        address sourceToken,
        address poolToken,
        uint256 maxAmountIn,
        string memory retiringEntityString,
        address beneficiaryAddress,
        string memory beneficiaryString,
        string memory retirementMessage,
        uint8 fromMode
    ) external returns (uint256);
    
    function isPoolToken(address poolToken) external view returns (bool);
}

/**
 * @title AcrossCarbonRetirementReceiver
 * @notice Contract that receives tokens from Across Protocol and automatically retires carbon
 * @dev This contract is designed to be the recipient of bridged tokens from Across Protocol
 */
contract AcrossCarbonRetirementReceiver is Ownable, ReentrancyGuard, IERC777Recipient {
    // ERC1820 registry address (same on all chains)
    IERC1820Registry private constant ERC1820_REGISTRY = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    
    // Interface hash for ERC777TokensRecipient
    bytes32 private constant TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");
    // KlimaDAO Aggregator Diamond contract address
    address public constant KLIMA_AGGREGATOR = 0x8cE54d9625371fb2a068986d32C85De8E6e995f8;
    
    // USDC token address on Polygon
    address public constant USDC_TOKEN = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    
    // Default pool token (BCT)
    address public constant DEFAULT_POOL_TOKEN = 0x2F800Db0fdb5223b3C3f354886d907A671414A7F;
    
    // Across Protocol's SpokePool on Polygon
    address public constant ACROSS_SPOKE_POOL = 0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096;
    
    // Events
    event RetirementExecuted(
        address indexed beneficiary,
        string beneficiaryName,
        address poolToken,
        uint256 usdcAmount,
        uint256 carbonAmount
    );
    
    event RetirementFailed(
        address indexed beneficiary,
        address poolToken,
        uint256 usdcAmount,
        string reason
    );
    
    /**
     * @notice Constructor
     */
    constructor() Ownable(msg.sender) {
        // Approve the KlimaDAO Aggregator to spend USDC
        // This is done once at deployment to save gas on future transactions
        IERC20(USDC_TOKEN).approve(KLIMA_AGGREGATOR, type(uint256).max);
        
        // Register with ERC1820 registry to receive ERC777 tokens
        ERC1820_REGISTRY.setInterfaceImplementer(
            address(this),
            TOKENS_RECIPIENT_INTERFACE_HASH,
            address(this)
        );
    }
    
    /**
     * @notice Decode the message from Across Protocol
     * @param message The encoded message from Across
     * @return beneficiary The beneficiary address
     * @return beneficiaryName The beneficiary name
     * @return poolToken The pool token address
     */
    function decodeMessage(bytes memory message) internal view returns (
        address beneficiary,
        string memory beneficiaryName,
        address poolToken
    ) {
        // Default values if parsing fails
        beneficiary = address(0);
        beneficiaryName = "OffsetZap User";
        poolToken = DEFAULT_POOL_TOKEN;
        
        // Try to decode the JSON message
        // Format expected: {"sender":"0x...","amount":"1000000","beneficiary":"0x...","poolTokenAddress":"0x...","beneficiaryName":"Name"}
        if (message.length > 0) {
            // Simple parsing - extract values between specific markers
            // This is a basic implementation - in production you might want a more robust parser
            
            // Find beneficiary
            bytes memory beneficiaryMarker = bytes(',"beneficiary":"');
            int256 beneficiaryPos = indexOf(message, beneficiaryMarker);
            if (beneficiaryPos >= 0) {
                beneficiary = extractAddress(message, uint256(beneficiaryPos) + beneficiaryMarker.length);
            }
            
            // Find poolTokenAddress
            bytes memory poolTokenMarker = bytes(',"poolTokenAddress":"');
            int256 poolTokenPos = indexOf(message, poolTokenMarker);
            if (poolTokenPos >= 0) {
                poolToken = extractAddress(message, uint256(poolTokenPos) + poolTokenMarker.length);
            }
            
            // Find beneficiaryName
            bytes memory nameMarker = bytes(',"beneficiaryName":"');
            int256 namePos = indexOf(message, nameMarker);
            if (namePos >= 0) {
                beneficiaryName = extractString(message, uint256(namePos) + nameMarker.length);
            }
        }
        
        // Validate beneficiary
        if (beneficiary == address(0)) {
            beneficiary = msg.sender;
        }
        
        // Validate pool token - if invalid, use default
        if (!isValidPoolToken(poolToken)) {
            poolToken = DEFAULT_POOL_TOKEN;
        }
    }
    
    /**
     * @notice Check if a token is a valid pool token
     * @param poolToken The pool token address to check
     * @return isValid True if the token is a valid pool token
     */
    function isValidPoolToken(address poolToken) internal pure returns (bool) {
        // For simplicity, we'll accept any non-zero address as valid
        // In a production environment, you would want to check against a list of known pool tokens
        // or call the KlimaDAO Aggregator's isPoolToken function through an interface
        return poolToken != address(0);
    }
    
    /**
     * @notice Extract an address from a byte array starting at a specific position
     * @param data The byte array
     * @param startPos The starting position
     * @return addr The extracted address
     */
    function extractAddress(bytes memory data, uint256 startPos) internal pure returns (address addr) {
        bytes memory addrBytes = new bytes(42); // 0x + 40 hex chars
        for (uint256 i = 0; i < 42 && startPos + i < data.length; i++) {
            addrBytes[i] = data[startPos + i];
        }
        
        // Convert bytes to address
        // This is a simplified implementation - in production you'd use a more robust parser
        bytes memory hexBytes = new bytes(20);
        for (uint256 i = 0; i < 20; i++) {
            uint8 high = uint8(addrBytes[2*i + 2]) - (uint8(addrBytes[2*i + 2]) >= 65 ? 55 : 48);
            uint8 low = uint8(addrBytes[2*i + 3]) - (uint8(addrBytes[2*i + 3]) >= 65 ? 55 : 48);
            hexBytes[i] = bytes1(high * 16 + low);
        }
        
        assembly {
            addr := mload(add(hexBytes, 32))
        }
    }
    
    /**
     * @notice Extract a string from a byte array starting at a specific position
     * @param data The byte array
     * @param startPos The starting position
     * @return result The extracted string
     */
    function extractString(bytes memory data, uint256 startPos) internal pure returns (string memory result) {
        // Find the closing quote
        uint256 endPos = startPos;
        while (endPos < data.length && data[endPos] != '"') {
            endPos++;
        }
        
        // Extract the string
        bytes memory strBytes = new bytes(endPos - startPos);
        for (uint256 i = 0; i < endPos - startPos; i++) {
            strBytes[i] = data[startPos + i];
        }
        
        return string(strBytes);
    }
    
    /**
     * @notice Find the position of a substring in a string
     * @param data The byte array to search in
     * @param pattern The pattern to search for
     * @return position The position of the pattern, or -1 if not found
     */
    function indexOf(bytes memory data, bytes memory pattern) internal pure returns (int256 position) {
        if (pattern.length == 0) return 0;
        if (data.length < pattern.length) return -1;
        
        for (uint256 i = 0; i <= data.length - pattern.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < pattern.length; j++) {
                if (data[i + j] != pattern[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return int256(i);
        }
        
        return -1;
    }
    
    /**
     * @notice Execute carbon retirement using the KlimaDAO Aggregator
     * @param usdcAmount The amount of USDC to use for retirement
     * @param beneficiary The beneficiary address
     * @param beneficiaryName The beneficiary name
     * @param poolToken The pool token address
     */
    function executeRetirement(
        uint256 usdcAmount,
        address beneficiary,
        string memory beneficiaryName,
        address poolToken
    ) internal {
        // Define the KlimaDAO Aggregator interface for the function we need
        IKlimaRetirementAggregator klimaAggregator = IKlimaRetirementAggregator(KLIMA_AGGREGATOR);
        
        // Try to call the KlimaDAO Aggregator to retire carbon
        try klimaAggregator.retireExactSourceDefault(
            USDC_TOKEN,           // sourceToken (USDC)
            poolToken,            // poolToken (BCT/NCT)
            usdcAmount,           // amount of USDC to use
            "OffsetZap",          // retiring entity
            beneficiary,          // beneficiary address
            beneficiaryName,      // beneficiary name
            "Carbon offset via OffsetZap", // retirement message
            0                     // fromMode (FROM_WALLET)
        ) returns (uint256 carbonAmount) {
            // Success! The call to KlimaDAO Aggregator went through
                
                emit RetirementExecuted(
                    beneficiary,
                    beneficiaryName,
                    poolToken,
                    usdcAmount,
                    carbonAmount
                );
        } catch Error(string memory reason) {
            // Solidity revert with reason
            emit RetirementFailed(
                beneficiary,
                poolToken,
                usdcAmount,
                reason
            );
        } catch (bytes memory) {
            // Low-level revert without reason
            emit RetirementFailed(
                beneficiary,
                poolToken,
                usdcAmount,
                "Unknown error"
            );
        }
    }
    
    /**
     * @notice Function to handle token transfers via ERC777 tokensReceived hook
     * @param operator The address which called the token transfer
     * @param from The address which previously owned the token
     * @param to The address which will own the token
     * @param amount The amount of tokens being transferred
     * @param userData Additional user data sent with the token transfer
     * @param operatorData Additional operator data sent with the token transfer
     */
    /**
     * @notice Implementation of IERC777Recipient interface
     */
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external override nonReentrant {
        // Only accept tokens from the Across SpokePool and ensure we're the recipient
        if (from == ACROSS_SPOKE_POOL && to == address(this)) {
            // Try to decode userData as a retirement message
            address beneficiary;
            string memory beneficiaryName;
            address poolToken;
            
            // If userData is present and valid, use it to extract parameters
            if (userData.length > 0) {
                (beneficiary, beneficiaryName, poolToken) = decodeMessage(userData);
            } else {
                // Default values if no userData
                beneficiary = from;
                beneficiaryName = "OffsetZap User";
                poolToken = DEFAULT_POOL_TOKEN;
            }
            
            // Execute the retirement
            executeRetirement(amount, beneficiary, beneficiaryName, poolToken);
        }
        // No return needed as function is void
    }
    
    /**
     * @notice Legacy function for compatibility with Across Protocol
     * @param recipient The recipient address (should be this contract)
     * @param amount The amount of tokens received
     * @param message The message sent with the tokens
     */
    function handleAcrossTransfer(
        address recipient,
        uint256 amount,
        bytes calldata message
    ) external nonReentrant {
        // Only Across SpokePool can call this function
        require(msg.sender == ACROSS_SPOKE_POOL, "Only Across SpokePool can call");
        require(recipient == address(this), "Recipient must be this contract");
        
        // Check USDC balance
        uint256 usdcBalance = IERC20(USDC_TOKEN).balanceOf(address(this));
        require(usdcBalance >= amount, "Insufficient USDC balance");
        
        // Decode the message to get retirement parameters
        (
            address beneficiary,
            string memory beneficiaryName,
            address poolToken
        ) = decodeMessage(message);
        
        // Execute the retirement
        executeRetirement(amount, beneficiary, beneficiaryName, poolToken);
    }
    
    /**
     * @notice Fallback function to handle direct token transfers
     * @dev This allows the contract to receive tokens directly
     */
    receive() external payable {
        // Accept ETH transfers
    }
    
    /**
     * @notice Function to manually retire carbon if automatic retirement fails
     * @param usdcAmount The amount of USDC to use
     * @param beneficiary The beneficiary address
     * @param beneficiaryName The beneficiary name
     * @param poolToken The pool token address
     */
    function manualRetire(
        uint256 usdcAmount,
        address beneficiary,
        string memory beneficiaryName,
        address poolToken
    ) external onlyOwner nonReentrant {
        // Check USDC balance
        uint256 usdcBalance = IERC20(USDC_TOKEN).balanceOf(address(this));
        require(usdcBalance >= usdcAmount, "Insufficient USDC balance");
        
        // Execute the retirement
        executeRetirement(usdcAmount, beneficiary, beneficiaryName, poolToken);
    }
    
    /**
     * @notice Function to recover tokens if needed
     * @param token The token address to recover
     * @param amount The amount to recover
     */
    function recoverTokens(address token, uint256 amount) external onlyOwner nonReentrant {
        IERC20(token).transfer(owner(), amount);
    }
    
    /**
     * @notice Function to recover ETH if needed
     */
    function recoverEth() external onlyOwner nonReentrant {
        payable(owner()).transfer(address(this).balance);
    }
}