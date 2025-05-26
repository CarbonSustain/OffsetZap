// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IToucanContractRegistry
 * @dev Interface for the Toucan Protocol contract registry
 */
interface IToucanContractRegistry {
    /**
     * @dev Retire carbon credits
     * @param projectVintage The address of the carbon project vintage token
     * @param amount The amount of tokens to retire
     * @param beneficiary The address to attribute the retirement to
     * @param retirementMessage Optional message for the retirement
     */
    function retire(
        address projectVintage,
        uint256 amount,
        address beneficiary,
        string calldata retirementMessage
    ) external;
    
    /**
     * @dev Get the retirement certificate contract address
     * @return The address of the retirement certificate contract
     */
    function getRetirementCertificateAddress() external view returns (address);
}