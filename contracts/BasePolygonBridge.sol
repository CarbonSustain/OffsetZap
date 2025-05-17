// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BasePolygonBridge {
    address public owner;
    address public polygonContractAddress;
    event MessageSent(bytes data);
    
    // Token address for USDC on Base Sepolia (replace with actual contract address)
    address public usdcAddress;

    constructor(address _polygonContractAddress, address _usdcAddress) {
        owner = msg.sender;
        polygonContractAddress = _polygonContractAddress;
        usdcAddress = _usdcAddress;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    // Function to forward ETH or USDC to Polygon contract
    function forwardFundsToPolygon(uint256 amountInETH, uint256 amountInUSDC) external payable {
        // Forward ETH
        if (amountInETH > 0) {
            require(msg.value == amountInETH, "Sent ETH does not match requested amount");
            // Forward ETH to the Polygon contract
            (bool success, ) = polygonContractAddress.call{value: amountInETH}("");
            require(success, "Failed to send ETH to Polygon contract");
            emit MessageSent(abi.encodePacked("ETH forwarded to Polygon"));
        }

        // Forward USDC
        if (amountInUSDC > 0) {
            IERC20(usdcAddress).transferFrom(msg.sender, polygonContractAddress, amountInUSDC);
            emit MessageSent(abi.encodePacked("USDC forwarded to Polygon"));
        }
    }

    // Emergency function to withdraw any remaining funds (only for the owner)
    function withdraw(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner, amount), "Withdraw failed");
    }

    // Fallback function to accept ETH directly
    receive() external payable {}
}



