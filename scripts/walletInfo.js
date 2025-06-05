// scripts/walletInfo.js
require("dotenv").config();
const { ethers } = require("ethers");

// ERC-20 Token ABI (minimal for balance checking)
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Network configurations
const networks = {
  "Base Sepolia": {
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    chainId: 84532,
    explorer: "https://sepolia.basescan.org/address/",
    nativeCurrency: "ETH",
    tokens: [
      {
        name: "USDC",
        address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      }
    ]
  },
  "Polygon AMOY": {
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-amoy.infura.io/v3/591c10e615c04ad5a783c9d6b44f0853",
    chainId: 80002,
    explorer: "https://amoy.polygonscan.com/address/",
    nativeCurrency: "ETH",
    tokens: [
      {
        name: "POL",
        address: "0x4e7f624C9f2dbc3bcf97D03E765142Dd46fe1C46"
      }
    ]
  },
  "Celo Alfajores": {
    rpcUrl: process.env.CELO_ALFAJORES_RPC_URL || "https://alfajores-forno.celo-testnet.org",
    chainId: 44787,
    explorer: "https://alfajores.celoscan.io/address/",
    nativeCurrency: "CELO",
    tokens: []
  }
};

async function main() {
  console.log("🔍 OffsetZap Wallet Information");
  console.log("==============================\n");

  // Get wallet from mnemonic or private key
  let wallet;
  
  if (process.env.MNEMONIC) {
    try {
      wallet = ethers.HDNodeWallet.fromPhrase(process.env.MNEMONIC);
      console.log("✅ Wallet derived from mnemonic");
    } catch (err) {
      console.error("❌ Error deriving wallet from mnemonic:", err.message);
    }
  } else if (process.env.PRIVATE_KEY) {
    try {
      // Remove 0x prefix if present
      const privateKey = process.env.PRIVATE_KEY.startsWith("0x") 
        ? process.env.PRIVATE_KEY 
        : `0x${process.env.PRIVATE_KEY}`;
      
      wallet = new ethers.Wallet(privateKey);
      console.log("✅ Wallet derived from private key");
    } catch (err) {
      console.error("❌ Error deriving wallet from private key:", err.message);
      process.exit(1);
    }
  } else {
    console.error("❌ Neither MNEMONIC nor PRIVATE_KEY found in environment variables");
    process.exit(1);
  }

  // Display wallet address
  console.log(`\n📬 Wallet Address: ${wallet.address}`);
  
  // Check balances across networks
  console.log("\n💰 Balances:");
  console.log("------------");
  
  for (const [networkName, networkConfig] of Object.entries(networks)) {
    try {
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      
      // Check native token balance (ETH or equivalent)
      const balance = await provider.getBalance(wallet.address);
      const balanceInEth = ethers.formatEther(balance);
      
      console.log(`${networkName}:`);
      console.log(`- Native token: ${balanceInEth} ETH`);
      
      // Check if balance is low
      if (parseFloat(balanceInEth) < 0.01) {
        console.log(`⚠️  Low balance warning for ${networkName}`);
      }
      
      // Check ERC-20 token balances if any are configured
      if (networkConfig.tokens && networkConfig.tokens.length > 0) {
        for (const token of networkConfig.tokens) {
          try {
            // Special case for POL on Polygon Amoy
            if (token.name === "POL" && networkName === "Polygon AMOY") {
              // For POL on Amoy, we can check the balance directly since it's the native token
              console.log(`- ${token.name}: ${balanceInEth} POL`);
              continue;
            }
            
            const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
            const tokenBalance = await tokenContract.balanceOf(wallet.address);
            const decimals = await tokenContract.decimals();
            const symbol = await tokenContract.symbol();
            const formattedBalance = ethers.formatUnits(tokenBalance, decimals);
            
            console.log(`- ${token.name}: ${formattedBalance} ${symbol}`);
          } catch (tokenError) {
            console.log(`- ${token.name}: Error fetching balance - ${tokenError.message}`);
          }
        }
      }
      
      console.log(`Explorer: ${networkConfig.explorer}${wallet.address}`);
      console.log(""); // Empty line for readability
    } catch (error) {
      console.log(`${networkName}: Error fetching balance - ${error.message}\n`);
    }
  }

  // Display gas prices for each network
  console.log("\n⛽ Current Gas Prices:");
  console.log("--------------------");
  
  for (const [networkName, networkConfig] of Object.entries(networks)) {
    try {
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const feeData = await provider.getFeeData();
      
      // Format gas price to gwei
      const gasPriceGwei = ethers.formatUnits(feeData.gasPrice || 0, "gwei");
      
      console.log(`${networkName}:`);
      console.log(`- Gas Price: ${gasPriceGwei} gwei`);
      console.log(""); // Empty line for readability
    } catch (error) {
      console.log(`${networkName}: Error fetching gas prices - ${error.message}\n`);
    }
  }

  console.log("✅ Wallet information check complete");
}

// Execute the script
main().catch((error) => {
  console.error("Error in main function:", error);
  process.exit(1);
});
