// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ClearSky Liquidity Pool
 * @notice A liquidity pool that accepts both USDC and HBAR, minting LP tokens
 * @dev Built for Hedera network with HTS LP tokens
 */
contract ClearSkyLiquidityPool is Ownable, ReentrancyGuard, Pausable {
    // Token addresses
    address public immutable usdcToken;
    address public immutable lpToken;
    
    // Pool state
    uint256 public totalUSDC;
    uint256 public totalHBAR;
    uint256 public totalLPTokens;
    
    // Fees (in basis points: 100 = 1%)
    uint256 public constant FEE_BPS = 30; // 0.3% fee
    uint256 public constant FEE_DENOMINATOR = 10000;
    
    // Minimum liquidity amounts
    uint256 public constant MIN_LIQUIDITY = 1000; // 0.001 HBAR in wei
    
    // Events
    event LiquidityAdded(
        address indexed user,
        uint256 usdcAmount,
        uint256 hbarAmount,
        uint256 lpTokensMinted,
        uint256 timestamp
    );
    
    event LiquidityRemoved(
        address indexed user,
        uint256 usdcAmount,
        uint256 hbarAmount,
        uint256 lpTokensBurned,
        uint256 timestamp
    );
    
    event FeesCollected(
        address indexed collector,
        uint256 usdcAmount,
        uint256 hbarAmount,
        uint256 timestamp
    );
    
    event PoolPaused(address indexed pauser, uint256 timestamp);
    event PoolUnpaused(address indexed unpauser, uint256 timestamp);
    
    // Errors
    error InsufficientLiquidity();
    error InsufficientAmount();
    error InsufficientLPBalance();
    error PoolNotActive();
    error InvalidAmounts();
    error SlippageExceeded();
    
    /**
     * @notice Constructor
     * @param _usdcToken USDC token address on Hedera
     * @param _lpToken LP token address (HTS token)
     * @param _owner Owner of the contract
     */
    constructor(
        address _usdcToken, 
        address _lpToken,
        address _owner
    ) Ownable(_owner) {
        require(_usdcToken != address(0), "Invalid USDC address");
        require(_lpToken != address(0), "Invalid LP token address");
        require(_owner != address(0), "Invalid owner address");
        
        usdcToken = _usdcToken;
        lpToken = _lpToken;
    }
    
    /**
     * @notice Add liquidity to the pool
     * @param usdcAmount Amount of USDC to add
     * @param minLPTokens Minimum LP tokens to receive (slippage protection)
     */
    function addLiquidity(
        uint256 usdcAmount,
        uint256 minLPTokens
    ) external payable nonReentrant whenNotPaused {
        if (usdcAmount == 0 || msg.value == 0) {
            revert InvalidAmounts();
        }
        
        // Transfer USDC from user
        IERC20(usdcToken).transferFrom(msg.sender, address(this), usdcAmount);
        
        // Calculate LP tokens to mint
        uint256 lpTokensToMint = calculateLPTokens(usdcAmount, msg.value);
        
        if (lpTokensToMint < minLPTokens) {
            revert SlippageExceeded();
        }
        
        // Mint LP tokens to user
        // Note: This contract needs to have minting rights on the LP token
        ILPToken(lpToken).mint(msg.sender, lpTokensToMint);
        
        // Update pool state
        totalUSDC += usdcAmount;
        totalHBAR += msg.value;
        totalLPTokens += lpTokensToMint;
        
        emit LiquidityAdded(
            msg.sender, 
            usdcAmount, 
            msg.value, 
            lpTokensToMint,
            block.timestamp
        );
    }
    
    /**
     * @notice Remove liquidity from the pool
     * @param lpTokens Amount of LP tokens to burn
     * @param minUSDC Minimum USDC to receive
     * @param minHBAR Minimum HBAR to receive
     */
    function removeLiquidity(
        uint256 lpTokens,
        uint256 minUSDC,
        uint256 minHBAR
    ) external nonReentrant whenNotPaused {
        if (lpTokens == 0) {
            revert InvalidAmounts();
        }
        
        if (lpTokens > totalLPTokens) {
            revert InsufficientLPBalance();
        }
        
        // Calculate amounts to return
        uint256 usdcToReturn = (lpTokens * totalUSDC) / totalLPTokens;
        uint256 hbarToReturn = (lpTokens * totalHBAR) / totalLPTokens;
        
        if (usdcToReturn < minUSDC || hbarToReturn < minHBAR) {
            revert SlippageExceeded();
        }
        
        // Burn LP tokens
        ILPToken(lpToken).burnFrom(msg.sender, lpTokens);
        
        // Update pool state
        totalLPTokens -= lpTokens;
        totalUSDC -= usdcToReturn;
        totalHBAR -= hbarToReturn;
        
        // Transfer tokens back to user
        IERC20(usdcToken).transfer(msg.sender, usdcToReturn);
        payable(msg.sender).transfer(hbarToReturn);
        
        emit LiquidityRemoved(
            msg.sender, 
            usdcToReturn, 
            hbarToReturn, 
            lpTokens,
            block.timestamp
        );
    }
    
    /**
     * @notice Calculate LP tokens for given amounts
     * @param usdcAmount Amount of USDC
     * @param hbarAmount Amount of HBAR
     * @return lpTokens LP tokens to mint
     */
    function calculateLPTokens(
        uint256 usdcAmount,
        uint256 hbarAmount
    ) public view returns (uint256 lpTokens) {
        if (totalLPTokens == 0) {
            // First liquidity provider - use geometric mean
            lpTokens = sqrt(usdcAmount * hbarAmount);
        } else {
            // Calculate proportional LP tokens
            uint256 usdcLPTokens = (usdcAmount * totalLPTokens) / totalUSDC;
            uint256 hbarLPTokens = (hbarAmount * totalLPTokens) / totalHBAR;
            
            // Return the smaller amount to maintain ratio
            lpTokens = usdcLPTokens < hbarLPTokens ? usdcLPTokens : hbarLPTokens;
        }
        
        // Apply fee
        lpTokens = (lpTokens * (FEE_DENOMINATOR - FEE_BPS)) / FEE_DENOMINATOR;
    }
    
    /**
     * @notice Get current pool ratio
     * @return usdcRatio USDC ratio in the pool
     * @return hbarRatio HBAR ratio in the pool
     */
    function getPoolRatio() external view returns (uint256 usdcRatio, uint256 hbarRatio) {
        uint256 totalValue = totalUSDC + totalHBAR;
        if (totalValue == 0) return (0, 0);
        
        usdcRatio = (totalUSDC * 10000) / totalValue;
        hbarRatio = (totalHBAR * 10000) / totalValue;
    }
    
    /**
     * @notice Get user's share of the pool
     * @param user User address
     * @return usdcShare USDC share
     * @return hbarShare HBAR share
     * @return lpBalance LP token balance
     */
    function getUserShare(address user) external view returns (
        uint256 usdcShare,
        uint256 hbarShare,
        uint256 lpBalance
    ) {
        lpBalance = IERC20(lpToken).balanceOf(user);
        
        if (lpBalance == 0 || totalLPTokens == 0) {
            return (0, 0, 0);
        }
        
        usdcShare = (lpBalance * totalUSDC) / totalLPTokens;
        hbarShare = (lpBalance * totalHBAR) / totalLPTokens;
    }
    
    /**
     * @notice Collect accumulated fees
     * @dev Only owner can call this
     */
    function collectFees() external onlyOwner {
        // Calculate fees (simplified - in practice you'd track fees more precisely)
        uint256 feeUSDC = (totalUSDC * FEE_BPS) / FEE_DENOMINATOR;
        uint256 feeHBAR = (totalHBAR * FEE_BPS) / FEE_DENOMINATOR;
        
        if (feeUSDC > 0) {
            IERC20(usdcToken).transfer(owner(), feeUSDC);
        }
        
        if (feeHBAR > 0) {
            payable(owner()).transfer(feeHBAR);
        }
        
        emit FeesCollected(owner(), feeUSDC, feeHBAR, block.timestamp);
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
     * @notice Emergency withdraw tokens
     * @dev Only owner can call this
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 usdcBalance = IERC20(usdcToken).balanceOf(address(this));
        uint256 hbarBalance = address(this).balance;
        
        if (usdcBalance > 0) {
            IERC20(usdcToken).transfer(owner(), usdcBalance);
        }
        
        if (hbarBalance > 0) {
            payable(owner()).transfer(hbarBalance);
        }
    }
    
    /**
     * @notice Square root function for geometric mean calculation
     * @param y Number to find square root of
     * @return z Square root
     */
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
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
 * @title Interface for LP Token
 * @notice Defines the interface for the HTS LP token
 */
interface ILPToken {
    function mint(address to, uint256 amount) external;
    function burnFrom(address from, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
} 