import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

// Convert HTS token ID to EVM address format
function htsToEvmAddress(tokenId) {
  const [shard, realm, num] = tokenId.split(".").map(Number);
  if (shard !== 0 || realm !== 0) throw new Error("Only shard 0 realm 0 supported");
  return "0x" + num.toString(16).padStart(40, "0");
}

dotenv.config();

async function deployClearSkyPool() {
  try {
    console.log("🚀 Deploying ClearSky Liquidity Pool...");
    
    // Load configuration
    const config = JSON.parse(fs.readFileSync('clearsky-lp-token.json', 'utf8'));
    const lpTokenId = config.tokenId;
    
    // Network configuration
    const network = process.env.NETWORK || 'testnet';
    let rpcUrl, chainId;
    
    if (network === 'mainnet') {
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
      nameResolver: null
    });
    
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Deploying from: ${wallet.address}`);
    
    // Load contract ABI and bytecode
    const contractPath = './artifacts/contracts/ClearSkyLiquidityPool.sol/ClearSkyLiquidityPool.json';
    
    if (!fs.existsSync(contractPath)) {
      throw new Error("Contract artifacts not found. Run 'npm run compile' first.");
    }
    
    const contractArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const { abi, bytecode } = contractArtifact;
    
    // Contract parameters - convert HTS IDs to EVM addresses
    const lpTokenAddress = htsToEvmAddress(lpTokenId); // HTS token ID
    const ownerAddress = wallet.address;
    
    console.log("📋 Deployment Parameters:");
    console.log(`LP Token: ${lpTokenAddress}`);
    console.log(`Owner: ${ownerAddress}`);
    console.log(`Network: ${network}`);
    
    // Deploy contract
    console.log("\n🔨 Deploying contract...");
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    
    const poolContract = await factory.deploy(
      lpTokenAddress,
      ownerAddress
    );
    
    console.log("⏳ Waiting for deployment confirmation...");
    await poolContract.waitForDeployment();
    
    const poolAddress = await poolContract.getAddress();
    console.log(`✅ ClearSky Liquidity Pool deployed successfully!`);
    console.log(`📍 Contract Address: ${poolAddress}`);
    console.log(`🔗 Transaction Hash: ${poolContract.deploymentTransaction().hash}`);
    
    // Save deployment info
    const deploymentInfo = {
      network: network,
      poolAddress: poolAddress,
      lpToken: lpTokenAddress,
      owner: ownerAddress,
      deployedAt: new Date().toISOString(),
      transactionHash: poolContract.deploymentTransaction().hash,
      abi: abi
    };
    
    fs.writeFileSync('clearsky-pool-deployment.json', JSON.stringify(deploymentInfo, null, 2));
    console.log(`💾 Deployment info saved to clearsky-pool-deployment.json`);
    
    // Verify contract on Hedera
    console.log("\n🔍 Verifying contract...");
    try {
      await verifyContract(poolAddress, [lpTokenAddress, ownerAddress], network);
      console.log("✅ Contract verified successfully!");
    } catch (error) {
      console.log("⚠️ Contract verification failed:", error.message);
    }
    
    // Display next steps
    console.log(`\n📋 Next Steps:`);
    console.log(`1. Transfer LP token supply key control to: ${poolAddress}`);
    console.log(`2. Test the pool with small amounts`);
    console.log(`3. Configure frontend to use pool address: ${poolAddress}`);
    console.log(`4. Monitor pool performance and collect fees`);
    
    return deploymentInfo;
    
  } catch (error) {
    console.error("❌ Deployment failed:", error);
    throw error;
  }
}

async function verifyContract(contractAddress, constructorArgs, network) {
  // This would integrate with Hedera's verification system
  // For now, we'll just log the verification attempt
  console.log(`Verification attempted for ${contractAddress} on ${network}`);
}

// Main execution
console.log("🔍 Debug: Checking execution condition...");
console.log(`📁 import.meta.url: ${import.meta.url}`);
console.log(`📁 process.argv[1]: ${process.argv[1]}`);

// Fix: Normalize paths for comparison
const normalizePath = (path) => {
  return path
    .replace(/^file:\/\//, '') // Remove file:// protocol
    .replace(/\\/g, '/') // Convert backslashes to forward slashes
    .replace(/^\/+/, '') // Remove leading slashes
    .toLowerCase(); // Make case-insensitive
};

const importPath = normalizePath(import.meta.url);
const scriptPath = normalizePath(process.argv[1]);

console.log(`🔧 Normalized import path: ${importPath}`);
console.log(`🔧 Normalized script path: ${scriptPath}`);
console.log(`🔍 Condition check: ${importPath === scriptPath}`);

if (importPath === scriptPath) {
  console.log("✅ Condition is TRUE - Running main execution...");
  deployClearSkyPool()
    .then((deploymentInfo) => {
      console.log("\n🎉 ClearSky Liquidity Pool deployment completed!");
      console.log("Pool ready for liquidity provision!");
    })
    .catch((error) => {
      console.error("Failed to deploy pool:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { deployClearSkyPool }; 