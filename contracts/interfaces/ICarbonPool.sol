// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ICarbonPool
 * @dev Interface for the Carbon Pool contract
 */
interface ICarbonPool {
    /**
     * @notice Deposits tokens into the carbon pool
     * @param _amount Amount of tokens to deposit
     * @return The amount of pool tokens minted
     */
    function deposit(uint256 _amount) external returns (uint256);
    
    /**
     * @notice Withdraws tokens from the carbon pool
     * @param _amount Amount of pool tokens to burn
     * @return The amount of underlying tokens returned
     */
    function withdraw(uint256 _amount) external returns (uint256);
    
    /**
     * @notice Gets the underlying token of the pool
     * @return The address of the underlying token
     */
    function getUnderlyingToken() external view returns (address);
    
    /**
     * @notice Gets the current exchange rate between pool tokens and underlying tokens
     * @return The exchange rate (in basis points)
     */
    function getExchangeRate() external view returns (uint256);
    
    /**
     * @notice Converts an amount of pool tokens to the equivalent amount of underlying tokens
     * @param _poolTokenAmount Amount of pool tokens
     * @return The equivalent amount of underlying tokens
     */
    function convertToUnderlying(uint256 _poolTokenAmount) external view returns (uint256);
    
    /**
     * @notice Converts an amount of underlying tokens to the equivalent amount of pool tokens
     * @param _underlyingAmount Amount of underlying tokens
     * @return The equivalent amount of pool tokens
     */
    function convertToPoolToken(uint256 _underlyingAmount) external view returns (uint256);
}


