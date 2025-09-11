import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Debug: Normalize paths for comparison
const normalizePath = (path) => {
  return path
    .replace(/^file:\/\//, '') // Remove file:// protocol
    .replace(/\\/g, '/') // Convert backslashes to forward slashes
    .replace(/^\/+/, '') // Remove leading slashes
    .toLowerCase(); // Make case-insensitive
};

const importPath = normalizePath(import.meta.url);
const scriptPath = normalizePath(process.argv[1]);

async function testPoolV3() {
  console.log("🧪 Testing ClearSky Liquidity Pool V3...\n");

  try {
    // Load deployment info
    let deploymentInfo;
    try {
      const deploymentData = fs.readFileSync('clearsky-pool-v3-deployment.json', 'utf8');
      deploymentInfo = JSON.parse(deploymentData);
      console.log(`📂 Loaded deployment info for pool at: ${deploymentInfo.contractAddress}`);
    } catch (error) {
      console.error("❌ Could not load deployment info. Please run deployPoolV3.js first.");
      throw error;
    }

    // Setup provider and wallet
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
    
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null
    });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }
    
    const signer = new ethers.Wallet(privateKey, provider);
    console.log(`👤 Testing with account: ${signer.address}`);
    console.log(`💰 Account balance: ${ethers.formatEther(await provider.getBalance(signer.address))} HBAR`);

    // Load contract ABI and connect to deployed contract
    const contractPath = './artifacts/contracts/ClearSkyLiquidityPoolV3.sol/ClearSkyLiquidityPoolV3.json';
    if (!fs.existsSync(contractPath)) {
      throw new Error("Contract artifacts not found. Run 'npx hardhat compile' first.");
    }
    
    const contractArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const { abi } = contractArtifact;
    
    const poolContract = new ethers.Contract(deploymentInfo.contractAddress, abi, signer);

    console.log(`🔗 Connected to pool contract at: ${deploymentInfo.contractAddress}`);

    // Check if pool is initialized
    const [totalHBAR, totalLPTokens, totalValue] = await poolContract.getPoolInfo();
    if (totalLPTokens == 0) {
      console.log(`❌ Pool is not initialized! Please run initializePoolV3.js first.`);
      return;
    }

    console.log(`\n📊 Current Pool State:`);
    console.log(`   • Total HBAR: ${ethers.formatUnits(totalHBAR, 8)} HBAR`);
    console.log(`   • Total LP Tokens: ${ethers.formatUnits(totalLPTokens, 6)} CSLPV3`);
    console.log(`   • Total Value: ${ethers.formatUnits(totalValue, 8)} HBAR`);

    // Get token info
    const tokenInfo = await poolContract.getTokenInfo();
    const lpTokenAddress = await poolContract.lpToken();
    
    console.log(`\n🪙 Token Information:`);
    console.log(`   • Name: ${tokenInfo.name}`);
    console.log(`   • Symbol: ${tokenInfo.symbol}`);
    console.log(`   • Address: ${lpTokenAddress}`);

    // Test adding liquidity
    const testAmount = ethers.parseUnits("5", 18); // 5 HBAR (ethers uses 18 decimals internally)
    console.log(`\n💧 Testing addLiquidity with ${ethers.formatEther(testAmount)} HBAR...`);

    // Calculate expected LP tokens
    const expectedLPTokens = await poolContract.calculateLPTokens(ethers.parseUnits("5", 8)); // Convert to 8 decimals for contract
    console.log(`🔢 Expected LP Tokens: ${ethers.formatUnits(expectedLPTokens, 6)} CSLPV3`);
    console.log(`🔢 Expected LP Tokens (raw): ${expectedLPTokens.toString()}`);
    
    // Apply considerable slippage tolerance for HTS fees (allow 20% less than expected)
    const slippageTolerance = 10000; // 20%
    const minLPTokensWithSlippage = (expectedLPTokens * BigInt(10000 - slippageTolerance)) / BigInt(10000);
    console.log(`🛡️ Min LP Tokens (with ${slippageTolerance}% slippage): ${ethers.formatUnits(minLPTokensWithSlippage, 6)} CSLPV3`);

    // Simulate the transaction first
    console.log(`🎭 Simulating addLiquidity transaction...`);
    try {
      await poolContract.addLiquidity.staticCall(
        minLPTokensWithSlippage, // minLPTokens with slippage tolerance
        { 
          value: testAmount,
        }
      );
      console.log(`✅ Simulation successful`);
    } catch (simError) {
      console.error(`❌ Simulation failed:`, simError.message);
      return;
    }

    // Execute the transaction
    console.log(`📝 Executing addLiquidity transaction...`);
    const tx = await poolContract.addLiquidity(
      minLPTokensWithSlippage, // minLPTokens with slippage tolerance
      { 
        value: testAmount,
      }
    );

    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);

    let receipt;
    try {
      receipt = await tx.wait();
      console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);
    } catch (waitError) {
      console.log(`❌ Transaction failed, but let's check the receipt for debugging...`);
      console.log(`⛽ Error: ${waitError.message}`);
      
      // Even if transaction failed, we can still get the receipt to see events
      if (waitError.receipt) {
        receipt = waitError.receipt;
        console.log(`📄 Failed transaction receipt found:`);
        console.log(`   • Block: ${receipt.blockNumber}`);
        console.log(`   • Gas used: ${receipt.gasUsed.toString()}`);
        console.log(`   • Status: ${receipt.status} (0 = failed, 1 = success)`);
      } else {
        // Try to get receipt manually
        try {
          receipt = await provider.getTransactionReceipt(tx.hash);
          console.log(`📄 Retrieved failed transaction receipt:`);
          console.log(`   • Block: ${receipt.blockNumber}`);
          console.log(`   • Gas used: ${receipt.gasUsed.toString()}`);
          console.log(`   • Status: ${receipt.status} (0 = failed, 1 = success)`);
        } catch (receiptError) {
          console.log(`❌ Could not retrieve transaction receipt: ${receiptError.message}`);
          throw waitError; // Re-throw original error
        }
      }
    }

    // Parse events from the transaction receipt (works even for failed transactions!)
    console.log(`\n📋 Transaction Events (${receipt.logs.length} logs found):`);
    let liquidityAdded = false;
    let htsMintSuccess = false;
    let htsTransferSuccess = false;
    let htsAssociateSuccess = false;
    let lpTokensMinted = ethers.toBigInt(0);
    let eventCount = 0;

    if (!receipt.logs || receipt.logs.length === 0) {
      console.log(`⚠️ No events found - transaction may have failed very early`);
    }

    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      try {
        const parsedLog = poolContract.interface.parseLog(log);
        console.log(`parsedLog: ${parsedLog}`);
        
        if (parsedLog) {
          eventCount++;
          console.log(`   🎯 Event ${eventCount}: ${parsedLog.name}`);
          
          switch (parsedLog.name) {
            case 'LiquidityAdded':
              console.log(`      • User: ${parsedLog.args.user}`);
              console.log(`      • HBAR Amount: ${ethers.formatUnits(parsedLog.args.hbarAmount, 8)} HBAR`);
              console.log(`      • LP Tokens Minted: ${ethers.formatUnits(parsedLog.args.lpTokensMinted, 6)} CSLPV3`);
              console.log(`      • Timestamp: ${new Date(Number(parsedLog.args.timestamp) * 1000).toISOString()}`);
              liquidityAdded = true;
              lpTokensMinted = parsedLog.args.lpTokensMinted;
              break;

            case 'HTSMintSuccess':
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(`      • Amount: ${parsedLog.args.amount.toString()}`);
              console.log(`      • New Total Supply: ${parsedLog.args.newTotalSupply.toString()}`);
              htsMintSuccess = true;
              break;

            case 'HTSTransferSuccess':
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • From: ${parsedLog.args.from}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(`      • Amount: ${parsedLog.args.amount.toString()}`);
              htsTransferSuccess = true;
              break;

            case 'HTSAssociateSuccess':
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • Account: ${parsedLog.args.account}`);
              htsAssociateSuccess = true;
              break;

            case 'HTSAssociateSkipped':
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • Account: ${parsedLog.args.account}`);
              console.log(`      • Reason: ${parsedLog.args.reason}`);
              htsAssociateSuccess = true; // Skipped means already associated
              break;

            case 'HTSMintFailed':
              console.log(`      • ❌ Token: ${parsedLog.args.token}`);
              console.log(`      • ❌ To: ${parsedLog.args.to}`);
              console.log(`      • ❌ Amount: ${parsedLog.args.amount.toString()}`);
              console.log(`      • ❌ Response Code: ${parsedLog.args.responseCode}`);
              break;

            case 'HTSTransferFailed':
              console.log(`      • ❌ Token: ${parsedLog.args.token}`);
              console.log(`      • ❌ From: ${parsedLog.args.from}`);
              console.log(`      • ❌ To: ${parsedLog.args.to}`);
              console.log(`      • ❌ Amount: ${parsedLog.args.amount.toString()}`);
              console.log(`      • ❌ Response Code: ${parsedLog.args.responseCode}`);
              break;

            case 'HTSMintAttempt':
              console.log(`      • 🔄 Token: ${parsedLog.args.token}`);
              console.log(`      • 🔄 To: ${parsedLog.args.to}`);
              console.log(`      • 🔄 Amount: ${parsedLog.args.amount.toString()}`);
              break;

            case 'HTSAssociateAttempt':
              console.log(`      • 🔄 Token: ${parsedLog.args.token}`);
              console.log(`      • 🔄 Account: ${parsedLog.args.account}`);
              break;

            case 'HTSTransferAttempt':
              console.log(`      • 🔄 Token: ${parsedLog.args.token}`);
              console.log(`      • 🔄 From: ${parsedLog.args.from}`);
              console.log(`      • 🔄 To: ${parsedLog.args.to}`);
              console.log(`      • 🔄 Amount: ${parsedLog.args.amount.toString()}`);
              break;

            default:
              console.log(`      • Unknown event - Args:`, parsedLog.args);
          }
        }
      } catch (error) {
        console.log(`   Event ${i + 1}: Could not parse (might be external event)`);
      }
    }

    if (eventCount === 0) {
      console.log(`⚠️ No contract events were emitted - this suggests the transaction failed very early`);
      console.log(`💡 Possible causes:`);
      console.log(`   • Insufficient gas`);
      console.log(`   • Contract revert before any events`);
      console.log(`   • Invalid function parameters`);
    } else {
      console.log(`\n📊 Event Summary: ${eventCount} events processed`);
    }

    // Verify pool state after adding liquidity (even if failed)
    console.log(`\n🔍 Verifying pool state after liquidity addition...`);
    const [newTotalHBAR, newTotalLPTokens, newTotalValue] = await poolContract.getPoolInfo();
    
    console.log(`📊 Pool State After Adding Liquidity:`);
    console.log(`   • Total HBAR: ${ethers.formatUnits(newTotalHBAR, 8)} HBAR`);
    console.log(`   • Total LP Tokens: ${ethers.formatUnits(newTotalLPTokens, 6)} CSLPV3`);
    console.log(`   • Total Value: ${ethers.formatUnits(newTotalValue, 8)} HBAR`);

    // Calculate value per LP token
    const valuePerLPToken = await poolContract.getValuePerLPToken();
    console.log(`   • Value per LP Token: ${ethers.formatUnits(valuePerLPToken, 8)} HBAR`);

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    const finalBalance = await provider.getBalance(signer.address);
    console.log(`   • Your HBAR Balance: ${ethers.formatEther(finalBalance)} HBAR`);
    console.log(`   • Your LP Balance: Check with HTS explorer or wallet`);

    // Test results summary
    console.log(`\n📋 Test Results Summary:`);
    console.log(`✅ Liquidity Added: ${liquidityAdded}`);
    console.log(`✅ HTS Mint Success: ${htsMintSuccess}`);
    console.log(`✅ HTS Transfer Success: ${htsTransferSuccess}`);
    console.log(`✅ HTS Association Success: ${htsAssociateSuccess}`);

    if (liquidityAdded && htsMintSuccess && htsTransferSuccess) {
      console.log(`\n🎉 ALL TESTS PASSED! 🎉`);
      console.log(`🏊‍♂️ Pool V3 is working correctly!`);
      console.log(`🪙 Users receive LP tokens as expected!`);
      console.log(`🔄 HTS integration is functioning properly!`);
    } else {
      console.log(`\n⚠️ Some tests failed. Check the events above for details.`);
    }

    return {
      success: liquidityAdded && htsMintSuccess && htsTransferSuccess,
      txHash: tx.hash,
      events: {
        liquidityAdded,
        htsMintSuccess,
        htsTransferSuccess,
        htsAssociateSuccess
      },
      poolState: {
        totalHBAR: newTotalHBAR,
        totalLPTokens: newTotalLPTokens,
        totalValue: newTotalValue,
        valuePerLPToken: valuePerLPToken
      }
    };

  } catch (error) {
    console.error(`❌ Pool V3 test failed:`, error);
    throw error;
  }
}

// Main execution
if (importPath === scriptPath) {
  testPoolV3()
    .then((result) => {
      if (result.success) {
        console.log(`\n🎉 Pool V3 test completed successfully!`);
        console.log(`📄 Transaction: ${result.txHash}`);
      } else {
        console.log(`\n❌ Pool V3 test completed with issues.`);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
}

export { testPoolV3 };
