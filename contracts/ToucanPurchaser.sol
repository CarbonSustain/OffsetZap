// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface ToucanPool {
    function redeemAuto(uint256 amount) external;
}

contract ToucanPurchaser {
    address public poolAddress;

    constructor(address _poolAddress) {
        poolAddress = _poolAddress;
    }

    function handleBaseRequest(string memory beneficiary, uint256 amount, address sender) external {
        ToucanPool(poolAddress).redeemAuto(amount);
        // Additional logic to retire or transfer tokens can be added here
    }
}
