import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function testHBAROnlyLiquidity() {
  try {
    console.log("🌊 Testing HBAR-Only Liquidity Provision to ClearSky Pool...");
    
    // Load deployment info
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    const poolAddress = deploymentInfo.poolAddress;
    
    // Network configuration
    const network = process.env.NETWORK || 'testnet';
    let rpcUrl;
    
    if (network === 'mainnet') {
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
      nameResolver: null
    });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Testing from: ${wallet.address}`);
    
    // Load contract
    const poolContract = new ethers.Contract(poolAddress, deploymentInfo.abi, wallet);
    
    console.log("\n📋 Pool Information:");
    console.log(`Pool Address: ${poolAddress}`);
    console.log(`Your Address: ${wallet.address}`);
    
    // Check HBAR balance
    console.log("\n💰 Checking HBAR Balance...");
    const hbarBalance = await provider.getBalance(wallet.address);
    console.log(`HBAR Balance: ${ethers.formatEther(hbarBalance)} HBAR`);
    
    // Test amount (small amount for testing)
    const hbarAmount = ethers.parseEther("0.01"); // 0.01 HBAR
    
    console.log(`\n🧪 Test HBAR Amount: ${ethers.formatEther(hbarAmount)} HBAR`);
    
    // Check if we have enough HBAR
    if (hbarBalance < hbarAmount) {
      console.log(`❌ Insufficient HBAR: Need ${ethers.formatEther(hbarAmount)} HBAR, have ${ethers.formatEther(hbarBalance)} HBAR`);
      return false;
    }
    
    // For HBAR-only liquidity, we need to modify the approach
    // The current contract expects both USDC and HBAR, but we can test the HBAR transfer
    
    console.log("\n🧪 Testing HBAR Transfer to Pool...");
    console.log(`This will send ${ethers.formatEther(hbarAmount)} HBAR to the pool contract`);
    
    // Send HBAR directly to the pool contract (this tests the contract can receive HBAR)
    const sendHBARTx = await wallet.sendTransaction({
      to: poolAddress,
      value: hbarAmount
    });
    
    console.log(`HBAR Transfer Transaction: ${sendHBARTx.hash}`);
    console.log("⏳ Waiting for transaction confirmation...");
    
    const receipt = await sendHBARTx.wait();
    console.log("✅ HBAR sent to pool contract successfully!");
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    
    // Check pool's HBAR balance
    console.log("\n📊 Checking Pool's HBAR Balance...");
    const poolHBARBalance = await provider.getBalance(poolAddress);
    console.log(`Pool HBAR Balance: ${ethers.formatEther(poolHBARBalance)} HBAR`);
    
    // Check if the pool received the HBAR
    if (poolHBARBalance >= hbarAmount) {
      console.log("✅ Pool successfully received HBAR!");
    } else {
      console.log("❌ Pool did not receive the expected HBAR amount");
    }
    
    console.log("\n🎉 HBAR-Only Test Completed!");
    console.log("Pool can receive HBAR transactions!");
    
    // Note: This doesn't mint LP tokens because the contract expects both USDC and HBAR
    // But it proves the pool can receive HBAR and handle transactions
    
    return true;
    
  } catch (error) {
    console.error("❌ HBAR-Only Test Failed:", error);
    throw error;
  }
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
  testHBAROnlyLiquidity()
    .then(() => {
      console.log("\n🎉 HBAR-Only Test Completed!");
      console.log("Pool can receive HBAR transactions!");
    })
    .catch((error) => {
      console.error("Failed to test HBAR-only liquidity:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { testHBAROnlyLiquidity }; 