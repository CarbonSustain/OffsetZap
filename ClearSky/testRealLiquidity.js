import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function testRealLiquidity() {
  try {
    console.log("🌊 Testing Real Flexible Liquidity Provision to ClearSky Pool...");
    
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
    
    // USDC token contract (we'll need this for approval)
    const usdcToken = new ethers.Contract(
      deploymentInfo.usdcToken,
      [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function balanceOf(address account) external view returns (uint256)",
        "function allowance(address owner, address spender) external view returns (uint256)"
      ],
      wallet
    );
    
    console.log("\n📋 Pool Information:");
    console.log(`Pool Address: ${poolAddress}`);
    console.log(`USDC Token: ${deploymentInfo.usdcToken}`);
    console.log(`Your Address: ${wallet.address}`);
    
    // Check balances
    console.log("\n💰 Checking Balances...");
    const hbarBalance = await provider.getBalance(wallet.address);
    const usdcBalance = await usdcToken.balanceOf(wallet.address);
    
    console.log(`HBAR Balance: ${ethers.formatEther(hbarBalance)} HBAR`);
    console.log(`USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
    
    // Test different liquidity scenarios
    console.log("\n🧪 Testing Different Liquidity Scenarios:");
    
    // Scenario 1: HBAR-only liquidity (no USDC required!)
    console.log("\n🌊 Scenario 1: HBAR-Only Liquidity");
    const hbarAmount = ethers.parseEther("0.01"); // 0.01 HBAR
    
    if (hbarBalance >= hbarAmount) {
      console.log(`✅ HBAR balance sufficient: ${ethers.formatEther(hbarAmount)} HBAR`);
      
      // Calculate expected LP tokens for HBAR-only
      const hbarOnlyLPTokens = await poolContract.calculateLPTokens(0, hbarAmount);
      console.log(`📊 Expected LP Tokens: ${ethers.formatUnits(hbarOnlyLPTokens, 6)} CSLP`);
      
      // Apply slippage tolerance (1% buffer)
      const hbarSlippageBps = 100; // 1%
      const hbarMinLPTokens = hbarOnlyLPTokens * BigInt(10000 - hbarSlippageBps) / BigInt(10000);
      console.log(`📊 Min LP Tokens (with 1% slippage): ${ethers.formatUnits(hbarMinLPTokens, 6)} CSLP`);
      
      // Add HBAR-only liquidity
      console.log("\n🌊 Adding HBAR-Only Liquidity...");
      const addHbarLiquidityTx = await poolContract.addLiquidity(
        0, // 0 USDC
        hbarMinLPTokens, // minLPTokens with slippage tolerance
        { value: hbarAmount } // HBAR amount
      );
      
      console.log(`HBAR-Only Liquidity Transaction: ${addHbarLiquidityTx.hash}`);
      console.log("⏳ Waiting for transaction confirmation...");
      
      const hbarReceipt = await addHbarLiquidityTx.wait();
      console.log("✅ HBAR-only liquidity added successfully!");
      console.log(`Gas Used: ${hbarReceipt.gasUsed.toString()}`);
      
    } else {
      console.log(`❌ Insufficient HBAR: Need ${ethers.formatEther(hbarAmount)} HBAR, have ${ethers.formatEther(hbarBalance)} HBAR`);
    }
    
    // Scenario 2: USDC-only liquidity (if USDC available)
    if (usdcBalance > 0) {
      console.log("\n🌊 Scenario 2: USDC-Only Liquidity");
      const usdcAmount = ethers.parseUnits("1", 6); // 1 USDC
      
      if (usdcBalance >= usdcAmount) {
        console.log(`✅ USDC balance sufficient: ${ethers.formatUnits(usdcAmount, 6)} USDC`);
        
        // Check USDC allowance
        console.log("\n🔐 Checking USDC Approval...");
        const currentAllowance = await usdcToken.allowance(wallet.address, poolAddress);
        console.log(`Current Allowance: ${ethers.formatUnits(currentAllowance, 6)} USDC`);
        
        if (currentAllowance < usdcAmount) {
          console.log("📝 Approving USDC spending...");
          const approveTx = await usdcToken.approve(poolAddress, usdcAmount);
          console.log(`Approval Transaction: ${approveTx.hash}`);
          
          console.log("⏳ Waiting for approval confirmation...");
          await approveTx.wait();
          console.log("✅ USDC approval confirmed!");
        } else {
          console.log("✅ USDC already approved!");
        }
        
        // Calculate expected LP tokens for USDC-only
        const usdcOnlyLPTokens = await poolContract.calculateLPTokens(usdcAmount, 0);
        console.log(`📊 Expected LP Tokens: ${ethers.formatUnits(usdcOnlyLPTokens, 6)} CSLP`);
        
        // Apply slippage tolerance (1% buffer)
        const usdcSlippageBps = 100; // 1%
        const usdcMinLPTokens = usdcOnlyLPTokens * BigInt(10000 - usdcSlippageBps) / BigInt(10000);
        console.log(`📊 Min LP Tokens (with 1% slippage): ${ethers.formatUnits(usdcMinLPTokens, 6)} CSLP`);
        
        // Add USDC-only liquidity
        console.log("\n🌊 Adding USDC-Only Liquidity...");
        const addUsdcLiquidityTx = await poolContract.addLiquidity(
          usdcAmount, // USDC amount
          usdcMinLPTokens, // minLPTokens with slippage tolerance
          { value: 0 } // 0 HBAR
        );
        
        console.log(`USDC-Only Liquidity Transaction: ${addUsdcLiquidityTx.hash}`);
        console.log("⏳ Waiting for transaction confirmation...");
        
        const usdcReceipt = await addUsdcLiquidityTx.wait();
        console.log("✅ USDC-only liquidity added successfully!");
        console.log(`Gas Used: ${usdcReceipt.gasUsed.toString()}`);
        
      } else {
        console.log(`❌ Insufficient USDC: Need ${ethers.formatUnits(usdcAmount, 6)} USDC, have ${ethers.formatUnits(usdcBalance, 6)} USDC`);
      }
    } else {
      console.log("\n🌊 Scenario 2: USDC-Only Liquidity");
      console.log("⏳ Skipping USDC test - no USDC balance available");
      console.log("💡 Get testnet USDC from Hedera faucet to test this scenario");
    }
    
    // Check updated pool state
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
    
    console.log("\n🎉 Flexible Liquidity Test Completed Successfully!");
    console.log("Your ClearSky liquidity pool now supports flexible input!");
    console.log("Users can add USDC-only, HBAR-only, or both!");
    
    return true;
    
  } catch (error) {
    console.error("❌ Flexible Liquidity Test Failed:", error);
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
  testRealLiquidity()
    .then(() => {
      console.log("\n🎉 Flexible Liquidity Test Completed!");
      console.log("Pool now supports flexible input!");
    })
    .catch((error) => {
      console.error("Failed to test flexible liquidity:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { testRealLiquidity }; 