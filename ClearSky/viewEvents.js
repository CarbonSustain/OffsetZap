import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * View events from a specific transaction hash
 */
async function viewEvents(transactionHash) {
  try {
    console.log(`🔍 Viewing Events for Transaction: ${transactionHash}`);
    
    // Load deployment info
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    
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
    
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null
    });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }
    
    const wallet = new ethers.Wallet(privateKey, provider);
    
    // Get transaction receipt
    console.log("📥 Fetching transaction receipt...");
    const receipt = await provider.getTransactionReceipt(transactionHash);
    
    if (!receipt) {
      console.log("❌ Transaction not found or not confirmed");
      return false;
    }
    
    console.log(`✅ Transaction found!`);
    console.log(`Block Number: ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    console.log(`Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
    
    // Load pool contract for event parsing
    const poolContract = new ethers.Contract(deploymentInfo.poolAddress, deploymentInfo.abi, wallet);
    
    // Parse events
    console.log(`\n🔍 Events Analysis:`);
    console.log(`Total events emitted: ${receipt.logs.length}`);
    
    let htsMintAttempts = 0;
    let htsMintSuccesses = 0;
    let htsMintFailures = 0;
    let poolInitialized = 0;
    let liquidityAdded = 0;
    
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`\n📋 Event ${i + 1}:`);
      console.log(`  Address: ${log.address}`);
      console.log(`  Topics: ${JSON.stringify(log.topics, null, 2)}`);
      console.log(`  Data: ${log.data}`);
      
      try {
        // Try to parse as pool events
        const parsedLog = poolContract.interface.parseLog(log);
        console.log(`  ✅ Parsed Pool Event: ${parsedLog.name}`);
        
        // Handle specific events
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
          
          // Decode response code
          const responseCode = parseInt(parsedLog.args.responseCode.toString());
          console.log(`     Response Meaning: ${getResponseCodeMeaning(responseCode)}`);
          
        } else if (parsedLog.name === 'PoolInitialized') {
          poolInitialized++;
          console.log(`  🏊 Pool Initialized:`);
          console.log(`     Initializer: ${parsedLog.args.initializer}`);
          console.log(`     HBAR Amount: ${ethers.formatUnits(parsedLog.args.hbarAmount, 8)} HBAR`);
          console.log(`     Timestamp: ${new Date(parseInt(parsedLog.args.timestamp.toString()) * 1000).toISOString()}`);
          
        } else if (parsedLog.name === 'LiquidityAdded') {
          liquidityAdded++;
          console.log(`  💧 Liquidity Added:`);
          console.log(`     User: ${parsedLog.args.user}`);
          console.log(`     HBAR Amount: ${ethers.formatUnits(parsedLog.args.hbarAmount, 8)} HBAR`);
          console.log(`     LP Tokens: ${ethers.formatUnits(parsedLog.args.lpTokensMinted, 6)} CSLP`);
          console.log(`     Timestamp: ${new Date(parseInt(parsedLog.args.timestamp.toString()) * 1000).toISOString()}`);
          
        } else {
          console.log(`  📋 Other Event Args:`, parsedLog.args);
        }
        
      } catch (error) {
        console.log(`  ⚠️  Could not parse as pool event`);
        console.log(`     Might be: Token event, System event, or External contract event`);
        
        // Try to identify common event signatures
        if (log.topics.length > 0) {
          const signature = log.topics[0];
          console.log(`     Event Signature: ${signature}`);
          
          // Common ERC-20 events
          if (signature === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
            console.log(`     🔄 Likely ERC-20 Transfer event`);
          } else if (signature === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925') {
            console.log(`     🔄 Likely ERC-20 Approval event`);
          }
        }
      }
    }
    
    // Summary
    console.log(`\n📊 Event Summary:`);
    console.log(`  Pool Initialized: ${poolInitialized}`);
    console.log(`  Liquidity Added: ${liquidityAdded}`);
    console.log(`  HTS Mint Attempts: ${htsMintAttempts}`);
    console.log(`  HTS Mint Successes: ${htsMintSuccesses}`);
    console.log(`  HTS Mint Failures: ${htsMintFailures}`);
    
    if (htsMintFailures > 0) {
      console.log(`\n⚠️  Warning: ${htsMintFailures} HTS mint failure(s) detected!`);
      console.log(`   This likely means the contract doesn't have supply key control.`);
    }
    
    if (htsMintSuccesses > 0) {
      console.log(`\n✅ Success: ${htsMintSuccesses} HTS mint success(es) detected!`);
      console.log(`   Tokens should have been minted successfully.`);
    }
    
    return true;
    
  } catch (error) {
    console.error("❌ Error viewing events:", error);
    throw error;
  }
}

/**
 * Get human-readable meaning for Hedera response codes
 */
function getResponseCodeMeaning(code) {
  const codes = {
    0: "OK - Success",
    22: "SUCCESS - Transaction succeeded",
    180: "TOKEN_HAS_NO_SUPPLY_KEY - Supply key not set on token",
    184: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT - Account not associated with token",
    189: "INVALID_SUPPLY_KEY - Invalid supply key",
    193: "TOKEN_IS_IMMUTABLE - Token has no admin key",
    // Add more as needed
  };
  
  return codes[code] || `Unknown response code: ${code}`;
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const txHash = process.argv[2];
  
  if (!txHash) {
    console.log("Usage: node viewEvents.js <transaction_hash>");
    console.log("Example: node viewEvents.js 0x1234567890abcdef...");
    process.exit(1);
  }
  
  viewEvents(txHash)
    .then(() => {
      console.log("\n✅ Event analysis completed!");
    })
    .catch((error) => {
      console.error("Failed to view events:", error);
      process.exit(1);
    });
}

export { viewEvents };
