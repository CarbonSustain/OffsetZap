// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @title IRetirementAggregator
 * @dev Interface for the Retirement Aggregator contract
 */
interface IRetirementAggregator {
    /**
     * @notice Retires carbon credits
     * @param _poolToken Address of the pool token
     * @param _amount Amount of tokens to retire
     * @param _beneficiaryAddress Address of the beneficiary
     * @param _beneficiaryString String representation of the beneficiary
     * @param _retirementMessage Additional retirement message
     * @return The retirement index
     */
    function retire(
        address _poolToken,
        uint256 _amount,
        address _beneficiaryAddress,
        string memory _beneficiaryString,
        string memory _retirementMessage
    ) external returns (uint256);
    
    /**
     * @notice Gets the retirement record for a given index
     * @param _index The retirement index
     * @return The retirement record details
     */
    function getRetirementDetails(uint256 _index) external view returns (
        address retiringAddress,
        address beneficiaryAddress,
        string memory beneficiaryString,
        string memory retirementMessage,
        uint256 amount,
        address carbonPool
    );
}


