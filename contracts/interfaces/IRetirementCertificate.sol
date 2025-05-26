// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title IRetirementCertificate
 * @dev Interface for retirement certificates in the Toucan Protocol
 */
interface IRetirementCertificate {
    /**
     * @dev Create a retirement certificate
     * @param retiringEntity The address of the entity retiring carbon credits
     * @param beneficiary The address to attribute the retirement to
     * @param projectVintage The address of the carbon project vintage token
     * @param amount The amount of tokens retired
     * @param retirementMessage Optional message for the retirement
     * @return The ID of the created certificate
     */
    function createRetirementCertificate(
        address retiringEntity,
        address beneficiary,
        address projectVintage,
        uint256 amount,
        string calldata retirementMessage
    ) external returns (uint256);
    
    /**
     * @dev Get retirement certificate details
     * @param certificateId The ID of the certificate
     * @return retiringEntity The address of the entity that retired the credits
     * @return beneficiary The address the retirement was attributed to
     * @return projectVintage The address of the carbon project vintage token
     * @return amount The amount of tokens retired
     * @return retirementMessage The retirement message
     * @return creationDate The timestamp when the certificate was created
     */
    function getCertificateData(uint256 certificateId) external view returns (
        address retiringEntity,
        address beneficiary,
        address projectVintage,
        uint256 amount,
        string memory retirementMessage,
        uint256 creationDate
    );
}