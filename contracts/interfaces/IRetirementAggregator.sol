// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ICarbonPool.sol";

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
     * @return retirementIndex The retirement index
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
     * @return retiringAddress The address that performed the retirement
     * @return beneficiaryAddress The address of the beneficiary
     * @return beneficiaryString The string representation of the beneficiary
     * @return retirementMessage The retirement message
     * @return amount The amount of tokens retired
     * @return carbonPool The address of the carbon pool
     */
    function getRetirementDetails(uint256 _index) external view returns (
        address retiringAddress,
        address beneficiaryAddress,
        string memory beneficiaryString,
        string memory retirementMessage,
        uint256 amount,
        address carbonPool
    );
    
    /**
     * @notice Retires an exact amount of carbon using KLIMA tokens
     * @param _pool The carbon pool to retire from
     * @param _klimaAmount Amount of KLIMA tokens to use
     * @param _beneficiaryAddress Address of the beneficiary
     * @return retirementProof The proof of retirement (bytes32 hash)
     */
    function retireExactCarbon(
        ICarbonPool _pool,
        uint256 _klimaAmount,
        address _beneficiaryAddress
    ) external returns (bytes32);
}

