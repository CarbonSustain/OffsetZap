import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function testRealLiquidity() {
  try {
    console.log("🌊 Testing Real Liquidity Provision to ClearSky Pool...");
    
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
    
    // Test amounts (small amounts for testing)
    const usdcAmount = ethers.parseUnits("1", 6); // 1 USDC
    const hbarAmount = ethers.parseEther("0.001"); // 0.001 HBAR
    
    console.log(`\n🧪 Test Liquidity Amounts:`);
    console.log(`USDC: ${ethers.formatUnits(usdcAmount, 6)} USDC`);
    console.log(`HBAR: ${ethers.formatEther(hbarAmount)} HBAR`);
    
    // Check if we have enough tokens
    if (usdcBalance < usdcAmount) {
      console.log(`❌ Insufficient USDC: Need ${ethers.formatUnits(usdcAmount, 6)} USDC, have ${ethers.formatUnits(usdcBalance, 6)} USDC`);
      console.log(`💡 Get testnet USDC from Hedera faucet or bridge`);
      return false;
    }
    
    if (hbarBalance < hbarAmount) {
      console.log(`❌ Insufficient HBAR: Need ${ethers.formatEther(hbarAmount)} HBAR, have ${ethers.formatEther(hbarBalance)} HBAR`);
      console.log(`💡 Get testnet HBAR from Hedera faucet`);
      return false;
    }
    
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
    
    // Calculate expected LP tokens
    console.log("\n🧮 Calculating Expected LP Tokens...");
    const expectedLPTokens = await poolContract.calculateLPTokens(usdcAmount, hbarAmount);
    console.log(`Expected LP Tokens: ${ethers.formatUnits(expectedLPTokens, 6)} CSLP`);
    
    // Add liquidity
    console.log("\n🌊 Adding Liquidity to Pool...");
    console.log(`This will send ${ethers.formatUnits(usdcAmount, 6)} USDC and ${ethers.formatEther(hbarAmount)} HBAR to the pool`);
    
    const addLiquidityTx = await poolContract.addLiquidity(
      usdcAmount,
      expectedLPTokens, // minLPTokens (slippage protection)
      { value: hbarAmount } // HBAR amount
    );
    
    console.log(`Liquidity Transaction: ${addLiquidityTx.hash}`);
    console.log("⏳ Waiting for transaction confirmation...");
    
    const receipt = await addLiquidityTx.wait();
    console.log("✅ Liquidity added successfully!");
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    
    // Check new pool state
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
    
    console.log("\n🎉 Real Liquidity Test Completed Successfully!");
    console.log("Your ClearSky liquidity pool is now live with real liquidity!");
    
    return true;
    
  } catch (error) {
    console.error("❌ Real Liquidity Test Failed:", error);
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
      console.log("\n🎉 Real Liquidity Test Completed!");
      console.log("Pool is now live with real liquidity!");
    })
    .catch((error) => {
      console.error("Failed to test real liquidity:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { testRealLiquidity }; 