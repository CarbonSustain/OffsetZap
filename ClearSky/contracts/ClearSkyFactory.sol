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

    // Orderbook contract address (for updating pool users on order fill)
    address public orderbookAddress;

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

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "OWN");
        _;
    }

    // Allow calls from factory owner OR a pool created by this factory
    modifier onlyOwnerOrPool() {
        require(msg.sender == owner || isPool[msg.sender], "AUTH");
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

    // No association helper needed (vault has auto-associations)

    // Series token creation removed; handled externally post-deploy

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
        require(user != address(0), "BAD_USER");
        require(userPools[user] == address(0), "POOL_EXISTS");
        require(cslpToken != address(0), "NO_CSLP");

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
        require(user != address(0), "BAD_USER");
        require(cslpToken != address(0), "NO_CSLP");

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

        // Store the mapping (overwrites previous pool for user - this is intentional for maturation)
        userPools[user] = poolAddress;
        allPools.push(poolAddress);
        isPool[poolAddress] = true;

        emit PoolCreated(user, poolAddress, cslpToken, allPools.length - 1);

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

    function mintCSLP(
        address poolAddress,
        address user,
        uint256 amount
    ) external onlyOwnerOrPool {
        address cslpToken = poolCSLPTokens[poolAddress];
        require(cslpToken != address(0), "NO_CSLP");

        int64 mintAmount = int64(uint64(amount));

        // ✅ 1. Mint: goes to TREASURY (owner), not factory
        (int responseCode, , ) = HederaTokenService.mintToken(
            cslpToken,
            mintAmount,
            new bytes[](0)
        );
        require(responseCode == HederaResponseCodes.SUCCESS, "MINT_FAIL");

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

    /**
     * @notice Complete maturation deposit process
     * 1. Mint CSLP tokens to treasury (owner account)
     * 2. Transfer CSLP tokens from treasury to pool
     * 3. Update pool's HBAR balance and total value
     */
    function completeMaturationDeposit(
        address newPoolAddress,
        address prevPoolAddress,
        uint256 hbarAmount
    ) external onlyOwner {
        require(newPoolAddress != address(0), "BAD_NEW");
        require(prevPoolAddress != address(0), "BAD_PREV");
        require(hbarAmount > 0, "HBAR_ZERO");

        address cslpToken = poolCSLPTokens[newPoolAddress];
        require(cslpToken != address(0), "NO_CSLP");

        // Step 1: Mint 1 CSLP token to treasury (owner account) and transfer to pool
        uint256 mintAmount = 1_000_000; // 1 CSLP with 6 decimals
        int64 mintAmountInt64 = int64(uint64(mintAmount));

        // Mint to treasury (owner)
        (int responseCode, , ) = HederaTokenService.mintToken(
            cslpToken,
            mintAmountInt64,
            new bytes[](0)
        );
        require(responseCode == HederaResponseCodes.SUCCESS, "MINT_FAIL");

        // Transfer from treasury to pool
        int transferResponseCode = HederaTokenService.transferToken(
            cslpToken,
            owner, // FROM: owner (treasury)
            newPoolAddress, // TO: new pool
            mintAmountInt64
        );
        require(
            transferResponseCode == HederaResponseCodes.SUCCESS,
            "Transfer failed"
        );

        // Step 2: Update pool's HBAR balance and total value
        ClearSkyLiquidityPoolV3(payable(newPoolAddress)).updateMaturationHBAR(
            hbarAmount
        );
        // Update 2-decimal maturation percentage to (x/110) * 100
        // Stored as scaled by 100: valueScaled = (x * 10000) / 110 using integer math
        // Keep 'x' as a variable so it can be changed later by caller requirements
        uint256 maturationNumerator = 1; // default x = 1 (produces ~0.90%)
        uint256 maturationPctScaled = (maturationNumerator * uint256(10000)) /
            uint256(110);
        ClearSkyLiquidityPoolV3(payable(newPoolAddress)).setMaturationPct2dp(
            maturationPctScaled
        );
        // Update totalLPTokens in the new pool to the mint amount
        ClearSkyLiquidityPoolV3(payable(newPoolAddress)).updateTotalLPTokens(
            mintAmount
        );
        // Mark the PREVIOUS pool as matured (the one with CSLP1)
        ClearSkyLiquidityPoolV3(payable(prevPoolAddress)).setMatured(true);
        // Set FCDR status to 2 (burned) for the previous pool
        ClearSkyLiquidityPoolV3(payable(prevPoolAddress)).setFCDRStatus(
            prevPoolAddress,
            2
        );

        emit MaturationDepositCompleted(
            newPoolAddress,
            cslpToken,
            hbarAmount,
            mintAmount
        );
    }

    function mintFCDR(
        address poolAddress,
        address fcdrOwner,
        uint256 hbarAmount
    ) external onlyOwnerOrPool {
        require(fcdr1155Contract != address(0), "NO_FCDR");
        FCDR1155(fcdr1155Contract).mintFCDRWithMetadata(
            fcdrOwner,
            poolAddress,
            hbarAmount,
            ""
        );
        // Set FCDR status to 1 (minted) for the pool
        ClearSkyLiquidityPoolV3(payable(poolAddress)).setFCDRStatus(
            poolAddress,
            1
        );
    }

    function burnCSLP(
        address poolAddress,
        uint256 amount
    ) external onlyOwnerOrPool {
        address cslpToken = poolCSLPTokens[poolAddress];
        require(cslpToken != address(0), "NO_CSLP");

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
        require(fcdr1155Contract != address(0), "NO_FCDR");
        FCDR1155(fcdr1155Contract).burnFrom(from, poolAddress, amount);
        // Set FCDR status to 2 (burned) for the pool
        ClearSkyLiquidityPoolV3(payable(poolAddress)).setFCDRStatus(
            poolAddress,
            2
        );
    }

    function getAllPools() external view returns (address[] memory) {
        return allPools;
    }

    function hasPool(address user) external view returns (bool) {
        return userPools[user] != address(0);
    }

    /**
     * @notice Get FCDR status for a pool
     * @param poolAddress The pool address to check
     * @return status 0=no FCDR, 1=FCDR minted, 2=FCDR burned
     */
    function getPoolFCDRStatus(
        address poolAddress
    ) external view returns (uint256) {
        return
            ClearSkyLiquidityPoolV3(payable(poolAddress)).getFCDRStatus(
                poolAddress
            );
    }

    /**
     * @notice Transfer CSLP tokens from pool to user
     * @param poolAddress The pool address
     * @param user The user address to transfer tokens to
     * @param amount The amount of CSLP tokens to transfer
     */
    function transferCSLPToUser(
        address poolAddress,
        address user,
        uint256 amount
    ) external {
        require(poolAddress != address(0), "BAD_POOL");
        require(user != address(0), "BAD_USER");
        require(amount > 0, "AMT_ZERO");

        ClearSkyLiquidityPoolV3(payable(poolAddress)).transferCSLPToUser(
            user,
            amount
        );
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
     * @notice Set Orderbook contract address (Owner only)
     * @dev This allows Orderbook to update pool users when orders are filled
     */
    function setOrderbookAddress(address _orderbookAddress) external onlyOwner {
        require(
            _orderbookAddress != address(0),
            "Invalid Orderbook contract address"
        );
        orderbookAddress = _orderbookAddress;
    }

    /**
     * @notice Update pool user for a pool (called by Orderbook)
     * @param poolAddress The pool address to update
     * @param newUser The new pool user address
     */
    function updatePoolUser(address poolAddress, address newUser) external {
        require(msg.sender == orderbookAddress, "ONLY_ORDERBOOK");
        require(isPool[poolAddress], "NOT_POOL");
        require(newUser != address(0), "BAD_USER");
        ClearSkyLiquidityPoolV3(payable(poolAddress)).updatePoolUser(newUser);
    }

    /**
     * @notice Set retirement URL for a pool (Owner only)
     * @param poolAddress The pool address to update
     * @param newUrl The new retirement URL
     */
    function setPoolRetirementUrl(
        address poolAddress,
        string calldata newUrl
    ) external onlyOwner {
        require(isPool[poolAddress], "NOT_POOL");
        ClearSkyLiquidityPoolV3(payable(poolAddress)).setRetirementUrl(newUrl);
    }

    event MaturationDepositCompleted(
        address indexed poolAddress,
        address indexed cslpToken,
        uint256 hbarAmount,
        uint256 cslpTokensMinted
    );

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
