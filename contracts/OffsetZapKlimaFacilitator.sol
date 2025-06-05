// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IERC20
 * @dev Interface for the ERC20 standard.
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title IKlimaRetirementAggregator
 * @dev Interface for the KlimaDAO Retirement Aggregator.
 */
interface IKlimaRetirementAggregator {
    function retireCarbon(
        address _sourceToken,
        address _poolToken,
        uint256 _amount,
        bool _amountInCarbon,
        address _beneficiaryAddress,
        string memory _beneficiaryString,
        string memory _retirementMessage
    ) external;
    
    function isPoolToken(address poolToken) external view returns (bool);
    
    function getSourceAmount(
        address _sourceToken,
        address _poolToken,
        uint256 _amount,
        bool _amountInCarbon
    ) external view returns (uint256, uint256);
}

/**
 * @title OffsetZapKlimaFacilitator
 * @dev This contract facilitates carbon retirement using USDC via KlimaDAO's Aggregator.
 * It is designed to be called by the Across Protocol message handler.
 */
contract OffsetZapKlimaFacilitator {
    address public immutable owner;
    address public immutable usdcTokenAddress;         // USDC token on Polygon Amoy
    address public immutable klimaAggregatorAddress;   // KlimaDAO Retirement Aggregator V2
    address public immutable defaultPoolTokenAddress;  // Default carbon pool token (e.g., BCT)

    event CarbonRetiredViaFacilitator(
        address indexed beneficiary,
        string beneficiaryName,
        uint256 usdcAmountRetired
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _usdcTokenAddress,
        address _klimaAggregatorAddress,
        address _defaultPoolTokenAddress
    ) {
        owner = msg.sender;
        usdcTokenAddress = _usdcTokenAddress;
        klimaAggregatorAddress = _klimaAggregatorAddress;
        defaultPoolTokenAddress = _defaultPoolTokenAddress;
    }

    /**
     * @notice Retires carbon using a specified amount of USDC.
     * @dev This function is intended to be called by the Across Protocol message handler.
     * The caller (Across handler) must have been approved by the original USDC sender
     * to transfer USDC to this contract, OR this contract must have been approved by the
     * Across handler to spend its USDC (which is the case based on across.js).
     * @param usdcAmountToRetire The amount of USDC to use for retirement.
     * @param beneficiaryName A string identifying the beneficiary.
     * @param beneficiaryAddress The address of the beneficiary.
     * @param poolToken The address of the carbon pool token to use (e.g., BCT, NCT, etc.)
     */
    function retireWithUsdc(
        uint256 usdcAmountToRetire,
        string calldata beneficiaryName,
        address beneficiaryAddress,
        address poolToken
    ) external {
        require(usdcAmountToRetire > 0, "Amount must be greater than zero");

        // 1. Transfer USDC from the caller (Across handler) to this contract.
        // The `approve` in across.js is: `usdcToken.approve(this_contract_address, amount)`
        // This means this contract (facilitatorAddress) is the spender, and msg.sender (Across handler) is the owner of the approval.
        // So, this contract calls transferFrom on the USDC token, pulling funds from msg.sender.
        IERC20 usdc = IERC20(usdcTokenAddress);
        require(usdc.transferFrom(msg.sender, address(this), usdcAmountToRetire), "USDC_TRANSFER_FROM_FAILED");

        // Get the estimated carbon amount we can retire with this USDC
        IKlimaRetirementAggregator klimaAggregator = IKlimaRetirementAggregator(klimaAggregatorAddress);
        
        // Use the provided pool token or fall back to the default if address(0) is provided
        address selectedPoolToken = poolToken == address(0) ? defaultPoolTokenAddress : poolToken;
        
        // Verify that the selected pool token is valid
        require(klimaAggregator.isPoolToken(selectedPoolToken), "Invalid pool token");
        
        // Calculate how much carbon we can retire with the USDC amount
        // The second return value is the carbon amount, but we don't need it here
        (uint256 approvalAmount, ) = klimaAggregator.getSourceAmount(
            usdcTokenAddress,          // sourceToken: USDC
            selectedPoolToken,         // poolToken: the selected carbon pool token
            usdcAmountToRetire,        // amount: all the USDC we received
            false                      // amountInCarbon: false because we're specifying USDC amount, not carbon amount
        );
        
        // 2. Approve KlimaDAO Aggregator to spend the USDC from this contract
        require(usdc.approve(klimaAggregatorAddress, approvalAmount), "USDC_APPROVE_FOR_AGGREGATOR_FAILED");

        // 3. Call retireCarbon on KlimaDAO Aggregator
        klimaAggregator.retireCarbon(
            usdcTokenAddress,           // sourceToken: USDC
            selectedPoolToken,          // poolToken: the selected carbon pool token
            usdcAmountToRetire,         // amount: all the USDC we received
            false,                      // amountInCarbon: false because we're specifying USDC amount, not carbon amount
            beneficiaryAddress,         // beneficiaryAddress for the retirement NFT etc.
            beneficiaryName,            // beneficiaryString
            "Carbon retirement via OffsetZap" // retirementMessage
        );

        emit CarbonRetiredViaFacilitator(
            beneficiaryAddress,
            beneficiaryName,
            usdcAmountToRetire
        );
    }

    // Function to allow owner to withdraw any accidentally sent ETH
    function withdrawEth() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    // Function to allow owner to withdraw any accidentally sent ERC20 tokens
    function withdrawTokens(address tokenAddress) external onlyOwner {
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) {
            token.transfer(owner, balance);
        }
    }
}
