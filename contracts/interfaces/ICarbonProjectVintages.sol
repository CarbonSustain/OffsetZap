// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ICarbonProjectVintages
 * @dev Interface for carbon project vintages in the Toucan Protocol
 */
interface ICarbonProjectVintages {
    /**
     * @dev Approve spender to use a certain amount of tokens
     * @param spender The address which will be allowed to spend tokens
     * @param amount The amount of tokens to be approved
     * @return Whether the approval was successful
     */
    function approve(address spender, uint256 amount) external returns (bool);
    
    /**
     * @dev Get the balance of an account
     * @param account The address to query the balance of
     * @return The token balance
     */
    function balanceOf(address account) external view returns (uint256);
    
    /**
     * @dev Transfer tokens to a recipient
     * @param recipient The address to transfer to
     * @param amount The amount to transfer
     * @return Whether the transfer was successful
     */
    function transfer(address recipient, uint256 amount) external returns (bool);
    
    /**
     * @dev Transfer tokens from one address to another
     * @param sender The address which you want to send tokens from
     * @param recipient The address which you want to transfer to
     * @param amount The amount of tokens to be transferred
     * @return Whether the transfer was successful
     */
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}