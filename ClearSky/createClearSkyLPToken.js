import {
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenSupplyType,
  TokenType,
  TokenUpdateTransaction,
  ContractId
} from "@hashgraph/sdk";
import dotenv from 'dotenv';
import fs from 'fs';
const fetch = (await import("node-fetch")).default;

dotenv.config();

async function createClearSkyLPToken() {
  try {
    console.log("🚀 Creating ClearSky LP Token on Hedera...");
    
    // Load deployment info to get pool address
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    const poolAddress = deploymentInfo.poolAddress;
    console.log(`Pool Address in EVM: ${poolAddress}`);

    // Load your operator credentials
    const operatorId = process.env.OPERATOR_ID;
    const operatorKey = process.env.OPERATOR_KEY;
    
    if (!operatorId || !operatorKey) {
      throw new Error("Missing OPERATOR_ID or OPERATOR_KEY in .env file");
    }

    console.log(`Operator ID: ${operatorId}`);

    // Initialize Hedera client
    const client = Client.forTestnet()
      .setOperator(operatorId, operatorKey);

    // Generate keys for the LP token
    console.log("🔑 Generating cryptographic keys...");
    const supplyKey = PrivateKey.generateECDSA();
    const adminKey = PrivateKey.generateECDSA();

    console.log("📝 Creating LP token transaction...");

    //get proper pool contract id from mirror node

    const url = `https://testnet.mirrornode.hedera.com/api/v1/contracts/${poolAddress}`;

    const res = await fetch(url);
    const data = await res.json();
    const poolContractId = data.contract_id;


    console.log("Contract ID:", poolContractId);
    
    // Create the LP token
    const transaction = new TokenCreateTransaction()
      .setTokenName("ClearSky LP Token")
      .setTokenSymbol("CSLP")
      .setDecimals(6)
      .setInitialSupply(0) // Start with 0, pool will mint as needed
      .setSupplyType(TokenSupplyType.Infinite)
      .setTokenType(TokenType.FungibleCommon)
      .setTreasuryAccountId(poolContractId) // pool contract id
      .setAdminKey(adminKey.publicKey)
      .setSupplyKey(supplyKey.publicKey)
      .setTokenMemo("Liquidity Pool Token for ClearSky")
      .freezeWith(client);

    // Sign and execute
    console.log("✍️ Signing and executing transaction...");
    const myprivatekey = process.env.PRIVATE_KEY;
    const myprivateKey = PrivateKey.fromString(myprivatekey);
    console.log(`🔑 My Private Key: ${myprivateKey.toString()}`);
    const signedTx = await transaction.sign(myprivateKey);
    const txResponse = await signedTx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const tokenId = receipt.tokenId;

    console.log(`✅ ClearSky LP Token created successfully!`);
    console.log(`🆔 Token ID: ${tokenId}`);
    console.log(`🔑 Supply Key: ${supplyKey.toString()}`);
    console.log(`🔑 Admin Key: ${adminKey.toString()}`);

    // Save token information
    const tokenInfo = {
      tokenId: tokenId.toString(),
      supplyKey: supplyKey.toString(),
      adminKey: adminKey.toString(),
      tokenName: "ClearSky LP Token",
      tokenSymbol: "CSLP",
      decimals: 6,
      createdAt: new Date().toISOString(),
      network: "Hedera Testnet"
    };

    // Save to file for later use
    fs.writeFileSync('clearsky-lp-token.json', JSON.stringify(tokenInfo, null, 2));
    console.log(`💾 Token info saved to clearsky-lp-token.json`);

    // Display next steps
    console.log(`\n📋 Next Steps:`);
    console.log(`1. Deploy the liquidity pool contract`);
    console.log(`2. Transfer supply key control to the pool contract`);
    console.log(`3. Test the pool with small amounts`);
    console.log(`4. Deploy to mainnet when ready`);

    client.close();
    return tokenInfo;
    
  } catch (error) {
    console.error("❌ Error creating LP token:", error);
    throw error;
  }
}

// Function to transfer token control to pool contract
async function transferTokenControl(tokenId, supplyKeyString, adminKeyString, poolAddress) {
  try {
    console.log(`🔄 Transferring supply key control to pool contract...`);

    const operatorId = process.env.OPERATOR_ID;
    const operatorKey = process.env.OPERATOR_KEY;

    const client = Client.forTestnet().setOperator(operatorId, operatorKey);

    // Convert string keys back to PrivateKey objects
    const supplyKey = PrivateKey.fromString(supplyKeyString);
    const adminKey = PrivateKey.fromString(adminKeyString);

    console.log(`🔑 Converting string keys to PrivateKey objects...`);
    console.log(`   Supply Key: ${supplyKeyString.substring(0, 20)}...`);
    console.log(`   Admin Key: ${adminKeyString.substring(0, 20)}...`);

    // Convert EVM contract address → Hedera ContractId
    const poolContractIdMain = ContractId.fromEvmAddress(0, 0, poolAddress);
    console.log(`🔍 Pool Contract ID: ${poolContractIdMain}`);

    //get proper pool contract id from mirror node

    const url = `https://testnet.mirrornode.hedera.com/api/v1/contracts/${poolAddress}`;

    const res = await fetch(url);
    const data = await res.json();
    const poolContractId = data.contract_id;


    console.log("Contract ID:", poolContractId);

    // Step 1: Create the transaction and freeze it (SUPPLY KEY ONLY)
    console.log("📝 Creating token update transaction...");
    console.log("⚠️ Only transferring supply key (treasury cannot be changed after creation)");
    const updateTx = new TokenUpdateTransaction()
      .setTokenId(tokenId)
      .setSupplyKey(poolContractIdMain)
      // .setTreasuryAccountId(poolContractId) // This likely can't be changed
      .freezeWith(client);

    console.log("🔒 Transaction frozen for multisignature signing...");

    // Step 2: Sign with admin key only (simpler approach)
    console.log("✍️ Signing with admin key...");
    console.log(`🔑 Admin key: ${adminKey.publicKey.toString()}`);

    // Sign the transaction with the admin key
    const signedUpdateTx = await updateTx.sign(adminKey);
    console.log("✅ Transaction signed with admin key");

    // Step 3: Verify the signature
    console.log("🔍 Verifying signature...");
    const signatures = signedUpdateTx.getSignatures();
    console.log(`📋 Transaction has ${signatures.size} node signatures`);

    // Step 5: Submit the multisigned transaction
    console.log("🚀 Submitting multisigned transaction...");
    const txResponse = await signedUpdateTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    console.log(`✅ Supply key transferred to pool contract: ${poolAddress}`);
    console.log(`   ✅ Pool can now mint/burn tokens`);
    console.log(`   ⚠️ Treasury account remains unchanged (as expected)`);
    console.log(`   Transaction Status: ${receipt.status.toString()}`);
    client.close();

  } catch (error) {
    console.error("❌ Error transferring token control:", error);
    throw error;
  }
}

// Main execution
console.log("🔍 Debug: Checking execution condition...");
console.log(`📁 import.meta.url: ${import.meta.url}`);
console.log(`📁 process.argv[1]: ${process.argv[1]}`);
console.log(`📁 process.argv[0]: ${process.argv[0]}`);
console.log(`📁 process.argv: ${JSON.stringify(process.argv)}`);

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
  console.log("🚀 Starting ClearSky LP Token creation...");
  createClearSkyLPToken()
    .then((tokenInfo) => {
      console.log("\n🎉 ClearSky LP Token creation completed successfully!");
      console.log("Token ready for liquidity pool integration.");
    })
    .catch((error) => {
      console.error("Failed to create LP token:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { createClearSkyLPToken, transferTokenControl }; 