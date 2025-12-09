import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Debug: Normalize paths for comparison
const normalizePath = (path) => {
  return path
    .replace(/^file:\/\//, "") // Remove file:// protocol
    .replace(/\\/g, "/") // Convert backslashes to forward slashes
    .replace(/^\/+/, "") // Remove leading slashes
    .toLowerCase(); // Make case-insensitive
};

const importPath = normalizePath(import.meta.url);
const scriptPath = normalizePath(process.argv[1]);

async function deployCDR() {
  console.log("🚀 Deploying HbarOffset contract...\n");

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
    console.log(`👤 Deploying with account: ${deployer.address}`);
    const balance = await provider.getBalance(deployer.address);
    console.log(`💰 Account balance: ${ethers.formatEther(balance)} HBAR`);

    // Get network info
    const networkInfo = await provider.getNetwork();
    console.log(`🌐 Network: ${network} (Chain ID: ${networkInfo.chainId})`);

    // Load contract ABI and bytecode
    const hbarOffsetContractPath =
      "./artifacts/contracts/CDR/HbarOffset.sol/HbarOffset.json";

    if (!fs.existsSync(hbarOffsetContractPath)) {
      throw new Error(
        "HbarOffset contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }

    const hbarOffsetContractArtifact = JSON.parse(
      fs.readFileSync(hbarOffsetContractPath, "utf8")
    );
    const { abi: hbarOffsetABI, bytecode: hbarOffsetBytecode } =
      hbarOffsetContractArtifact;

    // Deploy the HbarOffset contract
    console.log("\n📦 Deploying HbarOffset...");
    const hbarOffset = new ethers.ContractFactory(
      hbarOffsetABI,
      hbarOffsetBytecode,
      deployer
    );

    // Transaction memo for Hedera (max 100 bytes)
    const transactionMemo =
      process.env.DEPLOYMENT_MEMO || "HbarOffset contract deployment";
    console.log(`📝 Transaction memo: ${transactionMemo}`);

    // Get the deployment transaction
    const deployTx = await hbarOffset.getDeployTransaction();

    // Send transaction with memo - Hedera RPC supports memo field
    const txResponse = await deployer.sendTransaction({
      ...deployTx,
      // Hedera-specific: memo field for transaction
      memo: transactionMemo,
    });

    console.log(
      `⏳ Waiting for HbarOffset deployment transaction to be mined...`
    );
    const receipt = await txResponse.wait();

    // Get contract address from receipt
    const hbarOffsetAddress = receipt.contractAddress;
    if (!hbarOffsetAddress) {
      throw new Error("Contract address not found in receipt");
    }

    // Create contract instance
    const deployedHbarOffset = new ethers.Contract(
      hbarOffsetAddress,
      hbarOffsetABI,
      deployer
    );

    console.log(`✅ HbarOffset deployed to: ${hbarOffsetAddress}`);
    console.log(`🔗 Transaction Hash: ${txResponse.hash}`);

    // Verify owner is set correctly
    const owner = await deployedHbarOffset.owner();
    console.log(`👤 Owner set to: ${owner}`);

    // Wait a bit for the contract to be fully ready
    console.log(`⏳ Waiting for contract to be ready...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // ---- Persist deployment info ----
    const outPath = path.join(__dirname, "clearsky-cdr-deployment.json");
    let deploymentJson = {};
    if (fs.existsSync(outPath)) {
      deploymentJson = JSON.parse(fs.readFileSync(outPath, "utf8"));
    }

    deploymentJson[network] = {
      timestamp: new Date().toISOString(),
      deployer: deployer.address,
      network: network,
      chainId: networkInfo.chainId.toString(),
      rpcUrl: rpcUrl,
      deploymentBlock: receipt.blockNumber,
      deploymentTxHash: txResponse.hash,
      transactionMemo: transactionMemo,
      hbarOffset: {
        address: hbarOffsetAddress,
        owner: owner,
      },
    };

    fs.writeFileSync(outPath, JSON.stringify(deploymentJson, null, 2));
    console.log(`\n📝 Deployment info saved to ${outPath}`);

    console.log("\n🎉 HbarOffset Deployment Complete!");
    console.log("=".repeat(50));
    console.log("📦 HbarOffset Address:", hbarOffsetAddress);
    console.log("👤 Owner:", owner);
    console.log("=".repeat(50));

    return {
      hbarOffsetAddress,
      owner,
      deploymentJson: deploymentJson[network],
    };
  } catch (error) {
    console.error(`❌ HbarOffset deployment failed:`, error);
    throw error;
  }
}

// Main execution
if (importPath === scriptPath) {
  deployCDR()
    .then((result) => {
      console.log(
        `\n🎉 HbarOffset deployment completed successfully! \n\nAddress:\n`
      );
      console.log(`📦 HbarOffset Address: ${result.hbarOffsetAddress}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("HbarOffset deployment failed:", error);
      process.exit(1);
    });
}

export { deployCDR };
