import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function initializePool() {
  try {
    console.log(" Initializing ClearSky Liquidity Pool...");
    
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
      throw new Error('Missing _RPC_URL in .env file');
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
    console.log(`Initializing from: ${wallet.address}`);
    
    // Load contract
    const poolContract = new ethers.Contract(poolAddress, deploymentInfo.abi, wallet);
    
    console.log("\n Pool Information:");
    console.log(`Pool Address: ${poolAddress}`);
    console.log(`Owner: ${wallet.address}`);
    console.log(`Network: ${network}`)
    
    // Check if pool is already initialized
    console.log("\n Checking pool initialization status...");
    try {
      const isInitialized = await poolContract.isInitialized();
      if (isInitialized) {
        console.log(" Pool is already initialized!");
        
        // Show current pool state
        const [totalHBAR, totalLPTokens, totalPoolValue] = await poolContract.getPoolInfo();
        
        console.log("\n📊 Current Pool State:");
        console.log(`Total HBAR: ${ethers.formatUnits(totalHBAR, 8)} HBAR (raw: ${totalHBAR.toString()})`);
        console.log(`Total LP Tokens: ${ethers.formatUnits(totalLPTokens, 6)} CSLP (raw: ${totalLPTokens.toString()})`);
        console.log(`Total Pool Value: ${ethers.formatUnits(totalPoolValue, 8)} HBAR (raw: ${totalPoolValue.toString()})`);
        
        return true;
      }
    } catch (error) {
      console.log(" Could not check initialization status (contract might not have isInitialized function)");
    }
    
    // Check HBAR balance
    console.log("\n💰 Checking HBAR Balance...");
    const hbarBalance = await provider.getBalance(wallet.address);
    console.log(`HBAR Balance: ${ethers.formatUnits(hbarBalance, 18)} HBAR (raw: ${hbarBalance.toString()})`);
    
    // Initialization amount (proper amount for a real pool)
    // HBAR on Hedera is 8 decimals, but ethers treats it as 18 decimals in balance
    const initAmount = ethers.parseUnits("10", 18); // 10 HBAR in wei format (18 decimals for ethers)
    
    console.log(`\n🧪 Initialization Amount: ${ethers.formatUnits(initAmount, 18)} HBAR (raw: ${initAmount.toString()})`);
    console.log(`Contract MIN_LIQUIDITY: 100000 (0.001 HBAR in 8 decimals)`);
    console.log(`Sending to contract: ${initAmount.toString()} wei`);
    
    // Check if we have enough HBAR
    if (hbarBalance < initAmount) {
      console.log(`❌ Insufficient HBAR: Need ${ethers.formatUnits(initAmount, 18)} HBAR, have ${ethers.formatUnits(hbarBalance, 18)} HBAR`);
      return false;
    }
    
    // Initialize the pool
    console.log("\n🚀 Initializing Pool with HBAR...");
    console.log(`This will add ${ethers.formatUnits(initAmount, 18)} HBAR to the pool and mint LP tokens to you!`);
    
    const initTx = await poolContract.initializePool({
      value: initAmount
    });
    
    console.log(`Initialization Transaction: ${initTx.hash}`);
    console.log("⏳ Waiting for transaction confirmation...");
    
    const receipt = await initTx.wait();
    console.log("✅ Pool initialized successfully!");
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    
    // Check for HTS token minting events
    console.log("\n🔍 Checking Transaction Events:");
    console.log(`Total events emitted: ${receipt.logs.length}`);
    
    let htsMintAttempts = 0;
    let htsMintSuccesses = 0;
    let htsMintFailures = 0;
    
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`\nEvent ${i + 1}:`);
      console.log(`  Address: ${log.address}`);
      console.log(`  Topics: ${JSON.stringify(log.topics)}`);
      
      try {
        // Try to parse as pool events
        const parsedLog = poolContract.interface.parseLog(log);
        console.log(`  ✅ Parsed Pool Event: ${parsedLog.name}`);
        
        // Handle specific HTS events
        if (parsedLog.name === 'HTSMintAttempt') {
          htsMintAttempts++;
          console.log(`  🔄 HTS Mint Attempt:`);
          console.log(`     Token: ${parsedLog.args.token}`);
          console.log(`     To: ${parsedLog.args.to}`);
          console.log(`     Amount: ${parsedLog.args.amount.toString()}`);
        } else if (parsedLog.name === 'HTSMintSuccess') {
          htsMintSuccesses++;
          console.log(`  ✅ HTS Mint Success:`);
          console.log(`     Token: ${parsedLog.args.token}`);
          console.log(`     To: ${parsedLog.args.to}`);
          console.log(`     Amount: ${parsedLog.args.amount.toString()}`);
          console.log(`     New Total Supply: ${parsedLog.args.newTotalSupply.toString()}`);
        } else if (parsedLog.name === 'HTSMintFailed') {
          htsMintFailures++;
          console.log(`  ❌ HTS Mint Failed:`);
          console.log(`     Token: ${parsedLog.args.token}`);
          console.log(`     To: ${parsedLog.args.to}`);
          console.log(`     Amount: ${parsedLog.args.amount.toString()}`);
          console.log(`     Response Code: ${parsedLog.args.responseCode.toString()}`);
        } else {
          console.log(`  📋 Event Args:`, parsedLog.args);
        }
      } catch (error) {
        console.log(`  ⚠️  Could not parse as pool event (might be token/system event)`);
      }
    }
    
    // Summary of HTS events
    console.log(`\n📊 HTS Event Summary:`);
    console.log(`  Mint Attempts: ${htsMintAttempts}`);
    console.log(`  Mint Successes: ${htsMintSuccesses}`);
    console.log(`  Mint Failures: ${htsMintFailures}`);
    
    // Check updated pool state
    console.log("\n📊 Updated Pool State:");
    const [newTotalHBAR, newTotalLPTokens, newTotalPoolValue] = await poolContract.getPoolInfo();
    
    console.log(`Total HBAR: ${ethers.formatUnits(newTotalHBAR, 8)} HBAR (raw: ${newTotalHBAR.toString()})`);
    console.log(`Total LP Tokens: ${ethers.formatUnits(newTotalLPTokens, 6)} CSLP (raw: ${newTotalLPTokens.toString()})`);
    console.log(`Total Pool Value: ${ethers.formatUnits(newTotalPoolValue, 8)} HBAR (raw: ${newTotalPoolValue.toString()})`);
    
    // Get value per token
    const valuePerToken = await poolContract.getValuePerLPToken();
    console.log(`Value per LP Token: ${ethers.formatUnits(valuePerToken, 6)} HBAR (raw: ${valuePerToken.toString()})`);
    
    // Check your LP token balance and value
    const lpToken = new ethers.Contract(
      deploymentInfo.lpToken,
      ["function balanceOf(address account) external view returns (uint256)"],
      wallet
    );
    
    const yourLPBalance = await lpToken.balanceOf(wallet.address);
    const yourValue = await poolContract.getUserValue(wallet.address);
    const [yourHbarShare, yourLpBalance] = await poolContract.getUserShare(wallet.address);
    
    console.log("\n💰 Your Wallet Information:");
    console.log(`Your LP Balance: ${ethers.formatUnits(yourLPBalance, 6)} CSLP (raw: ${yourLPBalance.toString()})`);
    console.log(`Your HBAR Value: ${ethers.formatUnits(yourValue, 8)} HBAR (raw: ${yourValue.toString()})`);
    console.log(`Your HBAR Share: ${ethers.formatUnits(yourHbarShare, 8)} HBAR (raw: ${yourHbarShare.toString()})`);
    
    // Also check the pool contract's LP token balance (should be 0)
    const poolLPBalance = await lpToken.balanceOf(poolAddress);
    console.log(`Pool Contract LP Balance: ${ethers.formatUnits(poolLPBalance, 6)} CSLP (raw: ${poolLPBalance.toString()})`);
    
    // Verify the math (convert from 18 decimals to 8 decimals for contract)
    const initAmountIn8Decimals = initAmount / 10000000000n; // Convert from 18 to 8 decimals
    console.log("\n🧮 Verification:");
    console.log(`Init amount in 8 decimals: ${ethers.formatUnits(initAmountIn8Decimals, 8)} HBAR (raw: ${initAmountIn8Decimals.toString()})`);
    
    // Correct calculation: (hbarAmount * 1000000) / 100000000
    const expectedLPTokens = (initAmountIn8Decimals * 1000000n) / 100000000n;
    console.log(`Expected LP tokens: ${ethers.formatUnits(expectedLPTokens, 6)} CSLP (proper decimal conversion)`);
    console.log(`Actual LP tokens: ${ethers.formatUnits(yourLPBalance, 6)} CSLP`);
    console.log(`Expected value per token: 0.0001 HBAR (1 HBAR = 1,000,000 tokens)`);
    console.log(`Actual value per token: ${ethers.formatUnits(valuePerToken, 6)} HBAR`);
    
    // Final balance check
    console.log("\n🔍 Final Balance Verification:");
    const finalHbarBalance = await provider.getBalance(wallet.address);
    const balanceDifference = hbarBalance - finalHbarBalance;
    console.log(`Initial HBAR Balance: ${ethers.formatUnits(hbarBalance, 18)} HBAR`);
    console.log(`Final HBAR Balance: ${ethers.formatUnits(finalHbarBalance, 18)} HBAR`);
    console.log(`HBAR Spent: ${ethers.formatUnits(balanceDifference, 18)} HBAR (includes gas)`);
    console.log(`Expected HBAR Spent: ${ethers.formatUnits(initAmount, 18)} HBAR (pool only)`);
    
    // Check if the math adds up
    const expectedValuePerToken = 1000000n; // Should be 1,000,000 (0.0001 HBAR per token in 6 decimals)
    
    console.log("\n✅ Math Verification:");
    console.log(`✅ HBAR spent matches initialization amount: ${balanceDifference === initAmount}`);
    console.log(`✅ LP tokens match expected: ${yourLPBalance === expectedLPTokens}`);
    console.log(`✅ Value per token is correct: ${valuePerToken === expectedValuePerToken}`);
    console.log(`✅ Pool contract holds 0 LP tokens: ${poolLPBalance === 0n}`);
    console.log(`✅ Your LP balance matches pool total: ${yourLPBalance === newTotalLPTokens}`);
    
    console.log("\n🎉 Pool Initialization Completed Successfully!");
    console.log("📈 Pool is now ready for users to add HBAR liquidity!");
    console.log("💡 Users can now add HBAR to the pool and receive LP tokens!");
    console.log("🔗 Each LP token represents ownership of the pool's value!");
    
    return true;
    
  } catch (error) {
    console.error(" Pool Initialization Failed:", error);
    throw error;
  }
}

// Main execution
console.log(" Debug: Checking execution condition...");
console.log(` import.meta.url: ${import.meta.url}`);
console.log(` process.argv[1]: ${process.argv[1]}`);

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

console.log(` Normalized import path: ${importPath}`);
console.log(` Normalized script path: ${scriptPath}`);
console.log(` Condition check: ${importPath === scriptPath}`);

if (importPath === scriptPath) {
  console.log(" Condition is TRUE - Running main execution...");
  initializePool()
    .then(() => {
      console.log("\n Pool Initialization Completed!");
      console.log("Pool is now ready for HBAR liquidity provision!");
    })
    .catch((error) => {
      console.error("Failed to initialize pool:", error);
      process.exit(1);
    });
} else {
  console.log(" Condition is FALSE - File imported as module, not running main execution");
  console.log(" This file is being imported, not run directly");
}

export { initializePool };
