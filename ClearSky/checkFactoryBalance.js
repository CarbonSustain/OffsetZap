import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkFactoryBalance() {
  console.log("💰 Checking Factory Contract Balance...\n");

  try {
    // Network configuration
    const network = process.env.NETWORK || "testnet";
    let rpcUrl;

    if (network === "mainnet") {
      rpcUrl = process.env.HEDERA_MAINNET_RPC_URL;
    } else {
      rpcUrl = process.env.HEDERA_TESTNET_RPC_URL;
    }

    if (!rpcUrl) {
      throw new Error(`Missing ${network.toUpperCase()}_RPC_URL in .env file`);
    }

    // Initialize provider
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null,
    });

    // Load factory deployment info
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

    console.log("📋 Deployment Info:");
    console.log(`   Factory: ${factoryAddress}`);
    console.log(
      `   FCDR1155 Contract: ${
        deploymentInfo.fcdr1155Contract?.address || "Not deployed"
      }`
    );

    console.log(`🏭 Factory Address: ${factoryAddress}`);
    console.log(`🌐 Network: ${network}`);

    // Check factory balance
    const balance = await provider.getBalance(factoryAddress);
    const balanceInHbar = ethers.formatEther(balance);

    console.log(`💰 Factory Balance: ${balanceInHbar} HBAR`);

    // Check if balance is sufficient for pool creation
    const minBalance = 1.0; // Minimum HBAR needed for pool creation
    if (parseFloat(balanceInHbar) < minBalance) {
      console.log(
        `⚠️  WARNING: Factory balance (${balanceInHbar} HBAR) is below minimum (${minBalance} HBAR)`
      );
      console.log(
        `💡 You may need to send HBAR to the factory contract to create pools.`
      );
    } else {
      console.log(`✅ Factory has sufficient balance for pool creation.`);
    }

    // Also check deployer balance for reference
    const deployerAddress = deploymentInfo.factory.deployerAddress;
    const deployerBalance = await provider.getBalance(deployerAddress);
    const deployerBalanceInHbar = ethers.formatEther(deployerBalance);

    console.log(`\n👤 Deployer Address: ${deployerAddress}`);
    console.log(`💰 Deployer Balance: ${deployerBalanceInHbar} HBAR`);

    return {
      factoryAddress,
      factoryBalance: balanceInHbar,
      deployerAddress,
      deployerBalance: deployerBalanceInHbar,
    };
  } catch (error) {
    console.error("❌ Error checking factory balance:", error);
    throw error;
  }
}

// Execute the check
checkFactoryBalance()
  .then((result) => {
    console.log("\n✅ Balance check completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Balance check failed:", error);
    process.exit(1);
  });
