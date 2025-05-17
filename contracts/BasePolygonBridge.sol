// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract BasePolygonBridge {
    address public owner;

    // Polygon-side contract that will perform the carbon offset (manually triggered by teammate)
    address public polygonContractAddress;

    // USDC token address on Base Sepolia (replace with correct address)
    address public usdcAddress;

    event BridgeRequest(
        address indexed sender,
        uint256 ethAmount,
        uint256 usdcAmount,
        string message,
        string name
    );

    constructor(address _polygonContractAddress, address _usdcAddress) {
        owner = msg.sender;
        polygonContractAddress = _polygonContractAddress;
        usdcAddress = _usdcAddress;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    /// @notice User calls this to initiate a bridge request with ETH and/or USDC
    function forwardFundsToPolygon(
        uint256 amountInETH,
        uint256 amountInUSDC,
        string calldata name,
        string calldata message
    ) external payable {
        // Handle ETH
        if (amountInETH > 0) {
            require(msg.value == amountInETH, "Sent ETH mismatch");
        }

        // Handle USDC
        if (amountInUSDC > 0) {
            require(
                IERC20(usdcAddress).transferFrom(msg.sender, address(this), amountInUSDC),
                "USDC transfer failed"
            );
        }

        // Emit the event so your teammate (on Polygon) can read it and trigger offset
        emit BridgeRequest(msg.sender, amountInETH, amountInUSDC, message, name);
    }

    /// @notice Emergency function to withdraw funds
    function withdraw(address token, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(owner, amount), "Withdraw failed");
    }

    /// @notice Fallback to accept ETH
    receive() external payable {}
}
