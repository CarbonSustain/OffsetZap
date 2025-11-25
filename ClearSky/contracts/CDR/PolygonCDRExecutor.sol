// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
/// @notice Minimal ERC20 interface
interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}
/// @notice Interface to KlimaDAO's Retirement Aggregator (simplified; dev must replace with real ABI)
interface IKlimaRetirementAggregator {
    function retireExactCarbonDefault(
        address fromToken,        // e.g., USDC
        uint256 amountIn,         // amount of USDC
        address poolToken,        // e.g., BCT or NCT
        address beneficiaryAddress,
        string calldata beneficiaryString,
        string calldata retirementMessage
    ) external returns (uint256 retirementAmount);
}
/// @title PolygonCDRExecutor
/// @notice Receives USDC (from relayer), uses Klima/Toucan to retire BCT/NCT,
///         and emits an event that can be linked back to Hedera.
contract PolygonCDRExecutor {
    enum PoolType { BCT, NCT }
    address public owner;
    address public relayer;
    IERC20 public usdc;
    address public bctToken;  // BCT ERC20 address
    address public nctToken;  // NCT ERC20 address
    IKlimaRetirementAggregator public klimaAgg;
    event PolygonRetirementExecuted(
        uint256 indexed hederaRequestId,
        address indexed polygonReceiver,
        PoolType pool,
        uint256 usdcSpent,
        uint256 tonsRetired,
        string beneficiary,
        string message
    );
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }
    constructor(
        address _usdc,
        address _bct,
        address _nct,
        address _klimaAgg,
        address _relayer
    ) {
        owner = msg.sender;
        usdc = IERC20(_usdc);
        bctToken = _bct;
        nctToken = _nct;
        klimaAgg = IKlimaRetirementAggregator(_klimaAgg);
        relayer = _relayer;
    }
    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }
    function setKlimaAggregator(address _klimaAgg) external onlyOwner {
        klimaAgg = IKlimaRetirementAggregator(_klimaAgg);
    }
    /// @notice Called by relayer after USDC has been bridged to relayer wallet
    ///         and approved to this contract.
    /// @param hederaRequestId  ID emitted in Hedera's RetirementRequested event
    /// @param polygonReceiver  EVM address associated with user / beneficiary
    /// @param pool             0 = BCT, 1 = NCT
    /// @param usdcAmount       Amount of USDC to use
    /// @param beneficiary      Beneficiary string (for certificate)
    /// @param message          Retirement message
    function executeRetirement(
        uint256 hederaRequestId,
        address polygonReceiver,
        PoolType pool,
        uint256 usdcAmount,
        string calldata beneficiary,
        string calldata message
    ) external onlyRelayer {
        require(usdcAmount > 0, "No USDC amount");
        require(polygonReceiver != address(0), "Bad receiver");
        // 1. Pull USDC from relayer EOA into this contract
        bool ok = usdc.transferFrom(msg.sender, address(this), usdcAmount);
        require(ok, "USDC transferFrom failed");
        // 2. Approve Klima aggregator to spend USDC
        ok = usdc.approve(address(klimaAgg), usdcAmount);
        require(ok, "USDC approve failed");
        // 3. Determine which pool token to retire
        address poolToken = (pool == PoolType.BCT) ? bctToken : nctToken;
        // 4. Call Klima aggregator to do the swap + retirement
        // NOTE: This is a placeholder signature; dev must adjust to match Klima's actual contract.
        uint256 tonsRetired = klimaAgg.retireExactCarbonDefault(
            address(usdc),
            usdcAmount,
            poolToken,
            polygonReceiver,
            beneficiary,
            message
        );
        emit PolygonRetirementExecuted(
            hederaRequestId,
            polygonReceiver,
            pool,
            usdcAmount,
            tonsRetired,
            beneficiary,
            message
        );
    }
}