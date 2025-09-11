import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function debugTokenInfo() {
  try {
    console.log("🔍 Debug: Checking Token Information...");
    
    // Load deployment and token info
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    const tokenInfo = JSON.parse(fs.readFileSync('clearsky-lp-token.json', 'utf8'));
    
    const poolAddress = deploymentInfo.poolAddress;
    
    // Convert Hedera Token ID to Ethereum address format
    // Token ID format: "0.0.6748456" -> need to convert to hex address
    const tokenId = tokenInfo.tokenId;
    const tokenIdParts = tokenId.split('.');
    const tokenNum = parseInt(tokenIdParts[2]);
    const tokenAddress = `0x${tokenNum.toString(16).padStart(40, '0')}`;
    
    console.log(`Pool Address: ${poolAddress}`);
    console.log(`Token ID (Hedera): ${tokenId}`);
    console.log(`Token Address (Ethereum): ${tokenAddress}`);
    
    // Network configuration
    const network = process.env.NETWORK || 'testnet';
    let rpcUrl;
    
    if (network === 'mainnet') {
      rpcUrl = process.env.HEDERA_MAINNET_RPC_URL;
    } else {
      rpcUrl = process.env.HEDERA_TESTNET_RPC_URL;
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`User Address: ${wallet.address}`);
    
    // Create token contract to check balances
    const tokenABI = [
      "function balanceOf(address account) external view returns (uint256)",
      "function totalSupply() external view returns (uint256)",
      "function name() external view returns (string)",
      "function symbol() external view returns (string)",
      "function decimals() external view returns (uint8)"
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, tokenABI, provider);
    
    console.log("\n📊 Token Information:");
    try {
      const name = await tokenContract.name();
      const symbol = await tokenContract.symbol();
      const decimals = await tokenContract.decimals();
      const totalSupply = await tokenContract.totalSupply();
      
      console.log(`Name: ${name}`);
      console.log(`Symbol: ${symbol}`);
      console.log(`Decimals: ${decimals}`);
      console.log(`Total Supply: ${ethers.formatUnits(totalSupply, decimals)} ${symbol}`);
      console.log(`Total Supply (raw): ${totalSupply.toString()}`);
      
    } catch (error) {
      console.log("❌ Could not get token info:", error.message);
    }
    
    console.log("\n💰 Token Balances:");
    
    // Check user balance
    try {
      const userBalance = await tokenContract.balanceOf(wallet.address);
      console.log(`User Balance: ${ethers.formatUnits(userBalance, 6)} CSLP (raw: ${userBalance.toString()})`);
    } catch (error) {
      console.log(`❌ Could not get user balance: ${error.message}`);
    }
    
    // Check pool contract balance
    try {
      const poolBalance = await tokenContract.balanceOf(poolAddress);
      console.log(`Pool Balance: ${ethers.formatUnits(poolBalance, 6)} CSLP (raw: ${poolBalance.toString()})`);
    } catch (error) {
      console.log(`❌ Could not get pool balance: ${error.message}`);
    }
    
    // Check pool contract info
    const poolABI = deploymentInfo.abi;
    const poolContract = new ethers.Contract(poolAddress, poolABI, provider);
    
    console.log("\n🏊 Pool Information:");
    try {
      const [hbarBalance, lpTokenSupply, poolValue] = await poolContract.getPoolInfo();
      console.log(`Pool HBAR: ${ethers.formatUnits(hbarBalance, 8)} HBAR`);
      console.log(`Pool LP Supply: ${ethers.formatUnits(lpTokenSupply, 6)} CSLP`);
      console.log(`Pool Value: ${ethers.formatUnits(poolValue, 8)} HBAR`);
      
      const lpTokenAddress = await poolContract.lpToken();
      console.log(`Pool's LP Token Address: ${lpTokenAddress}`);
      console.log(`Matches Token Address: ${lpTokenAddress.toLowerCase() === tokenAddress.toLowerCase()}`);
      
    } catch (error) {
      console.log(`❌ Could not get pool info: ${error.message}`);
    }
    
    // Check if user is associated with token using HTS precompile
    console.log("\n🔗 Checking HTS Association:");
    const HTS_ADDRESS = "0x0000000000000000000000000000000000000167";
    
    try {
      // Try to check if token is associated (this might fail, but that's ok)
      const htsABI = [
        "function isAssociated(address account, address token) external view returns (bool)"
      ];
      
      // Note: This function might not exist, but let's try
      const htsContract = new ethers.Contract(HTS_ADDRESS, htsABI, provider);
      
      try {
        const isAssociated = await htsContract.isAssociated(wallet.address, tokenAddress);
        console.log(`User Associated with Token: ${isAssociated}`);
      } catch (error) {
        console.log("⚠️ Could not check association status (function might not exist)");
        console.log(`   Trying to check association for: ${wallet.address} with token: ${tokenAddress}`);
      }
      
    } catch (error) {
      console.log("⚠️ HTS precompile check failed");
    }
    
    console.log("\n🔍 Summary:");
    console.log("If the pool has tokens but the user doesn't, the transfer is failing.");
    console.log("If the pool has 0 tokens, the minting might be going elsewhere.");
    
  } catch (error) {
    console.error("❌ Error in debug:", error);
    throw error;
  }
}

debugTokenInfo()
  .then(() => {
    console.log("\n✅ Debug completed!");
  })
  .catch((error) => {
    console.error("Failed to debug token info:", error);
    process.exit(1);
  });
