// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./HederaTokenService.sol";
import "./HederaResponseCodes.sol";

/**
 * @title ClearSky HBAR-Only Liquidity Pool V2
 * @notice A simplified liquidity pool that accepts only HBAR with integrated HTS token creation
 * @dev Built for Hedera network with self-created HTS LP tokens using HIP-1028
 */
contract ClearSkyLiquidityPoolV2 is Ownable, ReentrancyGuard, Pausable, HederaTokenService {
    // LP Token address (created by this contract)
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
    
    /**
     * @notice Constructor - Creates the LP token using HIP-1028
     * @param _owner Owner of the contract
     * @param _tokenName Name of the LP token
     * @param _tokenSymbol Symbol of the LP token
     */
    constructor(
        address _owner,
        string memory _tokenName,
        string memory _tokenSymbol
    ) Ownable(_owner) {
        require(_owner != address(0), "Invalid owner address");
        require(bytes(_tokenName).length > 0, "Token name required");
        require(bytes(_tokenSymbol).length > 0, "Token symbol required");
        
        // Create the LP token using HIP-1028
        _createLPToken(_tokenName, _tokenSymbol);
    }
    
    /**
     * @notice Internal function to create LP token using HIP-1028
     */
    function _createLPToken(string memory _name, string memory _symbol) internal {
        // Create HederaToken struct
        IHederaTokenService.HederaToken memory token;
        token.name = _name;
        token.symbol = _symbol;
        token.treasury = address(this); // 🎯 CONTRACT is treasury!
        token.tokenKeys = new IHederaTokenService.TokenKey[](1);
        
        // Set contract as supply key using inline key creation
        IHederaTokenService.TokenKey memory supplyKey;
        supplyKey.keyType = 4; // KeyType.SUPPLY = 4
        supplyKey.key = IHederaTokenService.KeyValue({
            inheritAccountKey: false,
            contractId: address(this),
            ed25519: new bytes(0),
            ECDSA_secp256k1: new bytes(0),
            delegatableContractId: address(0)
        });
        
        token.tokenKeys[0] = supplyKey;
        
        // Create the fungible token with 6 decimals and 0 initial supply
        (int responseCode, address tokenAddress) = HederaTokenService.createFungibleToken(token, 0, 6);
        
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert TokenCreationFailed(int32(responseCode));
        }
        
        // Store token information
        lpToken = tokenAddress;
        tokenInfo = TokenInfo({
            name: _name,
            symbol: _symbol,
            decimals: 6,
            tokenAddress: tokenAddress,
            created: true
        });
        
        emit TokenCreated(tokenAddress, _name, _symbol, 6, address(this));
    }
    
    /**
     * @notice Initialize the pool with initial HBAR liquidity (Owner only)
     * @dev This function must be called before users can add liquidity
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
            // Step 2: Associate user with token (if not already associated)
            emit HTSAssociateAttempt(lpToken, msg.sender);
            int associateResponseCode = associateToken(msg.sender, lpToken);
            
            if (associateResponseCode == HederaResponseCodes.SUCCESS) {
                emit HTSAssociateSuccess(lpToken, msg.sender);
            } else if (associateResponseCode == HederaResponseCodes.TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT) {
                emit HTSAssociateSkipped(lpToken, msg.sender, "Already associated");
            } else {
                emit HTSMintFailed(lpToken, msg.sender, mintAmount, int32(associateResponseCode));
                revert("Token association failed");
            }
            
            // Step 3: Transfer tokens from contract to user
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
