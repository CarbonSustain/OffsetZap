// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
/**
 * @title HbarOffset
 * @notice Users send HBAR with metadata describing what they want to offset.
 *         An off-chain relayer listens for the OffsetRequested event, calls
 *         Carbonmark API to retire carbon credits, and records the result.
 *
 *         HBAR lives in this contract as escrow / payment to your org.
 */
contract HbarOffset {
    event OffsetRequested(
        address indexed user,
        uint256 hbarAmount, // in wei (tinybars on Hedera)
        string metadata, // JSON or free-form string
        address poolAddress, // Pool address associated with this offset
        uint256 requestId
    );
    uint256 public nextRequestId;
    address public owner;
    constructor() {
        owner = msg.sender;
        nextRequestId = 1;
    }
    /**
     * @notice User sends HBAR and metadata describing their offset request.
     * @param metadata JSON (or any string) with fields like:
     *        {
     *          "projectId": "VCS-191",
     *          "beneficiaryName": "Acme Inc."
     *        }
     * @param amount The amount of HBAR (in tinybars) to send for the offset
     * @param poolAddress The pool address associated with this offset request
     */
    function requestOffset(
        string calldata metadata,
        uint256 amount,
        address poolAddress
    ) external {
        require(amount > 0, "Amount must be greater than 0");
        require(poolAddress != address(0), "Pool address cannot be zero");
        uint256 requestId = nextRequestId;
        nextRequestId += 1;
        emit OffsetRequested(
            msg.sender,
            amount,
            metadata,
            poolAddress,
            requestId
        );
    }
    /**
     * @notice Sweep HBAR from the contract to a treasury wallet.
     *         Typically called by your backend / ops wallet.
     */
    function sweep(address payable to, uint256 amount) external {
        require(msg.sender == owner, "Only owner");
        require(amount <= address(this).balance, "Insufficient balance");
        to.transfer(amount);
    }
    /**
     * @notice Helper to read contract balance (HBAR).
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
