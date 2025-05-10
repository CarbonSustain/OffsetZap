// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IBridgeMessenger {
    function sendMessageToPolygon(bytes calldata message) external payable;
}

contract CarbonOffsetZap {
    address public owner;
    address public acceptedToken; // e.g., USDC on Base
    IBridgeMessenger public bridge;

    constructor(address _bridge, address _acceptedToken) {
        owner = msg.sender;
        bridge = IBridgeMessenger(_bridge);
        acceptedToken = _acceptedToken;
    }

    event CarbonCreditPurchase(string method, address user, uint256 amount, string beneficiary);

    function purchaseWithETH(string memory beneficiary) external payable {
        require(msg.value > 0, "Must send ETH");

        bytes memory data = abi.encode("ETH", beneficiary, msg.value, msg.sender);
        bridge.sendMessageToPolygon{value: msg.value}(data);

        emit CarbonCreditPurchase("ETH", msg.sender, msg.value, beneficiary);
    }

    function purchaseWithERC20(string memory beneficiary, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");

        IERC20(acceptedToken).transferFrom(msg.sender, address(this), amount);

        bytes memory data = abi.encode("ERC20", beneficiary, amount, msg.sender);
        bridge.sendMessageToPolygon(data);

        emit CarbonCreditPurchase("ERC20", msg.sender, amount, beneficiary);
    }
}
