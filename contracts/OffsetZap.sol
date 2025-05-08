// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title OffsetZap
 * @dev A simple contract to simulate onchain carbon offsetting on Base Sepolia.
 * Funds sent will simulate a retirement of carbon credits.
 */
contract OffsetZap {
    address public owner;
    uint256 public totalOffsets;

    event Offset(address indexed user, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    // Accept ETH and log offset event
    receive() external payable {
        require(msg.value > 0, "No ETH sent");
        totalOffsets += msg.value;
        emit Offset(msg.sender, msg.value);
    }

    // Emergency: Withdraw contract funds (owner only)
    function withdraw() external {
        require(msg.sender == owner, "Only owner");
        payable(owner).transfer(address(this).balance);
    }

    // Get current contract balance (for dashboard)
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
} 
