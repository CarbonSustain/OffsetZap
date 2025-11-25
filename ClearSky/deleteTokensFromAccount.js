import {
    Client,
    AccountId,
    PrivateKey,
    TokenId,
    TokenInfoQuery,
    TokenUpdateTransaction,
    TokenBurnTransaction,
    TokenDeleteTransaction,
    TokenDissociateTransaction,
    Hbar,
  } from "@hashgraph/sdk";
  import dotenv from "dotenv";
  import { AccountBalanceQuery } from "@hashgraph/sdk";

  
  dotenv.config();
  
  // ── Setup ───────────────────────────────────────────────
  const client = Client.forTestnet();
  const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
  const operatorKey = PrivateKey.fromStringDer(process.env.OPERATOR_KEY);
  client.setOperator(operatorId, operatorKey);
  
  // ── Tokens to process ───────────────────────────────────
  const TOKENS = [
    "0.0.7275781",
    "0.0.7289898",
    "0.0.7289909",
    "0.0.7289935","0.0.7290000","0.0.7301570","0.0.7301610","0.0.7301636","0.0.7301640"
  ];
  
  // ── Process each token sequentially ─────────────────────
  async function processToken(tokenIdStr) {
    const tokenId = TokenId.fromString(tokenIdStr);
    console.log(`\n🪙 Processing ${tokenId.toString()}...`);
  
    let info;
    try {
      info = await new TokenInfoQuery().setTokenId(tokenId).execute(client);
    } catch (err) {
      console.log(`   ⚠️ Could not fetch info (likely deleted): ${err.message}`);
      return;
    }
  
    const totalSupply = info.totalSupply.toNumber();
    const hasAdmin = info.adminKey !== null;
    const treasury = info.treasuryAccountId.toString();
  
    console.log(`   Treasury: ${treasury}`);
    console.log(`   Total Supply: ${totalSupply}`);
    console.log(`   Has Admin Key: ${hasAdmin}`);
  
    if (!hasAdmin) {
      console.log("   ⚠️ Token is immutable — cannot update or delete. Skipping.");
      return;
    }
  

const balance = await new AccountBalanceQuery()
  .setAccountId(info.treasuryAccountId)
  .execute(client);

const treasuryTokenBalance = balance.tokens._map.get(tokenId.toString()) || 0;

console.log(`   Treasury Balance: ${treasuryTokenBalance}`);

    // Burn if supply > 0
    if (treasuryTokenBalance > 0) {
      console.log("   🔄 Reassigning supply key back to your account...");
      const updateTx = await new TokenUpdateTransaction()
        .setTokenId(tokenId)
        .setSupplyKey(operatorKey.publicKey)
        .setMaxTransactionFee(new Hbar(5))
        .freezeWith(client)
        .sign(operatorKey);
      await (await updateTx.execute(client)).getReceipt(client);
      console.log("   ✅ Supply key reassigned.");
      
      console.log(`   🔥 Burning ${totalSupply} tokens...`);
      const burnTx = await new TokenBurnTransaction()
        .setTokenId(tokenId)
        .setAmount(totalSupply)
        .freezeWith(client)
        .sign(operatorKey);
      await (await burnTx.execute(client)).getReceipt(client);
      console.log("   ✅ Tokens burned.");
    } else {
      console.log("   ⚙️ No supply to burn, skipping key update.");
    }
  
    // Delete token
    try {
      console.log("   🗑 Deleting token...");
      const deleteTx = await new TokenDeleteTransaction()
        .setTokenId(tokenId)
        .freezeWith(client)
        .sign(operatorKey);
      await (await deleteTx.execute(client)).getReceipt(client);
      console.log("   ✅ Token deleted.");
    } catch (err) {
      console.log(`   ⚠️ Delete failed: ${err.message}`);
    }
  
    // Disassociate (only if not treasury)
    
      try {
        console.log("   🔓 Disassociating token from your account...");
        const dissociateTx = await new TokenDissociateTransaction()
          .setAccountId(operatorId)
          .setTokenIds([tokenId])
          .freezeWith(client)
          .sign(operatorKey);
        await (await dissociateTx.execute(client)).getReceipt(client);
        console.log("   ✅ Token disassociated successfully.");
      } catch (err) {
        console.log(`   ⚠️ Disassociation failed: ${err.message}`);
      }
    
  }
  
  // ── Run them one at a time ───────────────────────────────
  for (const tokenId of TOKENS) {
    await processToken(tokenId);
  }
  
  console.log("\n🎉 All tokens processed sequentially.");
  