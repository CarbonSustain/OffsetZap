import { Client, AccountId, TokenId, TokenInfoQuery } from "@hashgraph/sdk";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function checkHederaToken() {
  try {
    console.log("🔍 Checking Hedera Token Details...");
    
    // Load token info
    const tokenInfo = JSON.parse(fs.readFileSync('clearsky-lp-token.json', 'utf8'));
    const tokenId = tokenInfo.tokenId;
    
    // Network configuration
    const network = process.env.NETWORK || 'testnet';
    let client;
    
    if (network === 'mainnet') {
      client = Client.forMainnet();
    } else {
      client = Client.forTestnet();
    }
    
    // Check if ACCOUNT_ID is set, if not derive from private key
    let accountId;
    const privateKey = process.env.PRIVATE_KEY;
    
    if (process.env.ACCOUNT_ID) {
      accountId = AccountId.fromString(process.env.ACCOUNT_ID);
    } else {
      // We'll set a default or derive it - for now let's use a placeholder
      console.log("⚠️ ACCOUNT_ID not set in .env, using private key only");
      // We can still query token info without setting operator for read-only queries
    }
    
    if (accountId && privateKey) {
      client.setOperator(accountId, privateKey);
      console.log(`Account ID: ${accountId}`);
    } else if (privateKey) {
      console.log("Using private key without explicit account ID");
    }
    
    console.log(`Token ID: ${tokenId}`);
    
    // Get detailed token info
    const tokenInfoQuery = new TokenInfoQuery()
      .setTokenId(TokenId.fromString(tokenId));
    
    const info = await tokenInfoQuery.execute(client);
    
    console.log("\n📋 Hedera Token Information:");
    console.log(`Name: ${info.name}`);
    console.log(`Symbol: ${info.symbol}`);
    console.log(`Decimals: ${info.decimals}`);
    console.log(`Total Supply: ${info.totalSupply.toString()}`);
    console.log(`Treasury Account: ${info.treasuryAccountId}`);
    console.log(`Supply Key: ${info.supplyKey ? info.supplyKey.toString() : 'None'}`);
    console.log(`Admin Key: ${info.adminKey ? info.adminKey.toString() : 'None'}`);
    console.log(`Freeze Key: ${info.freezeKey ? info.freezeKey.toString() : 'None'}`);
    console.log(`Wipe Key: ${info.wipeKey ? info.wipeKey.toString() : 'None'}`);
    console.log(`KYC Key: ${info.kycKey ? info.kycKey.toString() : 'None'}`);
    console.log(`Pause Key: ${info.pauseKey ? info.pauseKey.toString() : 'None'}`);
    console.log(`Fee Schedule Key: ${info.feeScheduleKey ? info.feeScheduleKey.toString() : 'None'}`);
    console.log(`Auto Renew Account: ${info.autoRenewAccountId || 'None'}`);
    console.log(`Expiration Time: ${info.expirationTime}`);
    console.log(`Auto Renew Period: ${info.autoRenewPeriod ? info.autoRenewPeriod.seconds : 'None'} seconds`);
    console.log(`Memo: ${info.tokenMemo || 'None'}`);
    console.log(`Token Type: ${info.tokenType}`);
    console.log(`Supply Type: ${info.supplyType}`);
    console.log(`Max Supply: ${info.maxSupply ? info.maxSupply.toString() : 'None'}`);
    console.log(`Default Freeze Status: ${info.defaultFreezeStatus}`);
    console.log(`Default KYC Status: ${info.defaultKycStatus}`);
    console.log(`Deleted: ${info.isDeleted}`);
    console.log(`Paused: ${info.pauseStatus}`);
    
    // Load deployment info to get pool address
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    const poolAddress = deploymentInfo.poolAddress;
    
    // Convert pool address to Hedera account ID format
    console.log(`\n🏊 Pool Information:`);
    console.log(`Pool Contract Address: ${poolAddress}`);
    
    // Check if treasury matches pool
    console.log(`\n🔍 Treasury Analysis:`);
    console.log(`Treasury Account: ${info.treasuryAccountId}`);
    console.log(`Pool Address: ${poolAddress}`);
    
    // The treasury account should be the pool contract if we transferred control correctly
    const expectedTreasuryAccountId = `0.0.${parseInt(poolAddress.slice(2), 16)}`;
    console.log(`Expected Treasury (from pool address): ${expectedTreasuryAccountId}`);
    console.log(`Treasury matches pool: ${info.treasuryAccountId.toString() === expectedTreasuryAccountId}`);
    
    client.close();
    
  } catch (error) {
    console.error("❌ Error checking Hedera token:", error);
    throw error;
  }
}

checkHederaToken()
  .then(() => {
    console.log("\n✅ Hedera token check completed!");
  })
  .catch((error) => {
    console.error("Failed to check Hedera token:", error);
    process.exit(1);
  });
