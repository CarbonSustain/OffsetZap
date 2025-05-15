// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

// Interface for ERC20 tokens (like USDC)
interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract OffsetZap {
    address public owner;
    uint256 public totalOffsets;
    address public polygonContract; // Polygon contract address for carbon offset

    event Offset(address indexed user, uint256 amount);

    constructor(address _polygonContract) {
        owner = msg.sender;
        polygonContract = _polygonContract;
    }

    // Accept ETH and forward it to the Polygon contract
    receive() external payable {
        require(msg.value > 0, "No ETH sent");
        totalOffsets += msg.value;
        emit Offset(msg.sender, msg.value);
        
        // Forward ETH to Polygon
        forwardToPolygon(msg.value);
    }

    // Accept USDC and forward it to the Polygon contract
    function acceptUSDC(address usdcAddress, uint256 amount) external {
        require(amount > 0, "No USDC sent");
        IERC20(usdcAddress).transfer(polygonContract, amount); // Send USDC to Polygon
        totalOffsets += amount;
        emit Offset(msg.sender, amount);
        
        // Forward USDC to Polygon
        forwardToPolygon(amount);
    }

    // Forward funds to the Polygon contract (ETH or USDC)
    function forwardToPolygon(uint256 amount) private {
        require(amount > 0, "No funds to forward");

        // Transfer ETH to the Polygon contract
        (bool success, ) = polygonContract.call{value: amount}("");
        require(success, "Transfer to Polygon contract failed");
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
