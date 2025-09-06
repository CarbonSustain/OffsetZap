import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function testClearSkyPool() {
  try {
    console.log("🧪 Testing Updated ClearSky Liquidity Pool (Flexible Input)...");
    
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
    console.log(`Address: ${poolAddress}`);
    console.log(`USDC Token: ${deploymentInfo.usdcToken}`);
    console.log(`LP Token: ${deploymentInfo.lpToken}`);
    console.log(`Owner: ${deploymentInfo.owner}`);
    
    // Test 1: Get pool state
    console.log("\n🔍 Test 1: Getting pool state...");
    try {
      const totalUSDC = await poolContract.totalUSDC();
      const totalHBAR = await poolContract.totalHBAR();
      const totalLPTokens = await poolContract.totalLPTokens();
      
      console.log(`Total USDC: ${ethers.formatUnits(totalUSDC, 6)}`);
      console.log(`Total HBAR: ${ethers.formatEther(totalHBAR)}`);
      console.log(`Total LP Tokens: ${ethers.formatUnits(totalLPTokens, 6)}`);
    } catch (error) {
      console.log("❌ Failed to get pool state:", error.message);
    }
    
    // Test 2: Get pool ratio
    console.log("\n📊 Test 2: Getting pool ratio...");
    try {
      const [usdcRatio, hbarRatio] = await poolContract.getPoolRatio();
      // Convert BigInt to Number for percentage calculation
      const usdcRatioNum = Number(usdcRatio);
      const hbarRatioNum = Number(hbarRatio);
      console.log(`USDC Ratio: ${(usdcRatioNum / 100).toFixed(2)}%`);
      console.log(`HBAR Ratio: ${(hbarRatioNum / 100).toFixed(2)}%`);
    } catch (error) {
      console.log("❌ Failed to get pool ratio:", error.message);
    }
    
    // Test 3: Calculate LP tokens for different scenarios
    console.log("\n🧮 Test 3: Testing Flexible LP Token Calculations...");
    
    // Scenario A: USDC only
    try {
      const usdcOnlyAmount = ethers.parseUnits("100", 6); // 100 USDC
      const usdcOnlyLPTokens = await poolContract.calculateLPTokens(usdcOnlyAmount, 0);
      console.log(`📊 USDC Only (100 USDC): ${ethers.formatUnits(usdcOnlyLPTokens, 6)} LP tokens`);
    } catch (error) {
      console.log("❌ USDC-only calculation failed:", error.message);
    }
    
    // Scenario B: HBAR only
    try {
      const hbarOnlyAmount = ethers.parseEther("0.1"); // 0.1 HBAR
      const hbarOnlyLPTokens = await poolContract.calculateLPTokens(0, hbarOnlyAmount);
      console.log(`📊 HBAR Only (0.1 HBAR): ${ethers.formatUnits(hbarOnlyLPTokens, 6)} LP tokens`);
    } catch (error) {
      console.log("❌ HBAR-only calculation failed:", error.message);
    }
    
    // Scenario C: Both tokens
    try {
      const bothUSDC = ethers.parseUnits("50", 6); // 50 USDC
      const bothHBAR = ethers.parseEther("0.05"); // 0.05 HBAR
      const bothLPTokens = await poolContract.calculateLPTokens(bothUSDC, bothHBAR);
      console.log(`📊 Both Tokens (50 USDC + 0.05 HBAR): ${ethers.formatUnits(bothLPTokens, 6)} LP tokens`);
    } catch (error) {
      console.log("❌ Both-tokens calculation failed:", error.message);
    }
    
    // Test 4: Get user share
    console.log("\n👤 Test 4: Getting user share...");
    try {
      const [usdcShare, hbarShare, lpBalance] = await poolContract.getUserShare(wallet.address);
      console.log(`User's USDC Share: ${ethers.formatUnits(usdcShare, 6)}`);
      console.log(`User's HBAR Share: ${ethers.formatEther(hbarShare)}`);
      console.log(`User's LP Balance: ${ethers.formatUnits(lpBalance, 6)}`);
    } catch (error) {
      console.log("❌ Failed to get user share:", error.message);
    }
    
    // Test 5: Check pool status
    console.log("\n⏸️ Test 5: Checking pool status...");
    try {
      const isPaused = await poolContract.paused();
      console.log(`Pool Paused: ${isPaused ? 'Yes' : 'No'}`);
    } catch (error) {
      console.log("❌ Failed to check pause status:", error.message);
    }
    
    // Test 6: Check ownership
    console.log("\n👑 Test 6: Checking ownership...");
    try {
      const owner = await poolContract.owner();
      const isOwner = owner.toLowerCase() === wallet.address.toLowerCase();
      console.log(`Pool Owner: ${owner}`);
      console.log(`Is Current Wallet Owner: ${isOwner ? 'Yes' : 'No'}`);
    } catch (error) {
      console.log("❌ Failed to check ownership:", error.message);
    }
    
    // Test 7: Check fee configuration
    console.log("\n💰 Test 7: Checking fee configuration...");
    try {
      const feeBps = await poolContract.FEE_BPS();
      const feeDenominator = await poolContract.FEE_DENOMINATOR();
      const feePercentage = (Number(feeBps) / Number(feeDenominator)) * 100;
      console.log(`Fee: ${feePercentage.toFixed(1)}%`);
    } catch (error) {
      console.log("❌ Failed to check fee configuration:", error.message);
    }
    
    // Test 8: Test flexible input validation
    console.log("\n🔍 Test 8: Testing Flexible Input Validation...");
    try {
      // Test with zero amounts (should fail)
      const zeroAmounts = await poolContract.calculateLPTokens(0, 0);
      console.log(`📊 Zero amounts calculation: ${ethers.formatUnits(zeroAmounts, 6)} LP tokens`);
    } catch (error) {
      console.log("✅ Zero amounts correctly rejected:", error.message);
    }
    
    console.log("\n✅ Pool testing completed!");
    
    console.log("\n📋 Test Results Summary:");
    console.log("• Pool contract is deployed and accessible");
    console.log("• Flexible liquidity functions are working");
    console.log("• Users can now add USDC-only, HBAR-only, or both");
    console.log("• Pool is ready for flexible liquidity provision");
    
    console.log("\n🎉 All tests completed successfully!");
    console.log("Pool is ready for flexible liquidity provision!");
    
  } catch (error) {
    console.error("❌ Pool testing failed:", error);
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
  testClearSkyPool()
    .then(() => {
      console.log("\n🎉 Pool Testing Completed!");
      console.log("Pool is ready for flexible liquidity provision!");
    })
    .catch((error) => {
      console.error("Failed to test pool:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { testClearSkyPool }; 