import { Client, TokenId, TokenInfoQuery } from "@hashgraph/sdk";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function checkTokenSimple() {
  try {
    console.log("🔍 Checking Token Treasury Account...");
    
    // Load token info
    const tokenInfo = JSON.parse(fs.readFileSync('clearsky-lp-token.json', 'utf8'));
    const tokenId = tokenInfo.tokenId;
    
    console.log(`Token ID: ${tokenId}`);
    
    // Network configuration
    const network = process.env.NETWORK || 'testnet';
    let client;
    
    if (network === 'mainnet') {
      client = Client.forMainnet();
    } else {
      client = Client.forTestnet();
    }
    
    // We don't need to set operator for read-only queries
    
    // Get detailed token info
    const tokenInfoQuery = new TokenInfoQuery()
      .setTokenId(TokenId.fromString(tokenId));
    
    const info = await tokenInfoQuery.execute(client);
    
    console.log("\n📋 Token Treasury Information:");
    console.log(`Name: ${info.name}`);
    console.log(`Symbol: ${info.symbol}`);
    console.log(`Total Supply: ${info.totalSupply.toString()}`);
    console.log(`Treasury Account: ${info.treasuryAccountId}`);
    console.log(`Supply Key: ${info.supplyKey ? 'Present' : 'None'}`);
    
    // Load deployment info to compare
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    const poolAddress = deploymentInfo.poolAddress;
    
    console.log(`\n🔍 Comparison:`);
    console.log(`Treasury Account: ${info.treasuryAccountId}`);
    console.log(`Pool Address: ${poolAddress}`);
    
    // Convert pool address to account ID format for comparison
    const poolAccountNum = parseInt(poolAddress.slice(2), 16);
    const expectedPoolAccountId = `0.0.${poolAccountNum}`;
    console.log(`Pool as Account ID: ${expectedPoolAccountId}`);
    
    const treasuryMatchesPool = info.treasuryAccountId.toString() === expectedPoolAccountId;
    console.log(`Treasury matches Pool: ${treasuryMatchesPool}`);
    
    if (!treasuryMatchesPool) {
      console.log("\n❌ ISSUE FOUND:");
      console.log("The treasury account is NOT the pool contract!");
      console.log("This means tokens are being minted to the treasury, not the pool.");
      console.log("That's why the user has all the tokens and the pool has none.");
    } else {
      console.log("\n✅ Treasury is correctly set to pool contract");
    }
    
    client.close();
    
  } catch (error) {
    console.error("❌ Error checking token:", error);
    throw error;
  }
}

checkTokenSimple()
  .then(() => {
    console.log("\n✅ Token check completed!");
  })
  .catch((error) => {
    console.error("Failed to check token:", error);
    process.exit(1);
  });
