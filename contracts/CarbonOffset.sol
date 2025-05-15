// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IERC20 {
    function transferFrom(address from, address to, uint amount) external returns (bool);
    function approve(address spender, uint amount) external returns (bool);
    function transfer(address to, uint amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
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

    event OffsetExecuted(address indexed beneficiary, uint256 amount, string name, string message);

    constructor(address _bct, address _klimaRetire) {
        owner = msg.sender;
        bct = IERC20(_bct);
        klimaRetireContract = IKlimaRetire(_klimaRetire);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // Accept ETH (if bridged from Base)
    receive() external payable {}

    /// @notice Offset carbon credits using BCT sent directly by user
    function offset(
        uint256 amount,
        string calldata beneficiaryName,
        string calldata message
    ) external {
        require(amount > 0, "Amount must be > 0");

        // Pull BCT from user
        require(bct.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Approve Klima aggregator
        require(bct.approve(address(klimaRetireContract), amount), "Approval failed");

        // Call KlimaDAO retirement
        klimaRetireContract.retireCarbon(
            address(bct),
            amount,
            msg.sender,
            beneficiaryName,
            message
        );

        emit OffsetExecuted(msg.sender, amount, beneficiaryName, message);
    }

    /// @notice Owner-triggered offset for use with bridged funds or delegated retirement
    function offsetFromContract(
        uint256 amount,
        address beneficiary,
        string calldata beneficiaryName,
        string calldata message
    ) external onlyOwner {
        require(amount > 0, "Amount must be > 0");

        // Approve Klima aggregator
        require(bct.approve(address(klimaRetireContract), amount), "Approval failed");

        // Call KlimaDAO retirement
        klimaRetireContract.retireCarbon(
            address(bct),
            amount,
            beneficiary,
            beneficiaryName,
            message
        );

        emit OffsetExecuted(beneficiary, amount, beneficiaryName, message);
    }
    
    // Optional: withdraw leftover funds
    function withdraw(address token, address to) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transfer(to, balance), "Withdraw failed");
    }
}