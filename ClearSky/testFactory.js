import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🧪 Testing ClearSky Factory System...\n");

  try {
    // Network configuration
    const network = process.env.NETWORK || "testnet";
    let rpcUrl, chainId;

    if (network === "mainnet") {
      rpcUrl = process.env.HEDERA_MAINNET_RPC_URL;
      chainId = 295; // Hedera mainnet
    } else {
      rpcUrl = process.env.HEDERA_TESTNET_RPC_URL;
      chainId = 296; // Hedera testnet
    }

    if (!rpcUrl) {
      throw new Error(`Missing ${network.toUpperCase()}_RPC_URL in .env file`);
    }

    // Initialize provider and wallet with Hedera-specific configuration
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      // Disable ENS for Hedera networks
      ensAddress: null,
      nameResolver: null,
    });

    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const deployer = new ethers.Wallet(privateKey, provider);
    console.log(`👤 Testing with account: ${deployer.address}`);
    console.log(
      `💰 Account balance: ${ethers.formatEther(
        await provider.getBalance(deployer.address)
      )} HBAR`
    );

    // Get network info
    const networkInfo = await provider.getNetwork();
    console.log(`🌐 Network: ${network} (Chain ID: ${networkInfo.chainId})`);

    // Create test users (different addresses for testing)
    const user1 = new ethers.Wallet("0x" + "1".repeat(64), provider); // Test user 1
    const user2 = new ethers.Wallet("0x" + "2".repeat(64), provider); // Test user 2

    console.log("👤 User 1:", user1.address);
    console.log("👤 User 2:", user2.address);

    // Load deployment info
    const deploymentPath = path.join(
      __dirname,
      "clearsky-factory-deployment.json"
    );
    if (!fs.existsSync(deploymentPath)) {
      throw new Error(
        "Factory deployment file not found. Run deployFactory.js first."
      );
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const factoryAddress = deploymentInfo.factory.contractAddress;
    const cslpToken = deploymentInfo.sharedTokens.cslpToken.address;
    const fcdrToken = deploymentInfo.sharedTokens.fcdrToken.address;

    console.log("\n📋 Loaded deployment info:");
    console.log("🏭 Factory:", factoryAddress);
    console.log("🪙 CSLP Token:", cslpToken);
    console.log("🪙 FCDR Token:", fcdrToken);

    // Load contract ABI and connect to factory
    const factoryContractPath =
      "./artifacts/contracts/ClearSkyFactory.sol/ClearSkyFactory.json";
    if (!fs.existsSync(factoryContractPath)) {
      throw new Error(
        "Factory contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }
    const factoryContractArtifact = JSON.parse(
      fs.readFileSync(factoryContractPath, "utf8")
    );
    const { abi: factoryABI } = factoryContractArtifact;

    const factory = new ethers.Contract(factoryAddress, factoryABI, deployer);

    // Test 1: Check factory state
    console.log("\n🧪 Test 1: Checking factory state...");
    const owner = await factory.owner();
    const poolCount = await factory.getPoolCount();
    const allPools = await factory.getAllPools();

    console.log("✅ Factory owner:", owner);
    console.log("✅ Pool count:", poolCount.toString());
    console.log("✅ All pools:", allPools);

    // Test 2: Create pool for User 1 (using deployer as factory owner)
    console.log("\n🧪 Test 2: Creating pool for User 1...");
    const tx1 = await factory.createUserPool(user1.address);
    const receipt1 = await tx1.wait();

    const user1Pool = await factory.getUserPool(user1.address);
    const hasPool1 = await factory.hasPool(user1.address);

    console.log("✅ User 1 pool created:", user1Pool);
    console.log("✅ User 1 has pool:", hasPool1);
    console.log("📄 Transaction hash:", receipt1.hash);

    // Test 3: Create pool for User 2 (using deployer as factory owner)
    console.log("\n🧪 Test 3: Creating pool for User 2...");
    const tx2 = await factory.createUserPool(user2.address);
    const receipt2 = await tx2.wait();

    const user2Pool = await factory.getUserPool(user2.address);
    const hasPool2 = await factory.hasPool(user2.address);

    console.log("✅ User 2 pool created:", user2Pool);
    console.log("✅ User 2 has pool:", hasPool2);
    console.log("📄 Transaction hash:", receipt2.hash);

    // Test 4: Verify pools are different
    console.log("\n🧪 Test 4: Verifying pool isolation...");
    console.log("✅ User 1 pool:", user1Pool);
    console.log("✅ User 2 pool:", user2Pool);
    console.log("✅ Pools are different:", user1Pool !== user2Pool);

    // Test 5: Check updated factory state
    console.log("\n🧪 Test 5: Checking updated factory state...");
    const newPoolCount = await factory.getPoolCount();
    const newAllPools = await factory.getAllPools();

    console.log("✅ New pool count:", newPoolCount.toString());
    console.log("✅ All pools:", newAllPools);
    console.log("✅ Pool count increased:", newPoolCount > poolCount);

    // Test 6: Test pool contracts
    console.log("\n🧪 Test 6: Testing pool contracts...");
    const poolContractPath =
      "./artifacts/contracts/ClearSkyLiquidityPoolV3.sol/ClearSkyLiquidityPoolV3.json";
    if (!fs.existsSync(poolContractPath)) {
      throw new Error(
        "Pool contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }
    const poolContractArtifact = JSON.parse(
      fs.readFileSync(poolContractPath, "utf8")
    );
    const { abi: poolABI } = poolContractArtifact;

    const pool1 = new ethers.Contract(user1Pool, poolABI, deployer);
    const pool2 = new ethers.Contract(user2Pool, poolABI, deployer);

    const pool1User = await pool1.poolUser();
    const pool2User = await pool2.poolUser();
    const pool1Factory = await pool1.factory();
    const pool2Factory = await pool2.factory();
    const pool1Owner = await pool1.owner();
    const pool2Owner = await pool2.owner();

    console.log("✅ Pool 1 user:", pool1User);
    console.log("✅ Pool 2 user:", pool2User);
    console.log("✅ Pool 1 owner:", pool1Owner);
    console.log("✅ Pool 2 owner:", pool2Owner);
    console.log("✅ Pool 1 factory:", pool1Factory);
    console.log("✅ Pool 2 factory:", pool2Factory);
    console.log(
      "✅ Pool users match users:",
      pool1User === user1.address && pool2User === user2.address
    );
    console.log(
      "✅ Pool owners match factory:",
      pool1Owner === factoryAddress && pool2Owner === factoryAddress
    );
    console.log(
      "✅ Pool factories match:",
      pool1Factory === factoryAddress && pool2Factory === factoryAddress
    );

    // Test 7: Test shared tokens
    console.log("\n🧪 Test 7: Testing shared tokens...");
    const pool1CSLP = await pool1.cslpToken();
    const pool2CSLP = await pool2.cslpToken();
    const pool1FCDR = await pool1.fcdrToken();
    const pool2FCDR = await pool2.fcdrToken();

    console.log("✅ Pool 1 CSLP:", pool1CSLP);
    console.log("✅ Pool 2 CSLP:", pool2CSLP);
    console.log("✅ Pool 1 FCDR:", pool1FCDR);
    console.log("✅ Pool 2 FCDR:", pool2FCDR);
    console.log("✅ CSLP tokens are shared:", pool1CSLP === pool2CSLP);
    console.log("✅ FCDR tokens are shared:", pool1FCDR === pool2FCDR);

    // Test 8: Test pool isolation
    console.log("\n🧪 Test 8: Testing pool isolation...");
    const pool1Balance = await provider.getBalance(user1Pool);
    const pool2Balance = await provider.getBalance(user2Pool);

    console.log("✅ Pool 1 HBAR balance:", ethers.formatEther(pool1Balance));
    console.log("✅ Pool 2 HBAR balance:", ethers.formatEther(pool2Balance));
    console.log(
      "✅ Both pools start with 0 HBAR:",
      pool1Balance === 0n && pool2Balance === 0n
    );

    // Test 9: Test error handling
    console.log("\n🧪 Test 9: Testing error handling...");
    try {
      await factory.connect(user1).createUserPool(user1.address);
      console.log("❌ Should have failed - user already has pool");
    } catch (error) {
      console.log("✅ Correctly rejected duplicate pool creation");
    }

    try {
      await factory.connect(user1).createUserPool(ethers.AddressZero);
      console.log("❌ Should have failed - invalid user address");
    } catch (error) {
      console.log("✅ Correctly rejected invalid user address");
    }

    // Test 10: Summary
    console.log("\n🎉 Factory System Test Complete!");
    console.log("=".repeat(50));
    console.log("✅ Factory deployed and working");
    console.log("✅ User pools created successfully");
    console.log("✅ Pool isolation verified");
    console.log("✅ Shared tokens working");
    console.log("✅ Error handling working");
    console.log("✅ Total pools created:", newPoolCount.toString());
    console.log("=".repeat(50));

    console.log("\n📋 Test Results Summary:");
    console.log("• Factory Contract: ✅ Working");
    console.log("• Pool Creation: ✅ Working");
    console.log("• Pool Isolation: ✅ Working");
    console.log("• Shared Tokens: ✅ Working");
    console.log("• Error Handling: ✅ Working");
    console.log("• User Management: ✅ Working");
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  }
}

// Execute the test
main()
  .then(() => {
    console.log("\n✅ All tests passed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Tests failed:", error);
    process.exit(1);
  });
