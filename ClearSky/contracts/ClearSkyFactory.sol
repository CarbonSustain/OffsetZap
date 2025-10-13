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

    // FCDR1155 contract for FCDR tokens
    address public fcdr1155Contract; // ERC-1155 FCDR contract

    // Mapping from pool address to its CSLP token
    mapping(address => address) public poolCSLPTokens;

    // Factory owner
    address public owner;

    // Events
    event PoolCreated(
        address indexed user,
        address indexed poolAddress,
        address indexed cslpToken,
        uint256 poolIndex
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    // Debug: factory HBAR balance snapshot
    event FactoryBalance(uint256 balanceWei);

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
        fcdr1155Contract = address(0); // Will be set later

        emit OwnershipTransferred(address(0), msg.sender);
    }

    /**
     * @notice Create a new liquidity pool for a user with pre-created CSLP token
     * @param user The user address that will own this pool
     * @param cslpToken The address of the pre-created CSLP token
     * @return poolAddress The address of the newly created pool
     */
    function createUserPool(
        address user,
        address cslpToken
    ) external returns (address) {
        require(user != address(0), "Invalid user address");
        require(userPools[user] == address(0), "Pool already exists for user");
        require(cslpToken != address(0), "CSLP token address required");

        // Deploy new pool contract with pre-created CSLP token
        ClearSkyLiquidityPoolV3 newPool = new ClearSkyLiquidityPoolV3(
            address(this), // factory address
            user, // pool user (for tracking only)
            cslpToken, // pre-created CSLP token address
            fcdr1155Contract, // FCDR1155 contract address
            owner // global owner of pools
        );

        address poolAddress = address(newPool);

        // Store the CSLP token mapping
        poolCSLPTokens[poolAddress] = cslpToken;

        // Register the new pool with FCDR1155 contract
        if (fcdr1155Contract != address(0)) {
            FCDR1155(fcdr1155Contract).registerLP(poolAddress);
        }

        // Note: Token association will be handled by the frontend after pool creation

        // Store the mapping
        userPools[user] = poolAddress;
        allPools.push(poolAddress);
        isPool[poolAddress] = true;

        emit PoolCreated(user, poolAddress, cslpToken, allPools.length - 1);

        return poolAddress;
    }

    /**
     * @notice Create a new pool for maturation (allows multiple pools per user)
     * @param user The user address for the pool
     * @param cslpToken The pre-created CSLP token address
     * @return poolAddress The address of the newly created pool
     */
    function createMaturationPool(
        address user,
        address cslpToken
    ) external returns (address) {
        require(user != address(0), "Invalid user address");
        require(cslpToken != address(0), "CSLP token address required");
        // Note: No check for existing pools - allows multiple pools per user

        // Deploy new pool contract with pre-created CSLP token
        ClearSkyLiquidityPoolV3 newPool = new ClearSkyLiquidityPoolV3(
            address(this), // factory address
            user, // pool user (for tracking only)
            cslpToken, // pre-created CSLP token address
            fcdr1155Contract, // FCDR1155 contract address
            owner // global owner of pools
        );

        address poolAddress = address(newPool);

        // Store the CSLP token mapping
        poolCSLPTokens[poolAddress] = cslpToken;

        // Register the new pool with FCDR1155 contract
        if (fcdr1155Contract != address(0)) {
            FCDR1155(fcdr1155Contract).registerLP(poolAddress);
        }

        // Note: Token association will be handled by the frontend after pool creation

        // Store the mapping (overwrites previous pool for user - this is intentional for maturation)
        userPools[user] = poolAddress;
        allPools.push(poolAddress);
        isPool[poolAddress] = true;

        emit PoolCreated(user, poolAddress, cslpToken, allPools.length - 1);

        return poolAddress;
    }

    /**
     * @notice Create a CSLP token (public function for frontend to call)
     * @param tokenName The name of the CSLP token
     * @param tokenSymbol The symbol of the CSLP token
     * @return tokenAddress The address of the created CSLP token
     */
    function createCSLPToken(
        string memory tokenName,
        string memory tokenSymbol
    ) external returns (address) {
        return _createCSLPToken(tokenName, tokenSymbol);
    }

    /**
     * @notice Get the pool address for a specific user
     * @param user The user address
     * @return poolAddress The pool address for the user, or address(0) if not found
     */
    function getUserPool(address user) external view returns (address) {
        return userPools[user];
    }

    function mintCSLP(
        address poolAddress,
        address user,
        uint256 amount
    ) external onlyOwnerOrPool {
        address cslpToken = poolCSLPTokens[poolAddress];
        require(cslpToken != address(0), "CSLP token not found for pool");

        int64 mintAmount = int64(uint64(amount));

        // ✅ 1. Mint: goes to TREASURY (owner), not factory
        (int responseCode, , ) = HederaTokenService.mintToken(
            cslpToken,
            mintAmount,
            new bytes[](0)
        );
        require(responseCode == HederaResponseCodes.SUCCESS, "Mint failed");

        // ✅ 2. Transfer: from treasury (owner) to user
        if (owner != user) {
            int transferResponseCode = HederaTokenService.transferToken(
                cslpToken,
                owner, // FROM: owner (treasury)
                user, // TO: user
                mintAmount
            );
            require(
                transferResponseCode == HederaResponseCodes.SUCCESS,
                "Transfer failed"
            );
        }
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

    function burnCSLP(
        address poolAddress,
        uint256 amount
    ) external onlyOwnerOrPool {
        address cslpToken = poolCSLPTokens[poolAddress];
        require(cslpToken != address(0), "CSLP token not found for pool");

        int64 burnAmount = int64(uint64(amount));
        int64[] memory serialNumbers = new int64[](0);
        (int responseCode, ) = HederaTokenService.burnToken(
            cslpToken,
            burnAmount,
            serialNumbers
        );
        require(responseCode == HederaResponseCodes.SUCCESS);
    }

    function burnFCDR(
        address from,
        address poolAddress,
        uint256 amount
    ) external onlyOwnerOrPool {
        require(fcdr1155Contract != address(0), "FCDR1155 contract not set");
        FCDR1155(fcdr1155Contract).burnFrom(from, poolAddress, amount);
    }

    function getAllPools() external view returns (address[] memory) {
        return allPools;
    }

    function hasPool(address user) external view returns (bool) {
        return userPools[user] != address(0);
    }

    /**
     * @notice Get CSLP token address for a pool
     * @param poolAddress The pool address
     * @return The CSLP token address for the pool
     */
    function getPoolCSLPToken(
        address poolAddress
    ) external view returns (address) {
        return poolCSLPTokens[poolAddress];
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
     * @notice Create individual CSLP token using Hedera HTS
     * @dev This token will be used for a specific pool
     * @param tokenName The name of the token
     * @param tokenSymbol The symbol of the token
     * @return tokenAddress The address of the created CSLP token
     */
    // Event for debugging HTS creation
    event HTSCreateResult(
        int32 code,
        address token,
        string tokenName,
        string tokenSymbol
    );

    // Event for successful CSLP token creation
    event CSLPTokenCreated(
        address indexed tokenAddress,
        string tokenName,
        string tokenSymbol,
        address indexed creator
    );

    function _createCSLPToken(
        string memory tokenName,
        string memory tokenSymbol
    ) internal returns (address) {
        // Log factory contract balance before HTS create
        emit FactoryBalance(address(this).balance);

        // Create HederaToken struct with all required fields
        IHederaTokenService.HederaToken memory token;
        token.name = tokenName;
        token.symbol = tokenSymbol;
        token.treasury = address(this); // Factory is treasury
        token.tokenKeys = new IHederaTokenService.TokenKey[](1);

        // Create supply key exactly like the working example
        IHederaTokenService.TokenKey memory tokenKey = super.getSingleKey(
            KeyType.SUPPLY,
            KeyValueType.CONTRACT_ID,
            address(this)
        );
        token.tokenKeys[0] = tokenKey;

        // Set expiry and auto-renew (REQUIRED for Hedera tokens)
        token.expiry = IHederaTokenService.Expiry({
            second: 0, // 0 means no expiry
            autoRenewAccount: address(this),
            autoRenewPeriod: 7890000 // ~3 months in seconds
        });

        // Set additional required fields
        token.memo = ""; // Empty memo

        // Create the fungible token with 6 decimals and 0 initial supply
        (int responseCode, address tokenAddress) = HederaTokenService
            .createFungibleToken(token, 0, 6);

        // Emit result for debugging
        emit HTSCreateResult(
            int32(responseCode),
            tokenAddress,
            tokenName,
            tokenSymbol
        );

        // Better error handling with specific error codes
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert(
                string(
                    abi.encodePacked(
                        "HTS create failed code=",
                        _i32(int32(responseCode))
                    )
                )
            );
        }

        // Emit successful token creation event
        emit CSLPTokenCreated(tokenAddress, tokenName, tokenSymbol, msg.sender);

        return tokenAddress;
    }

    // Helper function to convert int32 to string for error messages
    function _i32(int32 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        bool neg = v < 0;
        uint32 n = uint32(neg ? -v : v);
        bytes memory b;
        while (n > 0) {
            b = abi.encodePacked(uint8(48 + (n % 10)), b);
            n /= 10;
        }
        return neg ? string(abi.encodePacked("-", b)) : string(b);
    }
}
