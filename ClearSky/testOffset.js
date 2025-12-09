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

async function testOffset() {
  console.log("🧪 Testing HbarOffset contract...\n");

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

    // Initialize provider and wallet
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null,
    });

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`👤 Using account: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Account balance: ${ethers.formatEther(balance)} HBAR\n`);

    // Load contract address from deployment JSON
    const deploymentPath = path.join(__dirname, "clearsky-cdr-deployment.json");
    if (!fs.existsSync(deploymentPath)) {
      throw new Error(`Deployment file not found: ${deploymentPath}`);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const networkData = deployment[network];

    if (
      !networkData ||
      !networkData.hbarOffset ||
      !networkData.hbarOffset.address
    ) {
      throw new Error(`Contract address not found for network: ${network}`);
    }

    const contractAddress = networkData.hbarOffset.address;
    console.log(`📦 Contract Address: ${contractAddress}`);

    // Load contract ABI
    const contractArtifactPath = path.join(
      __dirname,
      "artifacts/contracts/CDR/HbarOffset.sol/HbarOffset.json"
    );
    if (!fs.existsSync(contractArtifactPath)) {
      throw new Error(
        "Contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }
    const contractArtifact = JSON.parse(
      fs.readFileSync(contractArtifactPath, "utf8")
    );
    const { abi } = contractArtifact;

    // Create contract instance
    const contract = new ethers.Contract(contractAddress, abi, wallet);

    // Prepare test data
    const metadata = JSON.stringify({
      projectId: "VCS-191",
      beneficiary_name: "Rahul",
      beneficiary_address: "0x8f3A8f7A3B1c4dE7a1F3B29A2A0C88Ff7b47D912",
    });

    const hbarAmount = 10; 
    const valueInTinybars = ethers.parseUnits(hbarAmount.toString(), 8); // Converts to tinybars (1e8 per HBAR)

    console.log(`📝 Metadata: ${metadata}`);
    console.log(
      `💵 Sending: ${hbarAmount} HBAR (${valueInTinybars.toString()} tinybars)\n`
    );

    // Simple contract call with parameters and value
    console.log(`📝 Calling requestOffset with ${hbarAmount} HBAR...`);

    // Call contract method with amount parameter
    // Note: We're not sending value since we removed the msg.value check
    // The amount parameter is what matters for the event
    const tx = await contract.requestOffset(metadata, valueInTinybars, {
      gasLimit: 1000000, // Set max gas
    });

    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
    console.log(`🔗 Transaction Hash: ${tx.hash}`);

    // Check if event was emitted
    const eventFilter = contract.filters.OffsetRequested();
    const events = await contract.queryFilter(
      eventFilter,
      receipt.blockNumber,
      receipt.blockNumber
    );

    if (events.length > 0) {
      const event = events[0];
      console.log(`\n🎉 OffsetRequested event emitted!`);
      console.log(`   User: ${event.args.user}`);
      console.log(
        `   HBAR Amount: ${event.args.hbarAmount.toString()} tinybars`
      );
      console.log(`   Request ID: ${event.args.requestId.toString()}`);
      console.log(`   Metadata: ${event.args.metadata}`);
    }

    console.log(`\n✅ Test completed successfully!`);
  } catch (error) {
    console.error(`❌ Test failed:`, error);
    process.exit(1);
  }
}

testOffset()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
