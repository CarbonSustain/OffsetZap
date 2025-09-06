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
    
    // Now use the NEW flexible addLiquidity function for HBAR-only!
    console.log("\n🌊 Testing HBAR-Only Liquidity with NEW Flexible Function...");
    console.log(`This will add ${ethers.formatEther(hbarAmount)} HBAR to the pool and mint LP tokens!`);
    
    // Calculate expected LP tokens for HBAR-only
    const expectedLPTokens = await poolContract.calculateLPTokens(0, hbarAmount);
    console.log(`📊 Expected LP Tokens: ${ethers.formatUnits(expectedLPTokens, 6)} CSLP`);
    
    // Apply slippage tolerance (5% buffer)
    const slippageBps = 500; // 5%
    const minLPTokens = expectedLPTokens * BigInt(10000 - slippageBps) / BigInt(10000);
    console.log(`📊 Min LP Tokens (with 5% slippage): ${ethers.formatUnits(minLPTokens, 6)} CSLP`);
    
    console.log("DEBUG: totalUSDC", await poolContract.totalUSDC());
    console.log("DEBUG: totalHBAR", await poolContract.totalHBAR());
    console.log("DEBUG: totalLPTokens", await poolContract.totalLPTokens());
    console.log("DEBUG: expectedLPTokens", expectedLPTokens.toString());
    console.log("DEBUG: minLPTokens", minLPTokens.toString());

    try {
      await poolContract.addLiquidity.staticCall(
        0,
        expectedLPTokens,
        { value: hbarAmount }
      );
      console.log("✅ Simulation passed, should succeed");
    } catch (e) {
      console.error("❌ Simulation failed, revert reason:", e);
    }
    

    // Add HBAR-only liquidity using the new flexible function
    const addLiquidityTx = await poolContract.addLiquidity(
      0, // 0 USDC
      minLPTokens, // minLPTokens with slippage tolerance
      { value: hbarAmount } // HBAR amount
    );
    
    console.log(`HBAR-Only Liquidity Transaction: ${addLiquidityTx.hash}`);
    console.log("⏳ Waiting for transaction confirmation...");
    
    const receipt = await addLiquidityTx.wait();
    console.log("✅ HBAR-only liquidity added successfully!");
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    
    // Check pool's updated state
    console.log("\n📊 Updated Pool State:");
    const newTotalUSDC = await poolContract.totalUSDC();
    const newTotalHBAR = await poolContract.totalHBAR();
    const newTotalLPTokens = await poolContract.totalLPTokens();
    
    console.log(`Total USDC: ${ethers.formatUnits(newTotalUSDC, 6)} USDC`);
    console.log(`Total HBAR: ${ethers.formatEther(newTotalHBAR)} HBAR`);
    console.log(`Total LP Tokens: ${ethers.formatUnits(newTotalLPTokens, 6)} CSLP`);
    
    // Check your LP token balance
    const lpToken = new ethers.Contract(
      deploymentInfo.lpToken,
      ["function balanceOf(address account) external view returns (uint256)"],
      wallet
    );
    
    const yourLPBalance = await lpToken.balanceOf(wallet.address);
    console.log(`Your LP Balance: ${ethers.formatUnits(yourLPBalance, 6)} CSLP`);
    
    console.log("\n🎉 HBAR-Only Liquidity Test Completed!");
    console.log("✅ Pool successfully accepted HBAR-only liquidity!");
    console.log("✅ LP tokens were minted to your wallet!");
    console.log("✅ The new flexible functionality is working!");
    
    return true;
    
  } catch (error) {
    console.error("❌ HBAR-Only Liquidity Test Failed:", error);
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
      console.log("\n🎉 HBAR-Only Liquidity Test Completed!");
      console.log("Pool now supports flexible input!");
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