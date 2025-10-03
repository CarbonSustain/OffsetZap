// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./ClearSkyLiquidityPoolV3.sol";
import "./FCDR1155.sol";
import "./HederaTokenService.sol";
import "./HederaResponseCodes.sol";
import "./KeyHelper.sol";

/**
 * @title ClearSkyFactory
 * @notice Factory contract for creating individual liquidity pools for each user
 * @dev Each user gets their own dedicated pool while sharing CSLP and FCDR tokens
 */
contract ClearSkyFactory is HederaTokenService, KeyHelper {
    // Mapping from user address to their pool address
    mapping(address => address) public userPools;

    // Array of all created pools
    address[] public allPools;
    // Quick allowlist to validate calls originating from pools
    mapping(address => bool) public isPool;

    // Shared tokens used across all pools
    address public cslpToken;
    address public fcdr1155Contract; // ERC-1155 FCDR contract

    // Factory owner
    address public owner;

    // Events
    event PoolCreated(
        address indexed user,
        address indexed poolAddress,
        uint256 poolIndex
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Only factory owner");
        _;
    }

    // Allow calls from factory owner OR a pool created by this factory
    modifier onlyOwnerOrPool() {
        require(msg.sender == owner || isPool[msg.sender], "Not authorized");
        _;
    }

    /**
     * @notice Constructor - simple setup without token creation
     * @dev Tokens will be created in separate transactions
     */
    constructor() {
        owner = msg.sender;
        cslpToken = address(0); // Will be set later
        fcdr1155Contract = address(0); // Will be set later

        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Create a new liquidity pool for a user
     * @param user The user address that will own this pool
     * @return poolAddress The address of the newly created pool
     */
    function createUserPool(address user) external onlyOwner returns (address) {
        require(user != address(0), "Invalid user address");
        require(userPools[user] == address(0), "Pool already exists for user");

        // Deploy new pool contract
        ClearSkyLiquidityPoolV3 newPool = new ClearSkyLiquidityPoolV3(
            address(this), // factory address
            user, // pool user (for tracking only)
            cslpToken, // shared CSLP token
            fcdr1155Contract, // FCDR1155 contract address
            owner // global owner of pools
        );

        address poolAddress = address(newPool);

        // Register the new pool with FCDR1155 contract
        if (fcdr1155Contract != address(0)) {
            FCDR1155(fcdr1155Contract).registerLP(poolAddress);
        }

        // Note: Token association will be handled by the frontend after pool creation

        // Store the mapping
        userPools[user] = poolAddress;
        allPools.push(poolAddress);
        isPool[poolAddress] = true;

        emit PoolCreated(user, poolAddress, allPools.length - 1);

        return poolAddress;
    }

    /**
     * @notice Get the pool address for a specific user
     * @param user The user address
     * @return poolAddress The pool address for the user, or address(0) if not found
     */
    function getUserPool(address user) external view returns (address) {
        return userPools[user];
    }

    function mintCSLP(address user, uint256 amount) external onlyOwnerOrPool {
        int64 mintAmount = int64(uint64(amount));
        (int responseCode, , ) = HederaTokenService.mintToken(
            cslpToken,
            mintAmount,
            new bytes[](0)
        );
        require(responseCode == HederaResponseCodes.SUCCESS);
        int transferResponseCode = HederaTokenService.transferToken(
            cslpToken,
            address(this),
            user,
            mintAmount
        );
        require(transferResponseCode == HederaResponseCodes.SUCCESS);
    }

    function mintFCDR(
        address poolAddress,
        address fcdrOwner,
        uint256 hbarAmount
    ) external onlyOwnerOrPool {
        require(fcdr1155Contract != address(0), "FCDR1155 contract not set");
        FCDR1155(fcdr1155Contract).mintFCDRWithMetadata(
            fcdrOwner,
            poolAddress,
            hbarAmount,
            ""
        );
    }

    function burnCSLP(uint256 amount) external onlyOwnerOrPool {
        int64 burnAmount = int64(uint64(amount));
        int64[] memory serialNumbers = new int64[](0);
        (int responseCode, ) = HederaTokenService.burnToken(
            cslpToken,
            burnAmount,
            serialNumbers
        );
        require(responseCode == HederaResponseCodes.SUCCESS);
    }

    function getAllPools() external view returns (address[] memory) {
        return allPools;
    }

    function hasPool(address user) external view returns (bool) {
        return userPools[user] != address(0);
    }

    /**
     * @notice Create shared CSLP token (Owner only)
     * @dev This token will be used across all pools
     */
    function createCSLPToken() external payable onlyOwner {
        require(cslpToken == address(0), "CSLP token already created");
        cslpToken = _createCSLPToken();
    }

    /**
     * @notice Set FCDR1155 contract address (Owner only)
     * @dev This contract will be used for FCDR tokens across all pools
     */
    function setFCDR1155Contract(address _fcdr1155Contract) external onlyOwner {
        require(
            _fcdr1155Contract != address(0),
            "Invalid FCDR1155 contract address"
        );
        fcdr1155Contract = _fcdr1155Contract;
    }

    /**
     * @notice Create shared CSLP token using Hedera HTS
     * @dev This token will be used across all pools
     * @return tokenAddress The address of the created CSLP token
     */
    function _createCSLPToken() internal returns (address) {
        // Create HederaToken struct - exactly like the working pool example
        IHederaTokenService.HederaToken memory token;
        token.name = "ClearSky LP Token";
        token.symbol = "CSLP";
        token.treasury = address(this); // Factory is treasury
        token.tokenKeys = new IHederaTokenService.TokenKey[](1);

        // Create supply key exactly like the working example
        IHederaTokenService.TokenKey memory tokenKey = super.getSingleKey(
            KeyType.SUPPLY,
            KeyValueType.CONTRACT_ID,
            address(this)
        );
        token.tokenKeys[0] = tokenKey;

        // Create the fungible token with 6 decimals and 0 initial supply
        (int responseCode, address tokenAddress) = HederaTokenService
            .createFungibleToken(token, 0, 6);
        require(responseCode == HederaResponseCodes.SUCCESS);
        return tokenAddress;
    }
}
