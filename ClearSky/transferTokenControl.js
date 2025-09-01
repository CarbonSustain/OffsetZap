import { transferTokenControl } from './createClearSkyLPToken.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function transferControl() {
  try {
    console.log("🔄 Transferring LP Token Control to Pool Contract...");
    
    // Load token info
    const tokenInfo = JSON.parse(fs.readFileSync('clearsky-lp-token.json', 'utf8'));
    console.log("📋 LP Token Info Loaded:");
    console.log(`   Token ID: ${tokenInfo.tokenId}`);
    console.log(`   Token Name: ${tokenInfo.tokenName}`);
    console.log(`   Token Symbol: ${tokenInfo.tokenSymbol}`);
    
    // Load deployment info
    const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));
    console.log("📋 Pool Deployment Info Loaded:");
    console.log(`   Pool Address: ${deploymentInfo.poolAddress}`);
    console.log(`   Network: ${deploymentInfo.network}`);
    
    console.log("\n🔑 Transferring Supply Key Control...");
    console.log(`   From: Your Account`);
    console.log(`   To: Pool Contract (${deploymentInfo.poolAddress})`);
    
    // Transfer control
    await transferTokenControl(
      tokenInfo.tokenId,
      tokenInfo.supplyKey,
      tokenInfo.adminKey,
      deploymentInfo.poolAddress
    );
    
    console.log("\n✅ Token Control Transfer Completed Successfully!");
    console.log("\n📋 Summary:");
    console.log(`   • LP Token: ${tokenInfo.tokenId} (${tokenInfo.tokenSymbol})`);
    console.log(`   • Pool Contract: ${deploymentInfo.poolAddress}`);
    console.log(`   • Supply Key Control: Transferred to Pool`);
    console.log(`   • Admin Key Control: Still with Your Account`);
    
    console.log("\n🎯 Next Steps:");
    console.log("   1. Test the pool functionality");
    console.log("   2. Add initial liquidity");
    console.log("   3. Verify LP token minting/burning works");
    
    return true;
    
  } catch (error) {
    console.error("❌ Token Control Transfer Failed:", error);
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
  transferControl()
    .then(() => {
      console.log("\n🎉 ClearSky LP Token Control Transfer Completed!");
      console.log("Pool is now ready to mint and burn LP tokens!");
    })
    .catch((error) => {
      console.error("Failed to transfer token control:", error);
      process.exit(1);
    });
} else {
  console.log("❌ Condition is FALSE - File imported as module, not running main execution");
  console.log("💡 This file is being imported, not run directly");
}

export { transferControl }; 