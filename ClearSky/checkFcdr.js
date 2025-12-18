import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root
const envPath = path.join(__dirname, ".env");
dotenv.config({ path: envPath });

async function checkFcdr() {
  console.log("🔍 Checking FCDR balance for pool...\n");

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

    // Get pool address from command line argument or use default
    const poolAddress = "0x5c383979457d62aF56F4d7623284BFd12eEeFbef";
    console.log(`📦 Pool Address: ${poolAddress}`);

    // Load contract addresses from deployment JSON
    const deploymentPath = path.join(
      __dirname,
      "clearsky-factory-deployment.json"
    );
    if (!fs.existsSync(deploymentPath)) {
      throw new Error(`Deployment file not found: ${deploymentPath}`);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

    if (!deployment.fcdr1155Contract || !deployment.fcdr1155Contract.address) {
      throw new Error(`FCDR1155 contract address not found in deployment file`);
    }

    const fcdr1155Address = deployment.fcdr1155Contract.address;

    // Load FCDR1155 contract ABI
    const fcdrArtifactPath = path.join(
      __dirname,
      "artifacts/contracts/FCDR1155.sol/FCDR1155.json"
    );
    if (!fs.existsSync(fcdrArtifactPath)) {
      throw new Error(
        "FCDR1155 contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }
    const fcdrArtifact = JSON.parse(fs.readFileSync(fcdrArtifactPath, "utf8"));
    const fcdrAbi = fcdrArtifact.abi;

    // Create FCDR1155 contract instance
    const fcdr = new ethers.Contract(fcdr1155Address, fcdrAbi, provider);

    // Get tokenId from lpTokenId mapping for the pool address
    const tokenId = await fcdr.lpTokenId(poolAddress);
    console.log(
      `🆔 LP Token ID for pool ${poolAddress}: ${tokenId.toString()}`
    );

    if (tokenId === 0n) {
      console.log("❌ Pool has no FCDR token ID (tokenId is 0)");
      return;
    }

    // Address to check balance in
    const checkAddress = "0xfd6220b000cae4e538d72a0897c04cbfd2a50dbc";
    console.log(
      `🔍 Checking balance for Token ID ${tokenId.toString()} in address: ${checkAddress}`
    );

    // Check balance for the token ID in the specified address
    const balance = await fcdr.balanceOf(checkAddress, tokenId);
    console.log(`💰 FCDR Balance: ${balance.toString()}`);

    if (balance > 0n) {
      console.log(
        `✅ Address ${checkAddress} has FCDR balance for Token ID ${tokenId.toString()}`
      );
    } else {
      console.log(
        `❌ Address ${checkAddress} has no FCDR balance for Token ID ${tokenId.toString()}`
      );
    }
  } catch (error) {
    console.error(`❌ Check failed:`, error);
    process.exit(1);
  }
}

checkFcdr()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
