const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

async function main() {
  try {
    console.log("Transferring KlimaRetirementFacilitator ownership on Polygon Amoy...");
    
    // Contract address from deployment file
    const CONTRACT_ADDRESS = "0x7ee6edd5184a1d7eed3849699e35f13d4bde188f";
    
    // New owner address
    const NEW_OWNER = "0x5e48416C99204c14f82b56327B72657C68742796";
    
    // Connect to the provider
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
    
    // Create wallet from private key or mnemonic (must be the current owner)
    let wallet;
    if (process.env.PRIVATE_KEY_2) {
      wallet = new ethers.Wallet(process.env.PRIVATE_KEY_2, provider);
    } else if (process.env.MNEMONIC) {
      wallet = ethers.HDNodeWallet.fromPhrase(process.env.MNEMONIC, provider);
    } else {
      throw new Error("Either PRIVATE_KEY_2 or MNEMONIC environment variable must be set");
    }
    
    console.log(`Using wallet address for transaction: ${wallet.address}`);
    console.log(`Transferring ownership to: ${NEW_OWNER}`);
    
    // Load contract ABI from deployment file
    let contractAbi;
    try {
      // Try to load from deployment JSON file
      const deploymentPath = path.join(__dirname, '..', 'contracts', 'scripts', 'KlimaToPolygonDeployment.json');
      const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
      contractAbi = deploymentData.abi;
      console.log("Loaded ABI from deployment file");
    } catch (error) {
      // Fallback to OwnableUpgradeable ABI with just the transferOwnership function
      console.log("Using minimal ABI for ownership transfer");
      contractAbi = [
        "function owner() view returns (address)",
        "function transferOwnership(address newOwner)"
      ];
    }
    
    // Create contract instance
    const contract = new ethers.Contract(CONTRACT_ADDRESS, contractAbi, wallet);
    
    // Check current owner
    const currentOwner = await contract.owner();
    console.log(`Current contract owner: ${currentOwner}`);
    
    if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log("Error: The wallet you're using is not the current owner of the contract");
      return;
    }
    
    // Estimate gas for the transferOwnership transaction
    const gasEstimate = await contract.transferOwnership.estimateGas(NEW_OWNER);
    console.log(`Estimated gas: ${gasEstimate.toString()}`);
    
    // Add 20% buffer to gas estimate
    const gasLimit = BigInt(Math.floor(Number(gasEstimate) * 1.2));
    
    // Set gas price parameters for Polygon Amoy
    const maxFeePerGas = ethers.parseUnits("30", "gwei");
    const maxPriorityFeePerGas = ethers.parseUnits("25", "gwei");
    
    console.log("Transferring ownership...");
    const tx = await contract.transferOwnership(
      NEW_OWNER,
      {
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas
      }
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log("Waiting for transaction confirmation...");
    
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    
    // Verify the new owner
    const newOwner = await contract.owner();
    console.log(`New contract owner: ${newOwner}`);
    
    if (newOwner.toLowerCase() === NEW_OWNER.toLowerCase()) {
      console.log("Success: Ownership transferred successfully!");
    } else {
      console.log("Error: Ownership transfer failed!");
    }
    
  } catch (error) {
    console.log(`Error transferring ownership: ${error.message}`);
    console.log(`Error code: ${error.code}`);
    if (error.stack) {
      console.log(error.stack);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
