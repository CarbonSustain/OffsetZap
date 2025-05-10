// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IERC20 {
    function transferFrom(address from, address to, uint amount) external returns (bool);
    function approve(address spender, uint amount) external returns (bool);
}

contract CarbonOffset {
    address public owner;
    IERC20 public bct; // Toucan Base Carbon Tonne (BCT) token

    address public klimaTreasury = 0x6bD8198249Ec4731b9fCD0aDFd4C78d9E6a2E74E; // Placeholder

    constructor(address _bct) {
        owner = msg.sender;
        bct = IERC20(_bct);
    }

    function offset(uint256 amount) external {
        // User must approve BCT transfer first
        require(bct.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Approve KlimaDAO retire address to use BCT
        require(bct.approve(klimaTreasury, amount), "Approve failed");

        // Now you would call KlimaDAO’s retire function, off-chain or via smart contract (API or contract dependent)
        // This is where Klima’s retirement functionality would be hooked in.
    }
}
