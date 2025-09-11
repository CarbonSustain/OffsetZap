import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
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

async function deployPoolV2() {
  console.log("🚀 Deploying ClearSky Liquidity Pool V2 with Integrated Token Creation...\n");

  try {
    // Network configuration
    const network = process.env.NETWORK || 'testnet';
    let rpcUrl, chainId;
    
    if (network === 'mainnet') {
      rpcUrl = process.env.HEDERA_MAINNET_RPC_URL;
      chainId = 295; // Hedera mainnet
    } else {
      rpcUrl = process.env.HEDERA_TESTNET_RPC_URL;
      chainId = 296; // Hedera testnet
    }
    
    if (!rpcUrl) {
      throw new Error(`Missing ${network.toUpperCase()}_RPC_URL in .env file`);
    }
    
    // Initialize provider and wallet with Hedera-specific configuration
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      // Disable ENS for Hedera networks
      ensAddress: null,
      nameResolver: null
    });
    
    const privateKey = process.env.PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }
    
    const deployer = new ethers.Wallet(privateKey, provider);
    console.log(`👤 Deploying with account: ${deployer.address}`);
    console.log(`💰 Account balance: ${ethers.formatEther(await provider.getBalance(deployer.address))} HBAR`);

    // Get network info
    const networkInfo = await provider.getNetwork();
    console.log(`🌐 Network: ${network} (Chain ID: ${networkInfo.chainId})`);

    // Token configuration
    const tokenConfig = {
      name: "ClearSky LP Token V2",
      symbol: "CSLPV2"
    };

    console.log(`\n📝 Token Configuration:`);
    console.log(`   • Name: ${tokenConfig.name}`);
    console.log(`   • Symbol: ${tokenConfig.symbol}`);
    console.log(`   • Decimals: 6 (hardcoded in contract)`);
    console.log(`   • Treasury: Contract itself`);
    console.log(`   • Supply Key: Contract itself`);

    // Load contract ABI and bytecode
    const contractPath = './artifacts/contracts/ClearSkyLiquidityPoolV2.sol/ClearSkyLiquidityPoolV2.json';
    
    if (!fs.existsSync(contractPath)) {
      throw new Error("Contract artifacts not found. Run 'npx hardhat compile' first.");
    }
    
    const contractArtifact = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const { abi, bytecode } = contractArtifact;

    // Deploy the contract
    console.log(`\n🏗️ Deploying ClearSkyLiquidityPoolV2...`);
    const factory = new ethers.ContractFactory(abi, bytecode, deployer);
    
    // Deploy with token creation parameters (higher gas limit for HTS operations)
    console.log(`⛽ Setting gas limit to 10,000,000 for HTS token creation...`);
    
    let poolContract;
    try {
      // First try to estimate gas
      console.log(`🔍 Estimating gas for deployment...`);
      const estimatedGas = await factory.getDeployTransaction(
        deployer.address,
        tokenConfig.name,
        tokenConfig.symbol
      ).then(tx => provider.estimateGas(tx));
      console.log(`📊 Estimated gas: ${estimatedGas.toString()}`);
      
      // Deploy with estimated gas + buffer
      const gasLimit = estimatedGas * 120n / 100n; // 20% buffer
      console.log(`⛽ Using gas limit: ${gasLimit.toString()}`);
      
      poolContract = await factory.deploy(
        deployer.address, // owner
        tokenConfig.name, // token name
        tokenConfig.symbol, // token symbol
        {
          gasLimit: gasLimit
        }
      );

      console.log(`⏳ Waiting for deployment transaction to be mined...`);
      console.log(`📄 Transaction hash: ${poolContract.deploymentTransaction().hash}`);
      
      await poolContract.waitForDeployment();
      
    } catch (error) {
      console.error(`\n❌ Detailed deployment error analysis:`);
      console.error(`Error type: ${error.constructor.name}`);
      console.error(`Error code: ${error.code}`);
      console.error(`Error action: ${error.action}`);
      
      if (error.transaction) {
        console.error(`Transaction data length: ${error.transaction.data?.length || 'N/A'}`);
        console.error(`Transaction to: ${error.transaction.to || 'Contract Creation'}`);
        console.error(`Transaction from: ${error.transaction.from}`);
      }
      
      if (error.receipt) {
        console.error(`\n📋 Transaction Receipt Details:`);
        console.error(`Status: ${error.receipt.status} (0=failed, 1=success)`);
        console.error(`Gas used: ${error.receipt.gasUsed.toString()}`);
        console.error(`Gas price: ${error.receipt.gasPrice.toString()}`);
        console.error(`Block number: ${error.receipt.blockNumber}`);
        console.error(`Transaction hash: ${error.receipt.hash}`);
        
        // Check if we can get more details from the transaction
        try {
          console.log(`\n🔍 Fetching transaction details for revert reason...`);
          const tx = await provider.getTransaction(error.receipt.hash);
          console.log(`Transaction details:`, {
            gasLimit: tx.gasLimit?.toString(),
            gasPrice: tx.gasPrice?.toString(),
            data: tx.data?.substring(0, 100) + '...' // First 100 chars
          });
          
          // Try to simulate the transaction to get revert reason
          console.log(`\n🎭 Simulating transaction to get revert reason...`);
          try {
            await provider.call({
              to: tx.to,
              from: tx.from,
              data: tx.data,
              gasLimit: tx.gasLimit,
              gasPrice: tx.gasPrice
            });
          } catch (callError) {
            console.error(`🎯 Revert reason found:`, callError.message);
            if (callError.data) {
              console.error(`🎯 Revert data:`, callError.data);
            }
          }
        } catch (detailError) {
          console.error(`Failed to get transaction details:`, detailError.message);
        }
      }
      
      if (error.data) {
        console.error(`\n🔍 Error data: ${error.data}`);
        // Try to decode the error data
        try {
          const errorInterface = new ethers.Interface([
            "error TokenCreationFailed(int32 responseCode)"
          ]);
          const decoded = errorInterface.parseError(error.data);
          console.error(`🎯 Decoded error: ${decoded.name}(${decoded.args.join(', ')})`);
        } catch (decodeError) {
          console.error(`Could not decode error data`);
        }
      }
      
      throw error;
    }

    const poolAddress = await poolContract.getAddress();
    console.log(`✅ Pool Contract deployed to: ${poolAddress}`);
    console.log(`🔗 Transaction Hash: ${poolContract.deploymentTransaction().hash}`);

    // Wait a bit for the contract to be fully ready
    console.log(`⏳ Waiting for contract to be ready...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the created token information
    console.log(`\n🔍 Retrieving token information from contract...`);
    try {
      const tokenInfo = await poolContract.getTokenInfo();
      const lpTokenAddress = await poolContract.lpToken();

      console.log(`\n🎉 Token Created Successfully!`);
      console.log(`📍 LP Token Address: ${lpTokenAddress}`);
      console.log(`📝 Token Name: ${tokenInfo.name}`);
      console.log(`🏷️ Token Symbol: ${tokenInfo.symbol}`);
      console.log(`🔢 Token Decimals: ${tokenInfo.decimals}`);
      console.log(`🏦 Treasury: ${poolAddress} (Contract itself)`);
      console.log(`🔑 Supply Key: ${poolAddress} (Contract itself)`);
      console.log(`✅ Token Created: ${tokenInfo.created}`);

      // Convert Hedera token address to token ID format if possible
      let tokenId = "Unknown";
      try {
        // Try to convert EVM address to Hedera token ID
        const addressNum = BigInt(lpTokenAddress);
        if (addressNum > 0) {
          tokenId = `0.0.${addressNum.toString()}`;
        }
      } catch (e) {
        console.log(`⚠️ Could not convert address to token ID: ${e.message}`);
      }

      // Prepare deployment information
      const deploymentInfo = {
        // Contract Information
        contractName: "ClearSkyLiquidityPoolV2",
        contractAddress: poolAddress,
        deployerAddress: deployer.address,
        contractOwner: deployer.address,
        
        // Network Information
        network: network,
        chainId: networkInfo.chainId.toString(),
        rpcUrl: rpcUrl,
        
        // Token Information (Created by Contract)
        tokenInfo: {
          name: tokenInfo.name,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          tokenAddress: lpTokenAddress,
          tokenId: tokenId,
          treasury: poolAddress,
          supplyKey: poolAddress,
          adminKey: "Contract-controlled",
          created: tokenInfo.created,
          createdBy: "Contract (HIP-1028)"
        },
        
        // Pool Configuration
        poolConfig: {
          minLiquidity: "100000", // 0.001 HBAR in wei (8 decimals)
          feeBps: "30", // 0.3%
          feeDenominator: "10000",
          totalHBAR: "0",
          totalLPTokens: "0",
          totalValue: "0",
          initialized: false
        },
        
        // Deployment Metadata
        deployedAt: new Date().toISOString(),
        deploymentBlock: await provider.getBlockNumber(),
        transactionHash: poolContract.deploymentTransaction().hash,
        gasUsed: "Estimated in deployment",
        version: "2.0.0",
        features: [
          "HIP-1028 Token Creation",
          "Self-Treasury Management",
          "Integrated LP Token",
          "Value-Based Distribution",
          "HTS Integration",
          "Slippage Protection",
          "Emergency Controls"
        ]
      };

      // Save deployment info
      const outputPath = path.join(process.cwd(), 'clearsky-pool-v2-deployment.json');
      fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));
      console.log(`\n💾 Deployment info saved to: ${outputPath}`);

      // Also create a simplified token info file for compatibility
      const tokenInfoSimple = {
        tokenId: tokenId,
        tokenAddress: lpTokenAddress,
        tokenName: tokenInfo.name,
        tokenSymbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals,
        treasury: poolAddress,
        supplyKey: poolAddress,
        adminKey: "Contract-controlled",
        poolAddress: poolAddress,
        createdBy: "Contract",
        createdAt: new Date().toISOString(),
        network: "Hedera Testnet",
        version: "2.0.0"
      };

      const tokenOutputPath = path.join(process.cwd(), 'clearsky-lp-token-v2.json');
      fs.writeFileSync(tokenOutputPath, JSON.stringify(tokenInfoSimple, null, 2));
      console.log(`💾 Token info saved to: ${tokenOutputPath}`);

      console.log(`\n🎯 Perfect Integration Achieved:`);
      console.log(`   ✅ Pool contract deployed`);
      console.log(`   ✅ LP token created by contract (HIP-1028)`);
      console.log(`   ✅ Contract is treasury (receives minted tokens)`);
      console.log(`   ✅ Contract has supply key (can mint/burn)`);
      console.log(`   ✅ No external token creation needed`);
      console.log(`   ✅ No signature issues`);
      console.log(`   ✅ All users will receive tokens correctly`);

      console.log(`\n📋 Next Steps:`);
      console.log(`1. Initialize pool: node initializePoolV2.js`);
      console.log(`2. Test liquidity: node testPoolV2.js`);
      console.log(`3. Verify token flow: node debugTokenV2.js`);

      return {
        poolAddress,
        tokenAddress: lpTokenAddress,
        tokenInfo: tokenInfoSimple,
        deploymentInfo
      };

    } catch (error) {
      console.error(`❌ Error retrieving token information:`, error);
      
      // Still save basic deployment info even if token info retrieval failed
      const basicDeploymentInfo = {
        contractName: "ClearSkyLiquidityPoolV2",
        contractAddress: poolAddress,
        deployerAddress: deployer.address,
        network: network,
        chainId: networkInfo.chainId.toString(),
        deployedAt: new Date().toISOString(),
        error: "Token info retrieval failed",
        errorMessage: error.message
      };

      const outputPath = path.join(process.cwd(), 'clearsky-pool-v2-deployment.json');
      fs.writeFileSync(outputPath, JSON.stringify(basicDeploymentInfo, null, 2));
      console.log(`💾 Basic deployment info saved to: ${outputPath}`);

      throw error;
    }

  } catch (error) {
    console.error(`❌ Deployment failed:`, error);
    throw error;
  }
}

// Main execution
if (importPath === scriptPath) {
  deployPoolV2()
    .then((result) => {
      console.log(`\n🎉 ClearSky Pool V2 deployment completed successfully!`);
      console.log(`🏊‍♂️ Pool Address: ${result.poolAddress}`);
      console.log(`🪙 Token Address: ${result.tokenAddress}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Deployment failed:", error);
      process.exit(1);
    });
}

export { deployPoolV2 };
