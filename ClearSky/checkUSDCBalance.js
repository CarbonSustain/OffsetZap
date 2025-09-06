import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function checkUSDCBalance() {
  try {
    console.log("🔍 Checking USDC Balance...");
    
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
    
    const walletAddress = "0x39f38eabff2fCcC01F6Da3502838d1c21acE46B8";
    const usdcTokenAddress = "0x0000000000000000000000000000000000068cda";
    
    console.log(`Wallet: ${walletAddress}`);
    console.log(`USDC Token: ${usdcTokenAddress}`);
    console.log(`Network: ${network}`);
    
    // USDC token contract (minimal ABI for balance check)
    const usdcToken = new ethers.Contract(
      usdcTokenAddress,
      ["function balanceOf(address account) external view returns (uint256)"],
      provider
    );
    
    // Check balance
    const balance = await usdcToken.balanceOf(walletAddress);
    const formattedBalance = ethers.formatUnits(balance, 6);
    
    console.log(`\n💰 USDC Balance: ${formattedBalance} USDC`);
    
    if (balance > 0) {
      console.log("✅ USDC tokens received! Ready for liquidity test!");
    } else {
      console.log("⏳ Still waiting for USDC tokens...");
      console.log("💡 Tokens from faucet can take a few minutes to arrive");
    }
    
  } catch (error) {
    console.error("❌ Error checking USDC balance:", error);
  }
}

// Run the check
checkUSDCBalance(); 