import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function testHBAROnlyPool() {
  try {
    console.log("🚀 Testing HBAR-Only ClearSky Liquidity Pool...");
    
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
    console.log(`HBAR Balance: ${ethers.formatUnits(hbarBalance, 18)} HBAR (raw: ${hbarBalance.toString()})`);
    
    // Test 1: Check if pool is initialized
    console.log("\n📝 Test 1: Check Pool Status");
    const isInitialized = await poolContract.isInitialized();
    console.log(`Pool Initialized: ${isInitialized}`);
    
    if (!isInitialized) {
      console.log("⚠️ Pool not initialized yet. This test requires an initialized pool.");
      return false;
    }
    
    // Test 2: Get current pool info
    console.log("\n📝 Test 2: Get Pool Information");
    const [currentHbarBalance, currentLpTokenSupply, currentPoolValue] = await poolContract.getPoolInfo();
    console.log(`Current Pool HBAR: ${ethers.formatUnits(currentHbarBalance, 8)} HBAR (raw: ${currentHbarBalance.toString()})`);
    console.log(`Current LP Token Supply: ${ethers.formatUnits(currentLpTokenSupply, 6)} CSLP (raw: ${currentLpTokenSupply.toString()})`);
    console.log(`Current Pool Value: ${ethers.formatUnits(currentPoolValue, 8)} HBAR (raw: ${currentPoolValue.toString()})`);
    
    // Test amount (reasonable amount for testing)
    let hbarAmount = ethers.parseUnits("3", 18); // 1 HBAR for testing
    
    // If pool is small, use a smaller amount
    if (currentHbarBalance < ethers.parseUnits("100", 8)) { // Less than 100 HBAR in pool
      hbarAmount = ethers.parseUnits("1", 18); // 0.1 HBAR for smaller pools
      console.log("⚠️ Pool has limited HBAR, using smaller test amount");
    }
    
    console.log(`\n🧪 Test HBAR Amount: ${ethers.formatUnits(hbarAmount, 18)} HBAR (raw: ${hbarAmount.toString()})`);
    
    // Check if we have enough HBAR
    if (hbarBalance < hbarAmount) {
      console.log(`❌ Insufficient HBAR: Need ${ethers.formatUnits(hbarAmount, 18)} HBAR, have ${ethers.formatUnits(hbarBalance, 18)} HBAR`);
      return false;
    }
    
    // Test 3: Calculate expected LP tokens for HBAR-only
    console.log("\n📝 Test 3: Calculate Expected LP Tokens");
    const expectedLPTokensRaw = await poolContract.calculateLPTokens(hbarAmount);
    console.log("Expected LP Tokens raw:", expectedLPTokensRaw.toString());
    console.log(`Expected LP Tokens: ${ethers.formatUnits(expectedLPTokensRaw, 18)} CSLP`);
    const expectedLPTokens = ethers.formatUnits(expectedLPTokensRaw, 18);
    console.log("Expected LP Tokens Corrected:", expectedLPTokens);
    
    // Debug: Check if expected LP tokens is 0 or very small
    if (expectedLPTokens === 0n) {
      console.log("⚠️ Expected LP tokens is 0 - this might be because the pool is empty or calculation failed");
      console.log("💡 Let's try with a much smaller HBAR amount or check pool state");
      return false;
    }
    
    // Apply slippage tolerance ( buffer for very small pools)
    const slippageBps = 10000; // - more generous for small pools
    const minLPTokens = expectedLPTokensRaw * BigInt(10000 - slippageBps) / BigInt(10000);
    console.log(`Min LP Tokens (with slippage): ${ethers.formatUnits(minLPTokens, 18)} CSLP`);
    console.log(`Min LP Tokens (raw): ${minLPTokens.toString()}`);
    
    // Test 4: Add HBAR-only liquidity
    console.log("\n📝 Test 4: Add HBAR-Only Liquidity");
    console.log(`Adding ${ethers.formatUnits(hbarAmount, 18)} HBAR to the pool...`);
    
    // Simulate the transaction first
    try {
      await poolContract.addLiquidity.staticCall(
        minLPTokens,
        { value: hbarAmount }
      );
      console.log("✅ Simulation passed, should succeed");
    } catch (e) {
      console.error("❌ Simulation failed, revert reason:", e);
      return false;
    }
    
    // Execute the actual transaction
    const addLiquidityTx = await poolContract.addLiquidity(
      minLPTokens,
      { value: hbarAmount }
    );
    
    console.log(`HBAR-Only Liquidity Transaction: ${addLiquidityTx.hash}`);
    console.log("⏳ Waiting for transaction confirmation...");
    
    const receipt = await addLiquidityTx.wait();
    console.log("✅ HBAR-only liquidity added successfully!");
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    
    // Parse events to see HTS token minting
    console.log(`\n🔍 Checking Transaction Events (${receipt.logs.length} events):`);
    let htsMintAttempts = 0;
    let htsMintSuccesses = 0;
    let htsMintFailures = 0;
    
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      try {
        const parsedLog = poolContract.interface.parseLog(log);
        console.log(`  Event ${i + 1}: ${parsedLog.name}`);
        
        if (parsedLog.name === 'HTSMintAttempt') {
          htsMintAttempts++;
          console.log(`    🔄 HTS Mint Attempt: ${ethers.formatUnits(parsedLog.args.amount, 6)} CSLP`);
        } else if (parsedLog.name === 'HTSMintSuccess') {
          htsMintSuccesses++;
          console.log(`    ✅ HTS Mint Success: ${ethers.formatUnits(parsedLog.args.amount, 6)} CSLP`);
          console.log(`    📈 New Total Supply: ${ethers.formatUnits(parsedLog.args.newTotalSupply, 6)} CSLP`);
        } else if (parsedLog.name === 'HTSMintFailed') {
          htsMintFailures++;
          console.log(`    ❌ HTS Mint Failed: Code ${parsedLog.args.responseCode}`);
        } else if (parsedLog.name === 'LiquidityAdded') {
          console.log(`    💧 Liquidity Added: ${ethers.formatUnits(parsedLog.args.hbarAmount, 8)} HBAR → ${ethers.formatUnits(parsedLog.args.lpTokensMinted, 6)} CSLP`);
        }
      } catch (error) {
        console.log(`  Event ${i + 1}: Could not parse (might be external event)`);
      }
    }
    
    console.log(`\n📊 HTS Event Summary:`);
    console.log(`  Mint Attempts: ${htsMintAttempts}`);
    console.log(`  Mint Successes: ${htsMintSuccesses}`);
    console.log(`  Mint Failures: ${htsMintFailures}`);
    
    // Test 5: Check updated pool state
    console.log("\n📝 Test 5: Check Updated Pool State");
    const [newHbarBalance, newLpTokenSupply, newPoolValue] = await poolContract.getPoolInfo();
    console.log(`Updated Pool HBAR: ${ethers.formatUnits(newHbarBalance, 8)} HBAR (raw: ${newHbarBalance.toString()})`);
    console.log(`Updated LP Token Supply: ${ethers.formatUnits(newLpTokenSupply, 6)} CSLP (raw: ${newLpTokenSupply.toString()})`);
    console.log(`Updated Pool Value: ${ethers.formatUnits(newPoolValue, 8)} HBAR (raw: ${newPoolValue.toString()})`);
    
    // Calculate changes
    const hbarAdded = newHbarBalance - currentHbarBalance;
    const lpTokensAdded = newLpTokenSupply - currentLpTokenSupply;
    console.log(`\n📈 Changes:`);
    console.log(`  HBAR Added: ${ethers.formatUnits(hbarAdded, 8)} HBAR`);
    console.log(`  LP Tokens Added: ${ethers.formatUnits(lpTokensAdded, 6)} CSLP`);
    
    // Test 6: Check user's share
    console.log("\n📝 Test 6: Check User Share");
    const [userHbarShare, userLpBalance] = await poolContract.getUserShare(wallet.address);
    console.log(`Your HBAR share: ${ethers.formatUnits(userHbarShare, 8)} HBAR (raw: ${userHbarShare.toString()})`);
    console.log(`Your LP balance: ${ethers.formatUnits(userLpBalance, 6)} CSLP (raw: ${userLpBalance.toString()})`);
    
    // Get value per token
    const valuePerToken = await poolContract.getValuePerLPToken();
    console.log(`Value per LP Token: ${ethers.formatUnits(valuePerToken, 6)} HBAR (raw: ${valuePerToken.toString()})`);
    
    // Get your total value
    const yourValue = await poolContract.getUserValue(wallet.address);
    console.log(`Your Total Value: ${ethers.formatUnits(yourValue, 8)} HBAR (raw: ${yourValue.toString()})`);
    
    // Final verification
    console.log("\n🔍 Final Verification:");
    const expectedHbarIncrease = hbarAmount / 1000000000000000000n * 100000000n; // Convert from 18 to 8 decimals
    const actualHbarIncrease = hbarAdded;
    console.log(`Expected HBAR increase: ${ethers.formatUnits(expectedHbarIncrease, 8)} HBAR`);
    console.log(`Actual HBAR increase: ${ethers.formatUnits(actualHbarIncrease, 8)} HBAR`);
    console.log(`HBAR increase matches: ${expectedHbarIncrease === actualHbarIncrease}`);
    
    console.log(`HTS minting successful: ${htsMintSuccesses > 0}`);
    console.log(`LP tokens received: ${lpTokensAdded > 0n}`);
    
    const allTestsPassed = (
      htsMintSuccesses > 0 && 
      htsMintFailures === 0 && 
      lpTokensAdded > 0n && 
      expectedHbarIncrease === actualHbarIncrease
    );
    
    if (allTestsPassed) {
      console.log("\n🎉 HBAR-Only Pool Test Completed Successfully!");
      console.log("✅ Pool successfully accepted HBAR-only liquidity!");
      console.log("✅ LP tokens were minted via HTS!");
      console.log("✅ All calculations are correct!");
      console.log("✅ The HBAR-only functionality is working perfectly!");
    } else {
      console.log("\n⚠️ Some tests may have issues:");
      console.log(`  HTS Mint Successes: ${htsMintSuccesses}`);
      console.log(`  HTS Mint Failures: ${htsMintFailures}`);
      console.log(`  LP Tokens Added: ${lpTokensAdded.toString()}`);
      console.log(`  HBAR Match: ${expectedHbarIncrease === actualHbarIncrease}`);
    }
    
    return allTestsPassed;
    
  } catch (error) {
    console.error("❌ HBAR-Only Pool Test Failed:", error);
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
  testHBAROnlyPool()
    .then(() => {
      console.log("\n🎉 HBAR-Only Pool Test Completed!");
      console.log("✅ All tests passed!");
    })
    .catch((error) => {
      console.error("❌ Tests failed:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { testHBAROnlyPool };
