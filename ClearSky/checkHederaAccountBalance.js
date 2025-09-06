import { Client, AccountBalanceQuery, AccountId } from "@hashgraph/sdk";
import dotenv from 'dotenv';

dotenv.config();

async function checkHederaAccountBalance() {
  try {
    console.log("🔍 Checking Hedera Account Balance Using SDK...");
    
    // Load your operator credentials
    const operatorId = process.env.OPERATOR_ID;
    const operatorKey = process.env.OPERATOR_KEY;
    
    if (!operatorId || !operatorKey) {
      throw new Error("Missing OPERATOR_ID or OPERATOR_KEY in .env file");
    }
    
    // Initialize Hedera client
    const client = Client.forTestnet().setOperator(operatorId, operatorKey);
    
    // Your wallet address (convert from EVM to Hedera account ID)
    const walletAddress = "0x39f38eabff2fCcC01F6Da3502838d1c21acE46B8";
    
    console.log(`Wallet EVM Address: ${walletAddress}`);
    console.log(`Operator Account: ${operatorId}`);
    
    // For now, let's check the operator account balance
    // (You'll need to convert your EVM address to Hedera account ID)
    console.log("\n💰 Checking Operator Account Balance...");
    
    const operatorBalance = await new AccountBalanceQuery()
      .setAccountId(operatorId)
      .execute(client);
    
    console.log(`HBAR Balance: ${operatorBalance.hbars.toString()} HBAR`);
    console.log('full balance: ', operatorBalance);
    
        // Check if there are any tokens
        if (operatorBalance.tokens && operatorBalance.tokens.size > 0) {
          console.log("\n🪙 Token Balances:");
          for (const [tokenId, balance] of operatorBalance.tokens) {
            const decimals = operatorBalance.tokenDecimals.get(tokenId) || 0;
            const formattedBalance = (balance.toNumber() / Math.pow(10, decimals)).toFixed(decimals);
            console.log(`Token ${tokenId}: ${formattedBalance} (raw: ${balance.toString()})`);
          }
        } else {
          console.log("\n�� No tokens found in operator account");
        }
    
    // Now let's try to check your wallet account
    // We need to convert the EVM address to a Hedera account ID
    console.log("\n🔍 Attempting to check wallet account...");
    console.log("Note: EVM addresses need to be converted to Hedera account IDs");
    
    // For demonstration, let's try to find the account
    // You might need to check if this account exists on Hedera
    
    client.close();
    
    console.log("\n💡 To check your specific wallet, you need:");
    console.log("1. The Hedera account ID (not EVM address)");
    console.log("2. Or convert your EVM address to Hedera account ID");
    
    return operatorBalance;
    
  } catch (error) {
    console.error("❌ Error checking Hedera account balance:", error);
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
  checkHederaAccountBalance()
    .then((balance) => {
      console.log("\n🎉 Hedera Account Balance Check Completed!");
      console.log("Check the output above for your account details");
    })
    .catch((error) => {
      console.error("Failed to check Hedera account balance:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { checkHederaAccountBalance }; 