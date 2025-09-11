import { ethers } from 'ethers';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

// Debug: Normalize paths for comparison
const normalizePath = (path) => {
  return path
    .replace(/^file:\/\//, '') // Remove file:// protocol
    .replace(/\\/g, '/') // Convert backslashes to forward slashes
    .replace(/^\/+/, '') // Remove leading slashes
    .toLowerCase(); // Make case-insensitive
};

const importPath = normalizePath(import.meta.url);
const scriptPath = normalizePath(process.argv[1]);

async function initializePoolV3() {
  console.log("🏊‍♂️ Initializing ClearSky Liquidity Pool V3...\n");

  try {
    // Load deployment info
    let deploymentInfo;
    try {
      const deploymentData = fs.readFileSync('clearsky-pool-v3-deployment.json', 'utf8');
      deploymentInfo = JSON.parse(deploymentData);
      console.log(`📂 Loaded deployment info for pool at: ${deploymentInfo.contractAddress}`);
    } catch (error) {
      console.error("❌ Could not load deployment info. Please run deployPoolV3.js first.");
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
    console.log(`👤 Initializing with account: ${signer.address}`);
    console.log(`💰 Account balance: ${ethers.formatEther(await provider.getBalance(signer.address))} HBAR`);

    // Load contract ABI and connect to deployed contract
    const contractPath = './artifacts/contracts/ClearSkyLiquidityPoolV3.sol/ClearSkyLiquidityPoolV3.json';
    if (!fs.existsSync(contractPath)) {
      throw new Error("Contract artifacts not found. Run 'npx hardhat compile' first.");
    }
    
    const contractArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const { abi } = contractArtifact;
    
    const poolContract = new ethers.Contract(deploymentInfo.contractAddress, abi, signer);

    console.log(`🔗 Connected to pool contract at: ${deploymentInfo.contractAddress}`);

    // Check if pool is already initialized
    const [totalHBAR, totalLPTokens, totalValue] = await poolContract.getPoolInfo();
    if (totalLPTokens > 0) {
      console.log(`⚠️ Pool is already initialized!`);
      console.log(`   • Total HBAR: ${ethers.formatUnits(totalHBAR, 8)} HBAR`);
      console.log(`   • Total LP Tokens: ${ethers.formatUnits(totalLPTokens, 6)} CSLPV3`);
      console.log(`   • Total Value: ${ethers.formatUnits(totalValue, 8)} HBAR`);
      return;
    }

    // Get token info from contract
    const tokenInfo = await poolContract.getTokenInfo();
    const lpTokenAddress = await poolContract.lpToken();
    
    console.log(`\n🪙 Token Information:`);
    console.log(`   • Name: ${tokenInfo.name}`);
    console.log(`   • Symbol: ${tokenInfo.symbol}`);
    console.log(`   • Decimals: ${tokenInfo.decimals}`);
    console.log(`   • Address: ${lpTokenAddress}`);
    console.log(`   • Treasury: ${deploymentInfo.contractAddress} (Contract)`);
    console.log(`   • Supply Key: Contract-controlled (${deploymentInfo.contractAddress})`);

    // Initialize with 10 HBAR
    const initAmount = ethers.parseUnits("10", 18); // 10 HBAR (ethers uses 18 decimals internally)
    console.log(`\n💧 Initializing pool with ${ethers.formatEther(initAmount)} HBAR...`);

    // Call initializePool
    console.log(`📝 Calling initializePool()...`);
    const tx = await poolContract.initializePool({ 
      value: initAmount,
      gasLimit: 3000000 // Set higher gas limit for HTS operations
    });

    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

    // Parse events from the transaction receipt
    console.log(`\n📋 Transaction Events:`);
    let liquidityAdded = false;
    let htsMintSuccess = false;
    let lpTokensMinted = ethers.toBigInt(0);

    for (const log of receipt.logs) {
      try {
        const parsedLog = poolContract.interface.parseLog({
          topics: log.topics,
          data: log.data
        });

        if (parsedLog) {
          console.log(`   🎯 ${parsedLog.name}:`);
          
          switch (parsedLog.name) {
            case 'TokenCreated':
              console.log(`      • Token Address: ${parsedLog.args.tokenAddress}`);
              console.log(`      • Name: ${parsedLog.args.name}`);
              console.log(`      • Symbol: ${parsedLog.args.symbol}`);
              console.log(`      • Decimals: ${parsedLog.args.decimals}`);
              console.log(`      • Treasury: ${parsedLog.args.treasury}`);
              break;
              
            case 'LiquidityAdded':
              console.log(`      • User: ${parsedLog.args.user}`);
              console.log(`      • HBAR Amount: ${ethers.formatUnits(parsedLog.args.hbarAmount, 8)} HBAR`);
              console.log(`      • LP Tokens Minted: ${ethers.formatUnits(parsedLog.args.lpTokensMinted, 6)} CSLPV3`);
              console.log(`      • Timestamp: ${new Date(Number(parsedLog.args.timestamp) * 1000).toISOString()}`);
              liquidityAdded = true;
              lpTokensMinted = parsedLog.args.lpTokensMinted;
              break;

            case 'HTSMintAttempt':
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(`      • Amount: ${parsedLog.args.amount.toString()}`);
              break;

            case 'HTSMintSuccess':
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(`      • Amount: ${parsedLog.args.amount.toString()}`);
              console.log(`      • New Total Supply: ${parsedLog.args.newTotalSupply.toString()}`);
              htsMintSuccess = true;
              break;

            case 'HTSMintFailed':
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(`      • Amount: ${parsedLog.args.amount.toString()}`);
              console.log(`      • Response Code: ${parsedLog.args.responseCode}`);
              break;

            default:
              console.log(`      • Args:`, parsedLog.args);
          }
        }
      } catch (e) {
        // Skip logs that can't be parsed by our contract interface
        continue;
      }
    }

    // Verify pool state after initialization
    console.log(`\n🔍 Verifying pool state...`);
    const [newTotalHBAR, newTotalLPTokens, newTotalValue] = await poolContract.getPoolInfo();
    
    console.log(`📊 Pool State After Initialization:`);
    console.log(`   • Total HBAR: ${ethers.formatUnits(newTotalHBAR, 8)} HBAR`);
    console.log(`   • Total LP Tokens: ${ethers.formatUnits(newTotalLPTokens, 6)} CSLPV3`);
    console.log(`   • Total Value: ${ethers.formatUnits(newTotalValue, 8)} HBAR`);

    // Calculate value per LP token
    const valuePerLPToken = await poolContract.getValuePerLPToken();
    console.log(`   • Value per LP Token: ${ethers.formatUnits(valuePerLPToken, 8)} HBAR`);

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    const finalBalance = await provider.getBalance(signer.address);
    console.log(`   • Your HBAR Balance: ${ethers.formatEther(finalBalance)} HBAR`);
    console.log(`   • Your LP Balance: ${ethers.formatUnits(lpTokensMinted, 6)} CSLPV3 (minted to contract treasury)`);

    // Update deployment info with initialization data
    deploymentInfo.poolConfig.totalHBAR = newTotalHBAR.toString();
    deploymentInfo.poolConfig.totalLPTokens = newTotalLPTokens.toString();
    deploymentInfo.poolConfig.totalValue = newTotalValue.toString();
    deploymentInfo.poolConfig.initialized = true;
    deploymentInfo.poolConfig.initializedAt = new Date().toISOString();
    deploymentInfo.poolConfig.initializedBy = signer.address;
    deploymentInfo.poolConfig.initializationTx = tx.hash;

    // Save updated deployment info
    fs.writeFileSync('clearsky-pool-v3-deployment.json', JSON.stringify(deploymentInfo, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value, 2));
    console.log(`💾 Updated deployment info saved`);

    console.log(`\n🎉 Pool V3 Initialization Complete!`);
    console.log(`✅ Liquidity Added: ${liquidityAdded}`);
    console.log(`✅ HTS Mint Success: ${htsMintSuccess}`);
    console.log(`🏊‍♂️ Pool is ready for users to add liquidity!`);

    console.log(`\n📋 Next Steps:`);
    console.log(`1. Test adding liquidity: node testPoolV3.js`);
    console.log(`2. Check token balances: node debugTokenV3.js`);

    return {
      success: true,
      txHash: tx.hash,
      poolState: {
        totalHBAR: newTotalHBAR,
        totalLPTokens: newTotalLPTokens,
        totalValue: newTotalValue,
        valuePerLPToken: valuePerLPToken
      }
    };

  } catch (error) {
    console.error(`❌ Pool initialization failed:`, error);
    throw error;
  }
}

// Main execution
if (importPath === scriptPath) {
  initializePoolV3()
    .then((result) => {
      console.log(`\n🎉 Pool V3 initialized successfully!`);
      console.log(`📄 Transaction: ${result.txHash}`);
    })
    .catch((error) => {
      console.error("Initialization failed:", error);
      process.exit(1);
    });
}

export { initializePoolV3 };
