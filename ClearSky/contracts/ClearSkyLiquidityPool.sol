// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./HederaTokenService.sol";
import "./HederaResponseCodes.sol";

/**
 * @title ClearSky HBAR-Only Liquidity Pool
 * @notice A simplified liquidity pool that accepts only HBAR
 * @dev Built for Hedera network with HTS LP tokens
 */
contract ClearSkyLiquidityPool is Ownable, ReentrancyGuard, Pausable, HederaTokenService {
    // LP Token address
    address public immutable lpToken;
    
    // Pool state
    uint256 public totalHBAR;
    uint256 public totalLPTokens;
    uint256 public totalValue; // Total value in HBAR (8 decimals)
    
    // Fees (in basis points: 100 = 1%)
    uint256 public constant FEE_BPS = 30; // 0.3% fee
    uint256 public constant FEE_DENOMINATOR = 10000;
    
    // Minimum liquidity amounts
    uint256 public constant MIN_LIQUIDITY = 100000; // 0.001 HBAR in wei (8 decimals)
    
    // Events
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
    
    event PoolPaused(address indexed pauser, uint256 timestamp);
    event PoolUnpaused(address indexed unpauser, uint256 timestamp);
    event PoolInitialized(address indexed initializer, uint256 hbarAmount, uint256 timestamp);
    
    // HTS-specific events
    event HTSMintAttempt(address indexed token, address indexed to, int64 amount);
    event HTSMintSuccess(address indexed token, address indexed to, int64 amount, int64 newTotalSupply);
    event HTSMintFailed(address indexed token, address indexed to, int64 amount, int32 responseCode);
    
    // Errors
    error InsufficientLiquidity();
    error InsufficientAmount();
    error InsufficientLPBalance();
    error PoolNotActive();
    error InvalidAmounts();
    error SlippageExceeded();
    error NoLiquidityProvided();
    error InsufficientInitialLiquidity();
    error PoolAlreadyInitialized();
    
    /**
     * @notice Constructor
     * @param _lpToken LP token address (HTS token)
     * @param _owner Owner of the contract
     */
    constructor(
        address _lpToken,
        address _owner
    ) Ownable(_owner) {
        require(_lpToken != address(0), "Invalid LP token address");
        require(_owner != address(0), "Invalid owner address");
        
        lpToken = _lpToken;
    }
    
    /**
     * @notice Initialize the pool with initial HBAR liquidity (Owner only)
     * @dev This function must be called before users can add liquidity
     */
    function initializePool() external payable onlyOwner nonReentrant whenNotPaused {
        require(totalLPTokens == 0, "Pool already initialized");
        require(msg.value >= MIN_LIQUIDITY, "Insufficient initial liquidity");
        
        // Set initial values
        totalHBAR = msg.value;
        totalValue = msg.value; // Initial value equals HBAR amount
        
        // For first deposit: 1 HBAR = 1,000,000 LP tokens (6 decimals)
        // Convert from HBAR (8 decimals) to LP tokens (6 decimals)  
        // 1 HBAR (100000000 in 8 decimals) = 1000000 LP tokens (6 decimals)
        // Conversion: 100000000 / 1000000 = 100, so divide by 100
        uint256 lpTokenAmount = msg.value / 100; // 10 HBAR → 10M tokens (10.0 CSLP in 6 decimals)
        
        // Mint initial LP tokens to caller using HTS (no fee for initialization)
        int64 mintAmount = int64(uint64(lpTokenAmount));
        emit HTSMintAttempt(lpToken, msg.sender, mintAmount);
        
        (int responseCode, int64 newTotalSupply, ) = mintToken(lpToken, mintAmount, new bytes[](0));
        
        if (responseCode == HederaResponseCodes.SUCCESS) {
            totalLPTokens = lpTokenAmount;
            emit HTSMintSuccess(lpToken, msg.sender, mintAmount, newTotalSupply);
        } else {
            emit HTSMintFailed(lpToken, msg.sender, mintAmount, int32(responseCode));
            revert("HTS token minting failed");
        }
        
        emit PoolInitialized(msg.sender, msg.value, block.timestamp);
        emit LiquidityAdded(msg.sender, msg.value, lpTokenAmount, block.timestamp);
    }
    
    /**
     * @notice Add HBAR liquidity to the pool
     * @param minLPTokens Minimum LP tokens to receive (slippage protection)
     */
    function addLiquidity(
        uint256 minLPTokens
    ) external payable nonReentrant whenNotPaused {
        // Pool must be initialized first
        require(totalLPTokens > 0, "Pool not initialized");
        require(msg.value > 0, "No HBAR provided");
        
        uint256 hbarAmount = msg.value;
        
        // Calculate LP tokens based on current value per token
        uint256 lpTokensToMint;
        if (totalLPTokens == 0) {
            // First deposit: 1 HBAR = 1,000,000 LP tokens (6 decimals)
            lpTokensToMint = hbarAmount / 100; // Convert: 8 decimals to 6 decimals with 1:1M ratio
        } else {
            // Subsequent deposits: proportional to current value
            lpTokensToMint = (hbarAmount * totalLPTokens) / totalValue;
        }
        
        // Apply fee by reducing LP tokens
        uint256 fee = (lpTokensToMint * FEE_BPS) / FEE_DENOMINATOR;
        lpTokensToMint -= fee;
        
        if (lpTokensToMint < minLPTokens) {
            revert SlippageExceeded();
        }
        
        // Update pool state
        totalHBAR += hbarAmount;
        totalValue += hbarAmount;
        
        // Mint LP tokens to user using HTS
        int64 mintAmount = int64(uint64(lpTokensToMint));
        emit HTSMintAttempt(lpToken, msg.sender, mintAmount);
        
        (int responseCode, int64 newTotalSupply, ) = mintToken(lpToken, mintAmount, new bytes[](0));
        
        if (responseCode == HederaResponseCodes.SUCCESS) {
            totalLPTokens += lpTokensToMint;
            emit HTSMintSuccess(lpToken, msg.sender, mintAmount, newTotalSupply);
        } else {
            emit HTSMintFailed(lpToken, msg.sender, mintAmount, int32(responseCode));
            revert("HTS token minting failed");
        }
        
        emit LiquidityAdded(
            msg.sender, 
            hbarAmount, 
            lpTokensToMint,
            block.timestamp
        );
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
        
        // Calculate LP tokens based on current value per token
        if (totalLPTokens == 0) {
            // First deposit: 1 HBAR = 1,000,000 LP tokens (6 decimals)
            lpTokens = hbarAmount / 100; // Convert: 8 decimals to 6 decimals with 1:1M ratio
        } else {
            // Subsequent deposits: proportional to current value
            lpTokens = (hbarAmount * totalLPTokens) / totalValue;
        }
        
        // Apply fee (reduce LP tokens by fee percentage)
        uint256 fee = (lpTokens * FEE_BPS) / FEE_DENOMINATOR;
        lpTokens -= fee;
    }
    
    /**
     * @notice Check if pool is initialized
     * @return initialized True if pool is initialized
     */
    function isInitialized() external view returns (bool initialized) {
        return totalLPTokens > 0;
    }
    
    
    /**
     * @notice Remove liquidity from the pool
     * @param lpTokens Amount of LP tokens to burn
     * @param minHBAR Minimum HBAR to receive
     */
    function removeLiquidity(
        uint256 lpTokens,
        uint256 minHBAR
    ) external nonReentrant whenNotPaused {
        if (lpTokens == 0) {
            revert InvalidAmounts();
        }
        
        if (lpTokens > totalLPTokens) {
            revert InsufficientLPBalance();
        }
        
        // Calculate HBAR amount to return based on value per token
        uint256 hbarToReturn = (lpTokens * totalValue) / totalLPTokens;
        
        if (hbarToReturn < minHBAR) {
            revert SlippageExceeded();
        }
        
        // Burn LP tokens using HTS
        int64 burnAmount = int64(uint64(lpTokens));
        (int responseCode, int64 newTotalSupply) = burnToken(lpToken, burnAmount, new int64[](0));
        
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("HTS token burning failed");
        }
        
        // Update pool state
        totalLPTokens -= lpTokens;
        totalHBAR -= hbarToReturn;
        totalValue -= hbarToReturn;
        
        // Transfer HBAR back to user
        payable(msg.sender).transfer(hbarToReturn);
        
        emit LiquidityRemoved(
            msg.sender, 
            hbarToReturn, 
            lpTokens,
            block.timestamp
        );
    }
    
    /**
     * @notice Get current pool information
     * @return hbarBalance Current HBAR balance
     * @return lpTokenSupply Current LP token supply
     * @return totalPoolValue Total pool value in HBAR
     */
    function getPoolInfo() external view returns (uint256 hbarBalance, uint256 lpTokenSupply, uint256 totalPoolValue) {
        return (totalHBAR, totalLPTokens, totalValue);
    }
    
    /**
     * @notice Get value per LP token
     * @return valuePerToken Value per LP token in HBAR (6 decimals for display)
     */
    function getValuePerLPToken() external view returns (uint256 valuePerToken) {
        if (totalLPTokens == 0) return 0;
        // totalValue is in 8 decimals (HBAR), totalLPTokens is in 6 decimals
        // Result should be in 6 decimals: (HBAR_8_decimals * 1e6) / LP_6_decimals = result_6_decimals
        return (totalValue * 1e6) / totalLPTokens;
    }
    
    /**
     * @notice Get user's value in the pool
     * @param user User address
     * @return userValue User's value in HBAR (8 decimals)
     */
    function getUserValue(address user) external view returns (uint256 userValue) {
        uint256 lpBalance = IERC20(lpToken).balanceOf(user);
        if (lpBalance == 0 || totalLPTokens == 0) return 0;
        return (lpBalance * totalValue) / totalLPTokens;
    }
    
    /**
     * @notice Get user's share of the pool
     * @param user User address
     * @return hbarShare HBAR share
     * @return lpBalance LP token balance
     */
    function getUserShare(address user) external view returns (
        uint256 hbarShare,
        uint256 lpBalance
    ) {
        lpBalance = IERC20(lpToken).balanceOf(user);
        
        if (lpBalance == 0 || totalLPTokens == 0) {
            return (0, 0);
        }
        
        // Calculate user's HBAR share based on value per token
        hbarShare = (lpBalance * totalValue) / totalLPTokens;
    }
    
    /**
     * @notice Collect accumulated fees
     * @dev Only owner can call this
     */
    function collectFees() external onlyOwner {
        // Calculate fees (simplified - in practice you'd track fees more precisely)
        uint256 feeHBAR = (totalHBAR * FEE_BPS) / FEE_DENOMINATOR;
        
        if (feeHBAR > 0) {
            payable(owner()).transfer(feeHBAR);
            emit FeesCollected(owner(), feeHBAR, block.timestamp);
        }
    }
    
    /**
     * @notice Pause the pool
     * @dev Only owner can call this
     */
    function pause() external onlyOwner {
        _pause();
        emit PoolPaused(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Unpause the pool
     * @dev Only owner can call this
     */
    function unpause() external onlyOwner {
        _unpause();
        emit PoolUnpaused(msg.sender, block.timestamp);
    }
    
    /**
     * @notice Emergency withdraw all HBAR
     * @dev Only owner can call this
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 hbarBalance = address(this).balance;
        
        if (hbarBalance > 0) {
            payable(owner()).transfer(hbarBalance);
        }
    }
    
    /**
     * @notice Receive HBAR
     */
    receive() external payable {
        // Allow receiving HBAR
    }
}

/**
 * @title HTS Token Helper Functions
 * @notice Helper functions for interacting with HTS tokens via standard ERC-20 interface
 * @dev These are used for balance checking and basic token operations
 */
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
