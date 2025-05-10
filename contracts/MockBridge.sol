// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

contract MockBridge {
    event MessageSent(bytes data);

    function sendMessageToPolygon(bytes calldata message) external payable {
        emit MessageSent(message);
    }
}
