require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Contract ABI (just the parts we need for this script)
const ABI = [
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "chainId",
        "type": "uint16"
      },
      {
        "internalType": "bool",
        "name": "enabled",
        "type": "bool"
      }
    ],
    "name": "setSupportedChain",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "name": "supportedChains",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Contract address
const CONTRACT_ADDRESS = "0x9316F9B4D24fB53deAca13B3D72CF5c1D151C45b"; // BaseCarbonBridge on Base

// Chain IDs to support
const CHAINS_TO_SUPPORT = [
  { id: 109, name: "Polygon Mainnet" },
  { id: 10109, name: "Polygon Amoy Testnet" },
  { id: 26, name: "Celo Mainnet" },
  { id: 44787, name: "Celo Alfajores Testnet" }
];

async function main() {
  try {
    // Connect to the provider
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
    
    // Load the wallet
    let wallet;
    if (process.env.PRIVATE_KEY) {
      wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    } else if (process.env.MNEMONIC) {
      // For ethers v6, we need to use HDNodeWallet.fromMnemonic
      const hdNode = ethers.HDNodeWallet.fromPhrase(process.env.MNEMONIC);
      wallet = hdNode.connect(provider);
    } else {
      throw new Error("No PRIVATE_KEY or MNEMONIC found in .env file");
    }
    
    console.log(`Connected with wallet address: ${wallet.address}`);
    
    // Connect to the contract
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
    
    // Check if wallet is the owner
    const owner = await contract.owner();
    console.log(`Contract owner: ${owner}`);
    console.log(`Current wallet: ${wallet.address}`);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.error("WARNING: Your wallet is not the owner of the contract. Transactions may fail.");
      
      // Ask for confirmation to continue
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        readline.question('Do you want to continue anyway? (y/n): ', resolve);
      });
      
      readline.close();
      
      if (answer.toLowerCase() !== 'y') {
        console.log("Aborting...");
        return;
      }
    }
    
    // Check current support status for each chain
    console.log("\nCurrent chain support status:");
    console.log("-----------------------------");
    
    for (const chain of CHAINS_TO_SUPPORT) {
      const isSupported = await contract.supportedChains(chain.id);
      console.log(`${chain.name} (ID: ${chain.id}): ${isSupported ? 'Supported' : 'Not supported'}`);
    }
    
    // Ask which chains to update
    console.log("\nUpdating chain support...");
    console.log("------------------------");
    
    for (const chain of CHAINS_TO_SUPPORT) {
      const isSupported = await contract.supportedChains(chain.id);
      
      if (!isSupported) {
        console.log(`Enabling support for ${chain.name} (ID: ${chain.id})...`);
        
        try {
          // Estimate gas for the transaction
          const gasEstimate = await contract.estimateGas.setSupportedChain(chain.id, true);
          
          // Send the transaction with a 20% gas buffer
          const tx = await contract.setSupportedChain(chain.id, true, {
            gasLimit: Math.floor(Number(gasEstimate) * 1.2) // 20% buffer
          });
          
          console.log(`Transaction sent: ${tx.hash}`);
          console.log('Waiting for confirmation...');
          
          // Wait for the transaction to be mined
          const receipt = await tx.wait();
          
          if (receipt.status === 1) {
            console.log(`✅ Successfully enabled support for ${chain.name} (ID: ${chain.id})`);
          } else {
            console.log(`❌ Failed to enable support for ${chain.name} (ID: ${chain.id})`);
          }
        } catch (error) {
          console.error(`Error enabling support for ${chain.name} (ID: ${chain.id}):`, error.message);
        }
      } else {
        console.log(`${chain.name} (ID: ${chain.id}) is already supported.`);
      }
    }
    
    // Check final support status
    console.log("\nFinal chain support status:");
    console.log("---------------------------");
    
    for (const chain of CHAINS_TO_SUPPORT) {
      const isSupported = await contract.supportedChains(chain.id);
      console.log(`${chain.name} (ID: ${chain.id}): ${isSupported ? 'Supported' : 'Not supported'}`);
    }
    
  } catch (error) {
    console.error("Error:", error.message);
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error("Your wallet doesn't have enough funds to execute this transaction.");
    }
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
