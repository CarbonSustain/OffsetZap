// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IERC20 {
    function transferFrom(address from, address to, uint amount) external returns (bool);
    function approve(address spender, uint amount) external returns (bool);
}

interface IKlimaRetire {
    function retireCarbon(
        address sourceToken,
        uint256 amount,
        address beneficiaryAddress,
        string calldata beneficiaryName,
        string calldata retirementMessage
    ) external;
}

contract CarbonOffset {
    address public owner;
    IERC20 public bct;
    IKlimaRetire public klimaRetireContract;

    constructor(address _bct, address _klimaRetire) {
        owner = msg.sender;
        bct = IERC20(_bct);
        klimaRetireContract = IKlimaRetire(_klimaRetire);
    }

    function offset(
        uint256 amount,
        string calldata beneficiaryName,
        string calldata message
    ) external {
        require(amount > 0, "Amount must be > 0");

        // Pull BCT from user
        require(bct.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Approve Klima's contract to spend BCT
        require(bct.approve(address(klimaRetireContract), amount), "Approval failed");

        // Call Klima’s on-chain retirement
        klimaRetireContract.retireCarbon(
            address(bct),
            amount,
            msg.sender, // you can customize this
            beneficiaryName,
            message
        );
    }
}
