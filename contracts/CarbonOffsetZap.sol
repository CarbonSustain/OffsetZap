// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IBridgeMessenger {
    function sendMessageToPolygon(bytes calldata message) external payable;
}

contract CarbonOffsetZap {
    address public owner;
    IBridgeMessenger public bridge;

    constructor(address _bridge) {
        owner = msg.sender;
        bridge = IBridgeMessenger(_bridge);
    }

    function purchaseCarbonCredits(string memory beneficiary, uint256 amount) external payable {
        require(msg.value == amount, "Incorrect ETH amount");

        bytes memory data = abi.encode(beneficiary, amount, msg.sender);
        bridge.sendMessageToPolygon{value: msg.value}(data);
    }
}
