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

    // Step 2: Create shared CSLP token
    console.log("\n🪙 Step 2: Creating shared CSLP token...");
    try {
      console.log(`🎯 Simulating createCSLPToken() first...`);

      try {
        const simulateTx = await factory.createCSLPToken.staticCall({
          gasLimit: 10000000,
          value: ethers.parseEther("20"), // Include HBAR fee for HTS token creation
        });
        console.log(`✅ CSLP simulation successful`);
      } catch (staticError) {
        console.error(`❌ CSLP static call failed:`, staticError);
        throw staticError;
      }

      console.log(`🎯 Now calling actual createCSLPToken()...`);
      const createCSLPTx = await factory.createCSLPToken({
        gasLimit: 10000000,
        value: ethers.parseEther("20"), // Send 20 HBAR to cover HTS token creation fee
      });

      console.log(`⏳ Waiting for CSLP token creation transaction...`);
      console.log(`📄 CSLP creation TX hash: ${createCSLPTx.hash}`);

      const createCSLPReceipt = await createCSLPTx.wait();
      console.log(
        `✅ CSLP token creation confirmed in block ${createCSLPReceipt.blockNumber}`
      );
      console.log(
        `⛽ Gas used for CSLP creation: ${createCSLPReceipt.gasUsed.toString()}`
      );
    } catch (cslpError) {
      console.error(`❌ CSLP token creation failed:`, cslpError);
      throw cslpError;
    }

    // Step 3: Create shared FCDR token
    console.log("\n🪙 Step 3: Creating shared FCDR token...");
    try {
      console.log(`🎯 Simulating createFCDRToken() first...`);

      try {
        const simulateFcdrTx = await factory.createFCDRToken.staticCall({
          gasLimit: 10000000,
          value: ethers.parseEther("20"), // Include HBAR fee for HTS token creation
        });
        console.log(`✅ FCDR simulation successful`);
      } catch (staticError) {
        console.error(`❌ FCDR static call failed:`, staticError);
        throw staticError;
      }

      console.log(`🎯 Now calling actual createFCDRToken()...`);
      const createFcdrTx = await factory.createFCDRToken({
        gasLimit: 10000000,
        value: ethers.parseEther("20"), // Send 20 HBAR to cover HTS token creation fee
      });

      console.log(`⏳ Waiting for FCDR token creation transaction...`);
      console.log(`📄 FCDR creation TX hash: ${createFcdrTx.hash}`);

      const createFcdrReceipt = await createFcdrTx.wait();
      console.log(
        `✅ FCDR token creation confirmed in block ${createFcdrReceipt.blockNumber}`
      );
      console.log(
        `⛽ Gas used for FCDR creation: ${createFcdrReceipt.gasUsed.toString()}`
      );
    } catch (fcdrError) {
      console.error(`❌ FCDR token creation failed:`, fcdrError);
      throw fcdrError;
    }

    // Step 4: Get the shared token addresses from the factory
    console.log("\n🪙 Step 4: Getting shared token addresses...");
    const cslpToken = await factory.cslpToken();
    const fcdrToken = await factory.fcdrToken();

    console.log("✅ CSLP Token:", cslpToken);
    console.log("✅ FCDR Token:", fcdrToken);

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
      sharedTokens: {
        cslpToken: {
          address: cslpToken,
          name: "ClearSky LP Token",
          symbol: "CSLP",
          decimals: 6,
          description: "Shared CSLP token used across all pools",
          createdBy: "Factory (HIP-1028)",
        },
        fcdrToken: {
          address: fcdrToken,
          name: "Future CDR",
          symbol: "FCDR",
          decimals: 0,
          description: "Shared FCDR token for emergency withdrawals",
          createdBy: "Factory (HIP-1028)",
        },
      },
      features: [
        "User-specific pools",
        "Shared CSLP/FCDR tokens",
        "Factory-based deployment",
        "Pool isolation",
        "Independent withdrawals",
        "HIP-1028 Token Creation",
        "Unified Token Economy",
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

    // Step 6: Display summary
    console.log("\n🎯 Factory Deployment Success!");
    console.log(`   ✅ Step 1: Factory contract deployed successfully`);
    console.log(`   ✅ Step 2: Shared CSLP token created successfully`);
    console.log(`   ✅ Step 3: Shared FCDR token created successfully`);
    console.log(`   ✅ Factory manages all token creation`);
    console.log(`   ✅ All pools use shared tokens`);
    console.log(`   ✅ User-specific pool isolation ready`);
    console.log(`   ✅ Auto-initialization enabled for new pools`);

    console.log("\n🎉 Factory Deployment Complete!");
    console.log("=".repeat(50));
    console.log("🏭 Factory Address:", factoryAddress);
    console.log("🪙 CSLP Token:", cslpToken);
    console.log("🪙 FCDR Token:", fcdrToken);
    console.log("=".repeat(50));

    console.log("\n📋 Next Steps:");
    console.log("1. Test factory system: node testFactory.js");
    console.log("2. Update frontend to use factory address");
    console.log("3. Test pool creation from frontend (buy credits)");
    console.log("4. Test auto-initialization on first liquidity");
    console.log("5. Test emergency withdrawals from user pools");

    return {
      factoryAddress,
      cslpToken,
      fcdrToken,
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
      console.log(`🪙 CSLP Token: ${result.cslpToken}`);
      console.log(`🪙 FCDR Token: ${result.fcdrToken}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Factory deployment failed:", error);
      process.exit(1);
    });
}

export { deployFactory };
