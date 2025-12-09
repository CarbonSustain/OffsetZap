import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenUpdateTransaction,
  TokenId,
  Hbar,
  TokenType,
  TokenSupplyType,
  ContractId,
  AccountAllowanceApproveTransaction,
} from "@hashgraph/sdk";
import dotenv from "dotenv";

dotenv.config();

async function main(tokenName, tokenSymbol) {
  const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
  const operatorKey = PrivateKey.fromStringDer(process.env.OPERATOR_KEY);
  const network = process.env.NETWORK || "testnet";

  // Get factory contract ID from deployment file
  const fs = await import("fs");
  const deploymentPath = "./clearsky-factory-deployment.json";
  const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const factoryEvmAddress = deploymentData.factory.contractAddress;

  // Convert EVM address to Account ID
  const client =
    network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, operatorKey);

  const { AccountInfoQuery, } = await import("@hashgraph/sdk");
  const factoryInfo = await new AccountInfoQuery()
    .setAccountId(factoryEvmAddress)
    .execute(client);
  const factoryContractId = factoryInfo.accountId;

  console.log(`🏭 Factory EVM Address: ${factoryEvmAddress}`);
  console.log(`🏭 Factory Account ID: ${factoryContractId.toString()}`);

  // STEP 1: Create token with factory as treasury
  const tokenTx = await new TokenCreateTransaction()
    .setTokenName(tokenName)
    .setTokenSymbol(tokenSymbol)
    .setTokenType(TokenType.FungibleCommon)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(operatorId) 
    .setAdminKey(operatorKey.publicKey) // ✅ allows future updates
    .setSupplyKey(operatorKey.publicKey) // ✅ gives it an initial supply key
    //.setSupplyKey(contractInfo.adminKey)
    .setInitialSupply(0)
    .setDecimals(6)
    .setTransactionMemo("CSLP token with Factory as treasury")
    .setMaxTransactionFee(new Hbar(10))
    .freezeWith(client)
    .sign(operatorKey);

  console.log("📤 Creating CSLP token...");
  const submitTx = await tokenTx.execute(client);
  const receipt = await submitTx.getReceipt(client);
  const tokenId = receipt.tokenId;
  console.log(`✅ Token created: ${tokenId.toString()}`);
  console.log(
    `🔗 HashScan: https://hashscan.io/${network}/token/${tokenId.toString()}`
  );

  // STEP 2: Update supply key (Factory controls mint/burn)
  console.log(`\n🔄 Setting Factory as supply key...`);

  // Get the factory contract's public key
  const { ContractInfoQuery, ContractId } = await import("@hashgraph/sdk");
  const factoryContractIdObj = ContractId.fromEvmAddress(
    0,
    0,
    factoryEvmAddress
  );
  const contractInfo = await new ContractInfoQuery()
    .setContractId(factoryContractIdObj)
    .execute(client);

  const updateTx = await new TokenUpdateTransaction()
    .setTokenId(TokenId.fromString(tokenId))
    .setSupplyKey(contractInfo.adminKey) // Use contract's admin key as supply key
    .setTransactionMemo("Set Factory as supply key")
    .setMaxTransactionFee(new Hbar(5))
    .freezeWith(client)
    .sign(operatorKey);

  const updateSubmit = await updateTx.execute(client);
  const updateReceipt = await updateSubmit.getReceipt(client);

  if (updateReceipt.status.toString() === "SUCCESS") {
    console.log(
      `✅ Supply key successfully set to Factory: ${factoryContractId}`
    );
    console.log(
      `🔗 Verify token keys: https://hashscan.io/${network}/token/${tokenId.toString()}`
    );
  } else {
    console.log(`❌ Update failed with status: ${updateReceipt.status}`);
  }

  // STEP 3: Approve factory to transfer tokens from treasury (owner account)
  console.log(`\n🪪 Approving Factory to transfer CSLP tokens from treasury...`);

  const { Long } = await import("@hashgraph/sdk");
  const approveTx = await new AccountAllowanceApproveTransaction()
    .approveTokenAllowance(
      tokenId, // token to approve
      operatorId, // owner (treasury)
      factoryContractId, // spender (factory)
      Long.MAX_VALUE // unlimited allowance
    )
    .setTransactionMemo("Approve Factory to transfer CSLP tokens")
    .setMaxTransactionFee(new Hbar(50))
    .freezeWith(client)
    .sign(operatorKey);

  const approveSubmit = await approveTx.execute(client);
  const approveReceipt = await approveSubmit.getReceipt(client);

  if (approveReceipt.status.toString() === "SUCCESS") {
    console.log(
      `✅ Factory successfully approved to transfer tokens from treasury`
    );
    console.log(`🔗 Treasury: ${operatorId.toString()}`);
    console.log(`🔗 Factory: ${factoryContractId.toString()}`);
  } else {
    console.log(`❌ Approval failed with status: ${approveReceipt.status}`);
  }

  await client.close();
  console.log("👋 Client closed. Exiting cleanly.");

  // Convert Hedera Token ID to EVM address format
  const tokenEvmAddress = tokenId.toSolidityAddress();

  return {
    success: true,
    tokenId: tokenId.toString(),
    tokenEvmAddress: tokenEvmAddress,
    tokenName: tokenName,
    tokenSymbol: tokenSymbol,
  };
}

// Check if called directly or as module
if (import.meta.url === `file://${process.argv[1]}`) {
  // Called directly - use command line args
  const tokenName = process.argv[2] || "TestCSLP";
  const tokenSymbol = process.argv[3] || "FCSLP";

  main(tokenName, tokenSymbol)
    .then((result) => {
      console.log("✅ Result:", JSON.stringify(result));
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

export { main };
