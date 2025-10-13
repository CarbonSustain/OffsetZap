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

async function deployFactory() {
  console.log("🏭 Deploying ClearSky Factory System...\n");

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
    console.log(
      `💰 Account balance: ${ethers.formatEther(
        await provider.getBalance(deployer.address)
      )} HBAR`
    );

    // Get network info
    const networkInfo = await provider.getNetwork();
    console.log(`🌐 Network: ${network} (Chain ID: ${networkInfo.chainId})`);

    // Load contract ABI and bytecode
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
    const { abi: factoryABI, bytecode: factoryBytecode } =
      factoryContractArtifact;

    // Deploy the Factory contract
    console.log("\n🏭 Step 1: Deploying ClearSkyFactory...");
    const factoryContractFactory = new ethers.ContractFactory(
      factoryABI,
      factoryBytecode,
      deployer
    );

    const factory = await factoryContractFactory.deploy();
    console.log(`⏳ Waiting for factory deployment transaction to be mined...`);
    await factory.waitForDeployment();

    const factoryAddress = await factory.getAddress();
    console.log(`✅ Factory deployed to: ${factoryAddress}`);
    console.log(`🔗 Transaction Hash: ${factory.deploymentTransaction().hash}`);

    // Wait a bit for the factory to be fully ready
    console.log(`⏳ Waiting for factory to be ready...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 2: Deploy FCDR1155 contract
    console.log("\n🪙 Step 2: Deploying FCDR1155 contract...");
    let fcdr1155Address = null;

    try {
      // Load FCDR1155 contract ABI and bytecode
      const fcdr1155ContractPath =
        "./artifacts/contracts/FCDR1155.sol/FCDR1155.json";

      if (!fs.existsSync(fcdr1155ContractPath)) {
        throw new Error(
          "FCDR1155 contract artifacts not found. Run 'npx hardhat compile' first."
        );
      }

      const fcdr1155ContractArtifact = JSON.parse(
        fs.readFileSync(fcdr1155ContractPath, "utf8")
      );
      const { abi: fcdr1155ABI, bytecode: fcdr1155Bytecode } =
        fcdr1155ContractArtifact;

      // Deploy FCDR1155 contract
      const fcdr1155ContractFactory = new ethers.ContractFactory(
        fcdr1155ABI,
        fcdr1155Bytecode,
        deployer
      );

      const fcdr1155 = await fcdr1155ContractFactory.deploy(
        "https://api.clearsky.com/metadata/{id}.json"
      );
      console.log(
        `⏳ Waiting for FCDR1155 deployment transaction to be mined...`
      );
      await fcdr1155.waitForDeployment();

      fcdr1155Address = await fcdr1155.getAddress();
      console.log(`✅ FCDR1155 deployed to: ${fcdr1155Address}`);
      console.log(
        `🔗 Transaction Hash: ${fcdr1155.deploymentTransaction().hash}`
      );

      // Wait a bit for the contract to be fully ready
      console.log(`⏳ Waiting for FCDR1155 to be ready...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Transfer ownership of FCDR1155 to the factory
      console.log(`🔄 Transferring FCDR1155 ownership to factory...`);
      const transferOwnershipTx = await fcdr1155.transferOwnership(
        factoryAddress
      );
      console.log(`⏳ Waiting for ownership transfer transaction...`);
      console.log(`📄 Transfer ownership TX hash: ${transferOwnershipTx.hash}`);

      const transferReceipt = await transferOwnershipTx.wait();
      console.log(
        `✅ FCDR1155 ownership transferred to factory in block ${transferReceipt.blockNumber}`
      );
    } catch (fcdr1155Error) {
      console.error(`❌ FCDR1155 deployment failed:`, fcdr1155Error);
      throw fcdr1155Error;
    }

    // Step 3: Set FCDR1155 contract address in factory
    console.log("\n🔗 Step 3: Setting FCDR1155 contract address in factory...");
    try {
      const setFcdr1155Tx = await factory.setFCDR1155Contract(fcdr1155Address);
      console.log(`⏳ Waiting for setFCDR1155Contract transaction...`);
      console.log(`📄 Set FCDR1155 TX hash: ${setFcdr1155Tx.hash}`);

      const setFcdr1155Receipt = await setFcdr1155Tx.wait();
      console.log(
        `✅ FCDR1155 contract address set in block ${setFcdr1155Receipt.blockNumber}`
      );
    } catch (setError) {
      console.error(`❌ Setting FCDR1155 contract address failed:`, setError);
      throw setError;
    }

    // Step 4: Get the FCDR1155 contract address from the factory
    console.log("\n🪙 Step 4: Getting FCDR1155 contract address...");
    const fcdr1155Contract = await factory.fcdr1155Contract();

    console.log("✅ FCDR1155 Contract:", fcdr1155Contract);

    // Step 5: Save deployment info
    console.log("\n💾 Step 5: Saving deployment info...");
    const deploymentInfo = {
      // Factory Information
      factory: {
        contractName: "ClearSkyFactory",
        contractAddress: factoryAddress,
        deployerAddress: deployer.address,
        contractOwner: deployer.address,

        // Network Information
        network: network,
        chainId: networkInfo.chainId.toString(),
        rpcUrl: rpcUrl,

        // Deployment Metadata
        deployedAt: new Date().toISOString(),
        deploymentBlock: await provider.getBlockNumber(),
        deploymentTxHash: factory.deploymentTransaction().hash,
        gasUsedDeployment: "See deployment transaction",
        version: "1.0.0",
      },
      // Note: No shared tokens - individual CSLP tokens created per pool
      fcdr1155Contract: {
        address: fcdr1155Address,
        name: "FCDR1155",
        description: "ERC-1155 contract for FCDR tokens",
        status: "Deployed",
        metadataUri: "https://api.clearsky.com/metadata/{id}.json",
      },
      features: [
        "User-specific pools",
        "Individual CSLP tokens per pool",
        "ERC-1155 FCDR tokens",
        "Factory-based deployment",
        "Pool isolation",
        "Independent withdrawals",
        "HIP-1028 Token Creation",
        "Certificate-based token naming",
        "Scalable Architecture",
      ],
    };

    const outputPath = path.join(
      process.cwd(),
      "clearsky-factory-deployment.json"
    );
    fs.writeFileSync(
      outputPath,
      JSON.stringify(
        deploymentInfo,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      )
    );
    console.log(`💾 Deployment info saved to: ${outputPath}`);

    // Step 7: Display summary
    console.log("\n🎯 Factory Deployment Success!");
    console.log(`   ✅ Step 1: Factory contract deployed successfully`);
    console.log(`   ✅ Step 2: FCDR1155 contract deployed successfully`);
    console.log(`   ✅ Step 3: FCDR1155 contract address set in factory`);
    console.log(`   ✅ Factory manages individual token creation`);
    console.log(`   ✅ Individual CSLP tokens created per pool`);
    console.log(`   ✅ All pools use FCDR1155 for FCDR tokens`);
    console.log(`   ✅ User-specific pool isolation ready`);
    console.log(`   ✅ Certificate-based token naming ready`);

    console.log("\n🎉 Factory Deployment Complete!");
    console.log("=".repeat(50));
    console.log("🏭 Factory Address:", factoryAddress);
    console.log("🪙 FCDR1155 Contract:", fcdr1155Address);
    console.log("=".repeat(50));

    console.log("\n📋 Next Steps:");
    console.log("1. Test factory system: node testFactory.js");
    console.log("2. Update frontend to use factory address");
    console.log("3. Test pool creation from frontend (buy credits)");
    console.log("4. Test auto-initialization on first liquidity");
    console.log("5. Test emergency withdrawals from user pools");

    return {
      factoryAddress,
      fcdr1155Address,
      deploymentInfo,
    };
  } catch (error) {
    console.error(`❌ Factory deployment failed:`, error);
    throw error;
  }
}

// Main execution
if (importPath === scriptPath) {
  deployFactory()
    .then((result) => {
      console.log(`\n🎉 ClearSky Factory deployment completed successfully!`);
      console.log(`🏭 Factory Address: ${result.factoryAddress}`);
      console.log(`🪙 FCDR1155 Contract: ${result.fcdr1155Address}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Factory deployment failed:", error);
      process.exit(1);
    });
}

export { deployFactory };
