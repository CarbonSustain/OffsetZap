// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./HederaTokenService.sol";
import "./HederaResponseCodes.sol";
import "./KeyHelper.sol";

/**
 * @title ClearSky HBAR-Only Liquidity Pool V3
 * @notice A simplified liquidity pool that accepts only HBAR with split token creation
 * @dev Built for Hedera network with HTS LP tokens using HIP-1028 (split deployment)
 */
contract ClearSkyLiquidityPoolV3 is Ownable, ReentrancyGuard, Pausable, HederaTokenService, KeyHelper {
    // LP Token address (created after deployment)
    address public lpToken;
    
    // Pool state
    uint256 public totalHBAR;
    uint256 public totalLPTokens;
    uint256 public totalValue; // Total value in HBAR (8 decimals)
    
    // Fees (in basis points: 100 = 1%)
    uint256 public constant FEE_BPS = 30; // 0.3% fee
    uint256 public constant FEE_DENOMINATOR = 10000;
    
    // Minimum liquidity amounts
    uint256 public constant MIN_LIQUIDITY = 100000; // 0.001 HBAR in wei (8 decimals)
    
    // Token creation info
    struct TokenInfo {
        string name;
        string symbol;
        uint8 decimals;
        address tokenAddress;
        bool created;
    }
    
    TokenInfo public tokenInfo;
    
    // Events
    event TokenCreated(
        address indexed tokenAddress,
        string name,
        string symbol,
        uint8 decimals,
        address treasury
    );
    
    event LiquidityAdded(
        address indexed user,
        uint256 hbarAmount,
        uint256 lpTokensMinted,
        uint256 timestamp
    );
    
    event LiquidityRemoved(
        address indexed user,
        uint256 hbarAmount,
        uint256 lpTokensBurned,
        uint256 timestamp
    );
    
    event FeesCollected(
        address indexed collector,
        uint256 hbarAmount,
        uint256 timestamp
    );
    
    // HTS Events
    event HTSMintAttempt(address indexed token, address indexed to, int64 amount);
    event HTSMintSuccess(address indexed token, address indexed to, int64 amount, int64 newTotalSupply);
    event HTSMintFailed(address indexed token, address indexed to, int64 amount, int32 responseCode);
    
    event HTSTransferAttempt(address indexed token, address indexed from, address indexed to, int64 amount);
    event HTSTransferSuccess(address indexed token, address indexed from, address indexed to, int64 amount);
    event HTSTransferFailed(address indexed token, address indexed from, address indexed to, int64 amount, int32 responseCode);
    
    event HTSAssociateAttempt(address indexed token, address indexed account);
    event HTSAssociateSuccess(address indexed token, address indexed account);
    event HTSAssociateSkipped(address indexed token, address indexed account, string reason);
    
    event HTSBurnAttempt(address indexed token, int64 amount, int64[] serialNumbers);
    event HTSBurnSuccess(address indexed token, int64 amount, int64 newTotalSupply);
    event HTSBurnFailed(address indexed token, int64 amount, int32 responseCode);
    
    // Token Creation Error Event
    event TokenCreationFailedEvent(int32 responseCode, string errorMessage);

    // Custom errors
    error TokenCreationFailed(int32 responseCode);
    error InsufficientHBAR();
    error InsufficientLPBalance();
    error PoolNotActive();
    error InvalidAmounts();
    error SlippageExceeded();
    error NoLiquidityProvided();
    error InsufficientInitialLiquidity();
    error PoolAlreadyInitialized();
    error TokenNotCreated();
    error TokenAlreadyCreated();
    
    /**
     * @notice Constructor - Simple setup without token creation
     * @param _owner Owner of the contract
     */
    constructor(address _owner) Ownable(_owner) {
        require(_owner != address(0), "Invalid owner address");
        
        // Initialize token info as not created
        tokenInfo = TokenInfo({
            name: "",
            symbol: "",
            decimals: 0,
            tokenAddress: address(0),
            created: false
        });
    }
    
    /**
     * @notice Create LP token using HIP-1028 (Owner only, after deployment)
     * @param _tokenName Name of the LP token
     * @param _tokenSymbol Symbol of the LP token
     */
    function createLPToken(
        string memory _tokenName,
        string memory _tokenSymbol
    ) external payable onlyOwner {
        require(!tokenInfo.created, "Token already created");
        require(bytes(_tokenName).length > 0, "Token name required");
        require(bytes(_tokenSymbol).length > 0, "Token symbol required");
        
        // Create HederaToken struct - exactly like the working example
        IHederaTokenService.HederaToken memory token;
        token.name = _tokenName;
        token.symbol = _tokenSymbol;
        token.treasury = address(this); // 🎯 CONTRACT is treasury!
        token.tokenKeys = new IHederaTokenService.TokenKey[](1);
        
        // Create supply key exactly like the working example
        IHederaTokenService.TokenKey memory tokenKey = super.getSingleKey(KeyType.SUPPLY, KeyValueType.CONTRACT_ID, address(this));
        token.tokenKeys[0] = tokenKey;
        
        // Create the fungible token with 6 decimals and 0 initial supply
        (int responseCode, address tokenAddress) = HederaTokenService.createFungibleToken(token, 0, 6);
        
        if (responseCode != HederaResponseCodes.SUCCESS) {
            // Emit detailed error information for debugging
            emit TokenCreationFailedEvent(int32(responseCode), getErrorMessage(int32(responseCode)));
            revert TokenCreationFailed(int32(responseCode));
        }
        
        // Store token information
        lpToken = tokenAddress;
        tokenInfo = TokenInfo({
            name: _tokenName,
            symbol: _tokenSymbol,
            decimals: 6,
            tokenAddress: tokenAddress,
            created: true
        });
        
        emit TokenCreated(tokenAddress, _tokenName, _tokenSymbol, 6, address(this));
    }
    
    /**
     * @notice Initialize the pool with initial HBAR liquidity (Owner only)
     * @dev This function must be called after token creation
     */
    function initializePool() external payable onlyOwner nonReentrant whenNotPaused {
        require(tokenInfo.created, "Token not created");
        require(totalLPTokens == 0, "Pool already initialized");
        require(msg.value >= MIN_LIQUIDITY, "Insufficient initial liquidity");
        
        // Store initial HBAR
        totalHBAR = msg.value;
        totalValue = msg.value;
        
        // Calculate initial LP tokens (1:1 ratio with HBAR but adjusted for decimals)
        // HBAR has 8 decimals, LP token has 6 decimals
        uint256 lpTokenAmount = msg.value / 100; // Convert from 8 decimals to 6 decimals
        
        // Mint initial LP tokens to caller using HTS (no fee for initialization)
        int64 mintAmount = int64(uint64(lpTokenAmount));
        emit HTSMintAttempt(lpToken, msg.sender, mintAmount);
        
        // Mint tokens to contract (treasury account)
        (int responseCode, int64 newTotalSupply, ) = mintToken(lpToken, mintAmount, new bytes[](0));
        
        if (responseCode == HederaResponseCodes.SUCCESS) {
            // For initialization, just mint and track - no transfer needed since treasury is user's account
            totalLPTokens = lpTokenAmount;
            emit HTSMintSuccess(lpToken, msg.sender, mintAmount, newTotalSupply);
        } else {
            emit HTSMintFailed(lpToken, msg.sender, mintAmount, int32(responseCode));
            revert("HTS token minting failed");
        }
        
        emit LiquidityAdded(msg.sender, msg.value, lpTokenAmount, block.timestamp);
    }
    
    /**
     * @notice Add liquidity to the pool
     * @param minLPTokens Minimum LP tokens expected (slippage protection)
     */
    function addLiquidity(uint256 minLPTokens) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
    {
        require(tokenInfo.created, "Token not created");
        require(totalLPTokens > 0, "Pool not initialized");
        require(msg.value > 0, "No HBAR provided");
        
        // Calculate LP tokens to mint based on current pool ratio
        uint256 lpTokensToMint = calculateLPTokens(msg.value);
        require(lpTokensToMint >= minLPTokens, "Slippage exceeded");
        
        // Update pool state
        totalHBAR += msg.value;
        totalValue += msg.value;
        
        // Mint LP tokens to user using HTS
        int64 mintAmount = int64(uint64(lpTokensToMint));
        emit HTSMintAttempt(lpToken, msg.sender, mintAmount);
        
        // Step 1: Mint tokens to contract (treasury account)
        (int responseCode, int64 newTotalSupply, ) = mintToken(lpToken, mintAmount, new bytes[](0));
        
        if (responseCode == HederaResponseCodes.SUCCESS) {
            // Step 2: Transfer tokens from contract to user (association handled externally)
            emit HTSTransferAttempt(lpToken, address(this), msg.sender, mintAmount);
            int transferResponseCode = transferToken(lpToken, address(this), msg.sender, mintAmount);
            
            if (transferResponseCode == HederaResponseCodes.SUCCESS) {
                totalLPTokens += lpTokensToMint;
                emit HTSMintSuccess(lpToken, msg.sender, mintAmount, newTotalSupply);
                emit HTSTransferSuccess(lpToken, address(this), msg.sender, mintAmount);
            } else {
                emit HTSTransferFailed(lpToken, address(this), msg.sender, mintAmount, int32(transferResponseCode));
                revert("HTS token transfer failed");
            }
        } else {
            emit HTSMintFailed(lpToken, msg.sender, mintAmount, int32(responseCode));
            revert("HTS token minting failed");
        }
        
        emit LiquidityAdded(
            msg.sender, 
            msg.value, 
            lpTokensToMint,
            block.timestamp
        );
    }
    
    /**
     * @notice Remove liquidity from the pool
     * @param lpTokenAmount Amount of LP tokens to burn
     * @param minHBAR Minimum HBAR expected (slippage protection)
     */
    function removeLiquidity(uint256 lpTokenAmount, uint256 minHBAR) 
        external 
        nonReentrant 
        whenNotPaused 
    {
        require(tokenInfo.created, "Token not created");
        require(lpTokenAmount > 0, "No LP tokens specified");
        require(totalLPTokens > 0, "No liquidity in pool");
        
        // Calculate HBAR to return
        uint256 hbarToReturn = (lpTokenAmount * totalHBAR) / totalLPTokens;
        require(hbarToReturn >= minHBAR, "Slippage exceeded");
        require(hbarToReturn <= address(this).balance, "Insufficient HBAR in pool");
        
        // Update pool state
        totalHBAR -= hbarToReturn;
        totalLPTokens -= lpTokenAmount;
        totalValue -= hbarToReturn;
        
        // Burn LP tokens using HTS
        int64 burnAmount = int64(uint64(lpTokenAmount));
        int64[] memory serialNumbers = new int64[](0); // Empty for fungible tokens
        
        emit HTSBurnAttempt(lpToken, burnAmount, serialNumbers);
        
        (int responseCode, int64 newTotalSupply) = burnToken(lpToken, burnAmount, serialNumbers);
        
        if (responseCode == HederaResponseCodes.SUCCESS) {
            emit HTSBurnSuccess(lpToken, burnAmount, newTotalSupply);
            
            // Transfer HBAR to user
            (bool success, ) = payable(msg.sender).call{value: hbarToReturn}("");
            require(success, "HBAR transfer failed");
            
            emit LiquidityRemoved(msg.sender, hbarToReturn, lpTokenAmount, block.timestamp);
        } else {
            // Revert pool state changes if burn failed
            totalHBAR += hbarToReturn;
            totalLPTokens += lpTokenAmount;
            totalValue += hbarToReturn;
            
            emit HTSBurnFailed(lpToken, burnAmount, int32(responseCode));
            revert("HTS token burning failed");
        }
    }
    
    /**
     * @notice Calculate LP tokens for a given HBAR amount
     * @param hbarAmount Amount of HBAR
     * @return lpTokens LP tokens to mint
     */
    function calculateLPTokens(uint256 hbarAmount) public view returns (uint256 lpTokens) {
        if (totalLPTokens == 0) {
            // Pool not initialized yet
            return 0;
        }
        
        // Calculate proportional LP tokens based on current pool ratio
        // LP tokens = (hbarAmount * totalLPTokens) / totalHBAR
        lpTokens = (hbarAmount * totalLPTokens) / totalHBAR;
    }
    
    /**
     * @notice Calculate HBAR for a given LP token amount
     * @param lpTokenAmount Amount of LP tokens
     * @return hbarAmount HBAR amount
     */
    function calculateHBAR(uint256 lpTokenAmount) public view returns (uint256 hbarAmount) {
        if (totalLPTokens == 0) {
            return 0;
        }
        
        // Calculate proportional HBAR based on current pool ratio
        // HBAR = (lpTokenAmount * totalHBAR) / totalLPTokens
        hbarAmount = (lpTokenAmount * totalHBAR) / totalLPTokens;
    }
    
    /**
     * @notice Get user's share of the pool
     * @param user User address
     * @return userLPBalance User's LP token balance
     * @return userHBARValue User's HBAR value in the pool
     * @return sharePercentage User's percentage share (in basis points)
     */
    function getUserShare(address user) 
        external 
        view 
        returns (uint256 userLPBalance, uint256 userHBARValue, uint256 sharePercentage) 
    {
        if (!tokenInfo.created) {
            return (0, 0, 0);
        }
        
        // Get user's LP token balance (this would need to be tracked separately or queried from HTS)
        // For now, we'll return 0 since we can't easily query HTS balance from within the contract
        userLPBalance = 0; // TODO: Implement HTS balance query
        
        if (totalLPTokens == 0) {
            return (userLPBalance, 0, 0);
        }
        
        // Calculate user's HBAR value
        userHBARValue = (userLPBalance * totalHBAR) / totalLPTokens;
        
        // Calculate percentage share (in basis points: 10000 = 100%)
        sharePercentage = (userLPBalance * 10000) / totalLPTokens;
    }
    
    /**
     * @notice Get current pool information
     * @return _totalHBAR Total HBAR in pool
     * @return _totalLPTokens Total LP tokens minted
     * @return _totalValue Total pool value in HBAR
     */
    function getPoolInfo() 
        external 
        view 
        returns (uint256 _totalHBAR, uint256 _totalLPTokens, uint256 _totalValue) 
    {
        return (totalHBAR, totalLPTokens, totalValue);
    }
    
    /**
     * @notice Get the value per LP token in HBAR
     * @return valuePerToken Value per LP token (in HBAR, 8 decimals)
     */
    function getValuePerLPToken() external view returns (uint256 valuePerToken) {
        if (totalLPTokens == 0) {
            return 0;
        }
        
        // Convert from 6 decimal LP tokens to 8 decimal HBAR
        // totalValue is in 8 decimals, totalLPTokens is in 6 decimals
        // So we need to divide totalValue by (totalLPTokens / 100) to get 8 decimal result
        return (totalValue / 100) / totalLPTokens;
    }
    
    /**
     * @notice Get user's total value in HBAR
     * @param user User address
     * @return userValue User's total value in HBAR (8 decimals)
     */
    function getUserValue(address user) external view returns (uint256 userValue) {
        if (!tokenInfo.created || totalLPTokens == 0) {
            return 0;
        }
        
        // Get user's LP token balance (placeholder - would need HTS balance query)
        uint256 userLPBalance = 0; // TODO: Implement HTS balance query
        
        // Calculate user's value: (userLPBalance * totalValue) / totalLPTokens
        userValue = (userLPBalance * totalValue) / totalLPTokens;
    }
    
    /**
     * @notice Get token information
     * @return Token information struct
     */
    function getTokenInfo() external view returns (TokenInfo memory) {
        return tokenInfo;
    }
    
    /**
     * @notice Check if token has been created
     * @return created Whether the LP token has been created
     */
    function isTokenCreated() external view returns (bool created) {
        return tokenInfo.created;
    }
    
    /**
     * @notice Get human-readable error message for Hedera response code
     * @param responseCode The Hedera response code
     * @return errorMessage Human-readable error message
     */
    function getErrorMessage(int32 responseCode) public pure returns (string memory errorMessage) {
        if (responseCode == HederaResponseCodes.SUCCESS) return "SUCCESS";
        if (responseCode == HederaResponseCodes.INSUFFICIENT_TX_FEE) return "INSUFFICIENT_TX_FEE - Not enough gas/fee provided";
        if (responseCode == HederaResponseCodes.INSUFFICIENT_PAYER_BALANCE) return "INSUFFICIENT_PAYER_BALANCE - Payer account has insufficient HBAR";
        if (responseCode == HederaResponseCodes.INVALID_SIGNATURE) return "INVALID_SIGNATURE - Transaction signature is invalid";
        if (responseCode == HederaResponseCodes.INVALID_ACCOUNT_ID) return "INVALID_ACCOUNT_ID - Account ID is invalid or does not exist";
        if (responseCode == HederaResponseCodes.INVALID_CONTRACT_ID) return "INVALID_CONTRACT_ID - Contract ID is invalid or does not exist";
        if (responseCode == HederaResponseCodes.INSUFFICIENT_GAS) return "INSUFFICIENT_GAS - Not enough gas supplied";
        if (responseCode == HederaResponseCodes.CONTRACT_EXECUTION_EXCEPTION) return "CONTRACT_EXECUTION_EXCEPTION - Contract execution failed";
        if (responseCode == HederaResponseCodes.MAX_GAS_LIMIT_EXCEEDED) return "MAX_GAS_LIMIT_EXCEEDED - Gas limit exceeded";
        if (responseCode == HederaResponseCodes.INVALID_TREASURY_ACCOUNT_FOR_TOKEN) return "INVALID_TREASURY_ACCOUNT_FOR_TOKEN - Treasury account invalid";
        if (responseCode == HederaResponseCodes.INVALID_TOKEN_SYMBOL) return "INVALID_TOKEN_SYMBOL - Token symbol is invalid";
        if (responseCode == HederaResponseCodes.MISSING_TOKEN_SYMBOL) return "MISSING_TOKEN_SYMBOL - Token symbol not provided";
        if (responseCode == HederaResponseCodes.TOKEN_SYMBOL_TOO_LONG) return "TOKEN_SYMBOL_TOO_LONG - Token symbol exceeds length limit";
        if (responseCode == HederaResponseCodes.MISSING_TOKEN_NAME) return "MISSING_TOKEN_NAME - Token name not provided";
        if (responseCode == HederaResponseCodes.TOKEN_NAME_TOO_LONG) return "TOKEN_NAME_TOO_LONG - Token name exceeds length limit";
        if (responseCode == HederaResponseCodes.INVALID_TOKEN_DECIMALS) return "INVALID_TOKEN_DECIMALS - Token decimals value is invalid";
        if (responseCode == HederaResponseCodes.INVALID_TOKEN_INITIAL_SUPPLY) return "INVALID_TOKEN_INITIAL_SUPPLY - Initial supply value is invalid";
        if (responseCode == HederaResponseCodes.INVALID_SUPPLY_KEY) return "INVALID_SUPPLY_KEY - Supply key is invalid";
        if (responseCode == HederaResponseCodes.INVALID_ADMIN_KEY) return "INVALID_ADMIN_KEY - Admin key is invalid";
        if (responseCode == HederaResponseCodes.KEY_REQUIRED) return "KEY_REQUIRED - Required key is missing";
        if (responseCode == HederaResponseCodes.BAD_ENCODING) return "BAD_ENCODING - Key encoding is invalid";
        if (responseCode == HederaResponseCodes.INVALID_KEY_ENCODING) return "INVALID_KEY_ENCODING - Key encoding format is invalid";
        if (responseCode == HederaResponseCodes.TRANSACTION_OVERSIZE) return "TRANSACTION_OVERSIZE - Transaction exceeds size limit";
        if (responseCode == HederaResponseCodes.TRANSACTION_TOO_MANY_LAYERS) return "TRANSACTION_TOO_MANY_LAYERS - Transaction has too many nested layers";
        if (responseCode == HederaResponseCodes.CONSENSUS_GAS_EXHAUSTED) return "CONSENSUS_GAS_EXHAUSTED - Consensus node gas exhausted";
        if (responseCode == HederaResponseCodes.MAX_ENTITIES_IN_PRICE_REGIME_HAVE_BEEN_CREATED) return "MAX_ENTITIES_CREATED - Maximum entities in price regime reached";
        if (responseCode == HederaResponseCodes.INVALID_FULL_PREFIX_SIGNATURE_FOR_PRECOMPILE) return "INVALID_PRECOMPILE_SIGNATURE - Invalid signature for precompile";
        if (responseCode == HederaResponseCodes.INSUFFICIENT_BALANCES_FOR_STORAGE_RENT) return "INSUFFICIENT_STORAGE_RENT - Insufficient balance for storage rent";
        if (responseCode == HederaResponseCodes.MAX_CHILD_RECORDS_EXCEEDED) return "MAX_CHILD_RECORDS_EXCEEDED - Too many child records";
        
        // Generic fallback for unknown codes
        return string(abi.encodePacked("UNKNOWN_ERROR_CODE_", uint2str(uint32(responseCode))));
    }
    
    /**
     * @notice Convert uint to string (helper function)
     * @param _i The unsigned integer to convert
     * @return _uintAsString The string representation
     */
    function uint2str(uint _i) internal pure returns (string memory _uintAsString) {
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
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
    
    /**
     * @notice Emergency pause (Owner only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause (Owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Emergency withdrawal (Owner only, when paused)
     */
    function emergencyWithdraw() external onlyOwner whenPaused {
        uint256 balance = address(this).balance;
        require(balance > 0, "No HBAR to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Emergency withdrawal failed");
        
        emit FeesCollected(owner(), balance, block.timestamp);
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
        revert("Function not found");
    }
}
