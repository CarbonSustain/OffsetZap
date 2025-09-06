import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function checkPoolHBARBalance() {
  try {
    console.log("🔍 Checking Pool's HBAR Balance vs Tracked Liquidity...");
    
    // Load deployment info
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    const poolAddress = deploymentInfo.poolAddress;
    
    // Network configuration
    const network = process.env.NETWORK || 'testnet';
    const rpcUrl = network === 'mainnet' 
      ? process.env.HEDERA_MAINNET_RPC_URL 
      : process.env.HEDERA_TESTNET_RPC_URL;
    
    if (!rpcUrl) {
      throw new Error(`Missing ${network.toUpperCase()}_RPC_URL in .env file`);
    }
    
    // Initialize provider
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null
    });
    
    // Load contract
    const poolContract = new ethers.Contract(poolAddress, deploymentInfo.abi, provider);
    
    console.log(`Pool Address: ${poolAddress}`);
    console.log(`Network: ${network}`);
    
    // Check 1: Pool's actual HBAR balance (what's in the contract)
    console.log("\n💰 Pool's Actual HBAR Balance:");
    const actualHBARBalance = await provider.getBalance(poolAddress);
    console.log(`Contract HBAR Balance: ${ethers.formatEther(actualHBARBalance)} HBAR`);
    
    // Check 2: Pool's tracked HBAR liquidity (what the pool system knows about)
    console.log("\n📊 Pool's Tracked HBAR Liquidity:");
    const trackedHBAR = await poolContract.totalHBAR();
    console.log(`Tracked HBAR: ${ethers.formatEther(trackedHBAR)} HBAR`);
    
    // Check 3: Pool's tracked USDC liquidity
    console.log("\n📊 Pool's Tracked USDC Liquidity:");
    const trackedUSDC = await poolContract.totalUSDC();
    console.log(`Tracked USDC: ${ethers.formatUnits(trackedUSDC, 6)} USDC`);
    
    // Check 4: Pool's tracked LP tokens
    console.log("\n📊 Pool's Tracked LP Tokens:");
    const trackedLPTokens = await poolContract.totalLPTokens();
    console.log(`Tracked LP Tokens: ${ethers.formatUnits(trackedLPTokens, 6)} CSLP`);
    
    // Analysis
    console.log("\n🔍 Analysis:");
    
    if (actualHBARBalance > 0 && trackedHBAR == 0) {
      console.log("✅ HBAR is in the contract but NOT tracked by the liquidity system");
      console.log("💡 This means the HBAR was sent via simple transfer, not addLiquidity()");
      console.log("🎯 To use this HBAR, you need to call addLiquidity() with USDC");
    } else if (actualHBARBalance > 0 && trackedHBAR > 0) {
      console.log("✅ HBAR is both in the contract AND tracked by the liquidity system");
      console.log("🎉 This means addLiquidity() was called successfully!");
    } else if (actualHBARBalance == 0) {
      console.log("❌ No HBAR in the contract at all");
    }
    
    // Recommendation
    console.log("\n💡 Recommendation:");
    if (actualHBARBalance > 0 && trackedHBAR == 0) {
      console.log("You have HBAR in the contract! Now you just need USDC to call addLiquidity()");
      console.log("This will integrate the existing HBAR into the liquidity pool system");
    } else {
      console.log("You need both USDC and HBAR to add liquidity through addLiquidity()");
    }
    
  } catch (error) {
    console.error("❌ Error checking pool HBAR balance:", error);
  }
}

// Run the check
checkPoolHBARBalance(); 