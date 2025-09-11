import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function associateTokenV3() {
  console.log("🔗 Associating user with LP Token V3...\n");

  try {
    // Load deployment info
    let deploymentInfo;
    try {
      const deploymentData = fs.readFileSync('clearsky-pool-v3-deployment.json', 'utf8');
      deploymentInfo = JSON.parse(deploymentData);
      console.log(`📂 Pool contract: ${deploymentInfo.contractAddress}`);
    } catch (error) {
      console.error("❌ Could not load deployment info. Please run deployPoolV3.js first.");
      throw error;
    }

    // Load token info
    let tokenInfo;
    try {
      const tokenData = fs.readFileSync('clearsky-lp-token-v3.json', 'utf8');
      tokenInfo = JSON.parse(tokenData);
      console.log(`📂 LP Token: ${tokenInfo.tokenAddress}`);
    } catch (error) {
      console.error("❌ Could not load token info.");
      throw error;
    }

    // Setup provider and wallet
    const network = process.env.NETWORK || 'testnet';
    let rpcUrl;
    
    if (network === 'mainnet') {
      rpcUrl = process.env.HEDERA_MAINNET_RPC_URL;
    } else {
      rpcUrl = process.env.HEDERA_TESTNET_RPC_URL;
    }
    
    if (!rpcUrl) {
      throw new Error(`Missing ${network.toUpperCase()}_RPC_URL in .env file`);
    }
    
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null
    });
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }
    
    const signer = new ethers.Wallet(privateKey, provider);
    console.log(`👤 Associating account: ${signer.address}`);
    console.log(`💰 Account balance: ${ethers.formatEther(await provider.getBalance(signer.address))} HBAR`);

    // Load HTS contract interface
    const htsABI = [
      "function associateToken(address account, address token) external returns (int64 responseCode)"
    ];
    
    const htsContract = new ethers.Contract(
      "0x0000000000000000000000000000000000000167", // HTS precompile address
      htsABI,
      signer
    );

    console.log(`\n🔗 Associating ${signer.address} with token ${tokenInfo.tokenAddress}...`);

    // Call associateToken directly
    const associateTx = await htsContract.associateToken(
      signer.address, // account to associate
      tokenInfo.tokenAddress, // token to associate with
      {
        gasLimit: 1000000 // Gas limit for association
      }
    );

    console.log(`⏳ Association transaction submitted: ${associateTx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);

    const receipt = await associateTx.wait();
    console.log(`✅ Association confirmed in block ${receipt.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

    // Check if successful
    if (receipt.status === 1) {
      console.log(`\n🎉 Token association successful!`);
      console.log(`✅ Account ${signer.address} is now associated with token ${tokenInfo.tokenAddress}`);
      console.log(`🔄 You can now call addLiquidity without association errors!`);
    } else {
      console.log(`\n❌ Token association failed`);
      console.log(`📄 Check transaction: ${associateTx.hash}`);
    }

    return {
      success: receipt.status === 1,
      txHash: associateTx.hash
    };

  } catch (error) {
    console.error(`❌ Token association failed:`, error);
    
    // Check if it's already associated
    if (error.message.includes("TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT")) {
      console.log(`\n✅ Token is already associated with your account!`);
      console.log(`🔄 You can proceed with addLiquidity`);
      return { success: true, alreadyAssociated: true };
    }
    
    throw error;
  }
}

// Main execution
associateTokenV3()
  .then((result) => {
    if (result.success) {
      console.log(`\n🎉 Association completed successfully!`);
      if (result.alreadyAssociated) {
        console.log(`📝 Token was already associated`);
      } else {
        console.log(`📄 Transaction: ${result.txHash}`);
      }
      console.log(`\n📋 Next Step:`);
      console.log(`   Run: node testPoolV2.js`);
    } else {
      console.log(`\n❌ Association failed`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error("Association failed:", error);
    process.exit(1);
  });

export { associateTokenV3 };
