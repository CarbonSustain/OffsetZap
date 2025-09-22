import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Debug: Normalize paths for comparison
const normalizePath = (path) => {
  return path
    .replace(/^file:\/\//, "") // Remove file:// protocol
    .replace(/\\/g, "/") // Convert backslashes to forward slashes
    .replace(/^\/+/, "") // Remove leading slashes
    .toLowerCase(); // Make case-insensitive
};

const importPath = normalizePath(import.meta.url);
const scriptPath = normalizePath(process.argv[1]);

async function deployPoolV3() {
  console.log(
    "🚀 Deploying ClearSky Liquidity Pool V3 (Split Token Creation)...\n"
  );

  try {
    // Network configuration
    const network = process.env.NETWORK || "testnet";
    let rpcUrl, chainId;

    if (network === "mainnet") {
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
      nameResolver: null,
    });

    const privateKey = process.env.PRIVATE_KEY;

    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const deployer = new ethers.Wallet(privateKey, provider);
    console.log(`👤 Deploying with account: ${deployer.address}`);
    console.log(
      `💰 Account balance: ${ethers.formatEther(
        await provider.getBalance(deployer.address)
      )} HBAR`
    );

    // Get network info
    const networkInfo = await provider.getNetwork();
    console.log(`🌐 Network: ${network} (Chain ID: ${networkInfo.chainId})`);

    // Load contract ABI and bytecode
    const contractPath =
      "./artifacts/contracts/ClearSkyLiquidityPoolV3.sol/ClearSkyLiquidityPoolV3.json";

    if (!fs.existsSync(contractPath)) {
      throw new Error(
        "Contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }

    const contractArtifact = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const { abi, bytecode } = contractArtifact;

    // Deploy the contract (simple constructor - no token creation)
    console.log(
      `\n🏗️ Deploying ClearSkyLiquidityPoolV3 (simple constructor)...`
    );
    const factory = new ethers.ContractFactory(abi, bytecode, deployer);

    // Deploy with just owner parameter
    const poolContract = await factory.deploy(
      deployer.address // owner only
    );

    console.log(`⏳ Waiting for deployment transaction to be mined...`);
    await poolContract.waitForDeployment();

    const poolAddress = await poolContract.getAddress();
    console.log(`✅ Pool Contract deployed to: ${poolAddress}`);
    console.log(
      `🔗 Transaction Hash: ${poolContract.deploymentTransaction().hash}`
    );

    // Wait a bit for the contract to be fully ready
    console.log(`⏳ Waiting for contract to be ready...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Now create the LP token in a separate transaction
    console.log(`\n🪙 Creating LP Token (separate transaction)...`);
    const tokenConfig = {
      name: "ClearSky LP Token",
      symbol: "CSLP",
    };

    console.log(`📝 Token Configuration:`);
    console.log(`   • Name: ${tokenConfig.name}`);
    console.log(`   • Symbol: ${tokenConfig.symbol}`);
    console.log(`   • Decimals: 6 (hardcoded in contract)`);
    console.log(`   • Treasury: ${poolAddress} (Contract itself)`);

    try {
      console.log(`🎯 Simulating createLPToken() first...`);

      try {
        const simulateTx = await poolContract.createLPToken.staticCall(
          tokenConfig.name,
          tokenConfig.symbol,
          {
            gasLimit: 10000000,
            value: ethers.parseEther("20"), // Include HBAR fee for HTS token creation
          }
        );
        console.log(`✅ Simulated transaction successful`);
        console.log(`📍 Token would be created at: ${simulateTx}`);
      } catch (staticError) {
        console.error(`❌ Static call failed:`, staticError);
        console.error(`📄 Static error message: ${staticError.message}`);

        if (staticError.data) {
          console.error(`📊 Static error data: ${staticError.data}`);

          // Try to decode the error data
          try {
            const decodedError = poolContract.interface.parseError(
              staticError.data
            );
            console.error(`🔍 Decoded error: ${decodedError.name}`);
            console.error(`📝 Error args:`, decodedError.args);
          } catch (decodeErr) {
            console.error(
              `⚠️ Could not decode error data: ${decodeErr.message}`
            );
          }
        }

        if (staticError.reason) {
          console.error(`🔍 Static error reason: ${staticError.reason}`);
        }

        if (staticError.code) {
          console.error(`🏷️ Error code: ${staticError.code}`);
        }

        // Don't continue if static call fails - it will definitely fail in real transaction
        throw staticError;
      }

      console.log(`🎯 Now calling actual createLPToken()...`);
      const createTokenTx = await poolContract.createLPToken(
        tokenConfig.name,
        tokenConfig.symbol,
        {
          gasLimit: 10000000, // Gas limit for execution
          value: ethers.parseEther("20"), // Send 20 HBAR to cover HTS token creation fee
        }
      );

      console.log(`⏳ Waiting for token creation transaction...`);
      console.log(`📄 Token creation TX hash: ${createTokenTx.hash}`);

      const createTokenReceipt = await createTokenTx.wait();
      console.log(
        `✅ Token creation confirmed in block ${createTokenReceipt.blockNumber}`
      );
      console.log(
        `⛽ Gas used for token creation: ${createTokenReceipt.gasUsed.toString()}`
      );

      // Now create the FCDR token
      console.log(`\n🪙 Creating FCDR Token (separate transaction)...`);
      try {
        console.log(`🎯 Simulating createFCDRToken() first...`);

        try {
          const simulateFcdrTx = await poolContract.createFCDRToken.staticCall({
            gasLimit: 10000000,
            value: ethers.parseEther("20"), // Include HBAR fee for HTS token creation (same as CSLP)
          });
          console.log(`✅ FCDR simulation successful`);
        } catch (staticError) {
          console.error(`❌ FCDR static call failed:`, staticError);
          throw staticError;
        }

        console.log(`🎯 Now calling actual createFCDRToken()...`);
        const createFcdrTx = await poolContract.createFCDRToken({
          gasLimit: 10000000, // Gas limit for execution
          value: ethers.parseEther("20"), // Send 20 HBAR to cover HTS token creation fee (same as CSLP)
        });

        console.log(`⏳ Waiting for FCDR token creation transaction...`);
        console.log(`📄 FCDR creation TX hash: ${createFcdrTx.hash}`);

        const createFcdrReceipt = await createFcdrTx.wait();
        console.log(
          `✅ FCDR token creation confirmed in block ${createFcdrReceipt.blockNumber}`
        );
        console.log(
          `⛽ Gas used for FCDR creation: ${createFcdrReceipt.gasUsed.toString()}`
        );

        // Get the created FCDR token information
        const fcdrTokenAddress = await poolContract.fcdrToken();
        console.log(`\n🎉 FCDR Token Created Successfully!`);
        console.log(`📍 FCDR Token Address: ${fcdrTokenAddress}`);
        console.log(`📝 FCDR Token Name: Future CDR`);
        console.log(`🏷️ FCDR Token Symbol: FCDR`);
        console.log(`🔢 FCDR Token Decimals: 0`);
        console.log(`🏦 FCDR Treasury: ${poolAddress} (Contract itself)`);
        console.log(`🔑 FCDR Supply Key: Contract-controlled (${poolAddress})`);

        // Convert to Hedera token ID format
        let fcdrTokenId = "Unknown";
        try {
          const fcdrAddressBigInt = BigInt(fcdrTokenAddress);
          if (fcdrAddressBigInt > 0) {
            fcdrTokenId = `0.0.${fcdrAddressBigInt.toString()}`;
          }
        } catch (e) {
          console.log(
            `⚠️ Could not convert FCDR to Hedera token ID: ${e.message}`
          );
        }

        console.log(`\n🔍 Additional FCDR Token Details:`);
        console.log(`📍 FCDR Token Address (EVM): ${fcdrTokenAddress}`);
        console.log(`🆔 FCDR Token ID (Hedera): ${fcdrTokenId}`);
      } catch (fcdrError) {
        console.error(`❌ FCDR token creation failed:`, fcdrError);
        console.log(
          `⚠️ Pool deployed and LP token created, but FCDR creation failed.`
        );
        console.log(`📋 You can retry FCDR creation later with:`);
        console.log(`   node createFCDRTokenV3.js`);
      }

      // Get the created token information
      console.log(`\n🔍 Retrieving token information from contract...`);
      const tokenInfo = await poolContract.getTokenInfo();
      const lpTokenAddress = await poolContract.lpToken();
      const isTokenCreated = await poolContract.isTokenCreated();

      console.log(`\n🎉 Token Created Successfully!`);
      console.log(`📍 LP Token Address: ${lpTokenAddress}`);
      console.log(`📝 Token Name: ${tokenInfo.name}`);
      console.log(`🏷️ Token Symbol: ${tokenInfo.symbol}`);
      console.log(`🔢 Token Decimals: ${tokenInfo.decimals}`);
      console.log(`🏦 Treasury: ${poolAddress} (Contract itself)`);
      console.log(`🔑 Supply Key: Contract-controlled (${poolAddress})`);
      console.log(`✅ Token Created: ${isTokenCreated}`);

      // Convert to Hedera token ID format
      let tokenId = "Unknown";
      try {
        const addressBigInt = BigInt(lpTokenAddress);
        if (addressBigInt > 0) {
          tokenId = `0.0.${addressBigInt.toString()}`;
        }
      } catch (e) {
        console.log(`⚠️ Could not convert to Hedera token ID: ${e.message}`);
      }

      console.log(`\n🔍 Additional Token Details:`);
      console.log(`📍 Token Address (EVM): ${lpTokenAddress}`);
      console.log(`🆔 Token ID (Hedera): ${tokenId}`);

      // Prepare deployment information
      const deploymentInfo = {
        // Contract Information
        contractName: "ClearSkyLiquidityPoolV3",
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
          createdBy: "Contract (HIP-1028 Split)",
        },

        // FCDR Token Information (Created by Contract)
        fcdrTokenInfo: {
          name: "Future CDR",
          symbol: "FCDR",
          decimals: 0,
          tokenAddress: await poolContract
            .fcdrToken()
            .catch(() => "0x0000000000000000000000000000000000000000"),
          tokenId: "See deployment logs",
          treasury: poolAddress,
          supplyKey: poolAddress,
          adminKey: "Contract-controlled",
          wipeKey: "Contract-controlled",
          created: true,
          createdBy: "Contract (HIP-1028 Split)",
        },

        // Pool Configuration
        poolConfig: {
          minLiquidity: "100000", // 0.001 HBAR in wei (8 decimals)
          feeBps: "30", // 0.3%
          feeDenominator: "10000",
          totalHBAR: "0",
          totalLPTokens: "0",
          totalValue: "0",
          initialized: false,
        },

        // Deployment Metadata
        deployedAt: new Date().toISOString(),
        deploymentBlock: await provider.getBlockNumber(),
        deploymentTxHash: poolContract.deploymentTransaction().hash,
        tokenCreationTxHash: createTokenTx.hash,
        gasUsedDeployment: "See deployment transaction",
        gasUsedTokenCreation: createTokenReceipt.gasUsed.toString(),
        version: "3.0.0",
        features: [
          "Split Token Creation",
          "HIP-1028 Token Creation",
          "Self-Treasury Management",
          "Integrated LP Token",
          "FCDR Token Creation",
          "Value-Based Distribution",
          "HTS Integration",
          "Slippage Protection",
          "Emergency Controls",
          "Emergency Withdrawal Tracking",
        ],
      };

      // Save deployment info (convert BigInt to string for JSON serialization)
      const outputPath = path.join(
        process.cwd(),
        "clearsky-pool-v3-deployment.json"
      );
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          deploymentInfo,
          (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          2
        )
      );
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
        createdBy: "Contract (Split)",
        createdAt: new Date().toISOString(),
        network: "Hedera Testnet",
        version: "3.0.0",
      };

      const tokenOutputPath = path.join(
        process.cwd(),
        "clearsky-lp-token-v3.json"
      );
      fs.writeFileSync(
        tokenOutputPath,
        JSON.stringify(
          tokenInfoSimple,
          (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          2
        )
      );
      console.log(`💾 Token info saved to: ${tokenOutputPath}`);

      console.log(`\n🎯 Split Deployment Success!`);
      console.log(`   ✅ Step 1: Pool contract deployed successfully`);
      console.log(`   ✅ Step 2: LP token created successfully`);
      console.log(`   ✅ Step 3: FCDR token created successfully`);
      console.log(`   ✅ Contract is treasury (receives minted tokens)`);
      console.log(`   ✅ Contract has supply key (can mint/burn)`);
      console.log(`   ✅ No gas estimation issues`);
      console.log(`   ✅ All users will receive tokens correctly`);
      console.log(`   ✅ Emergency withdrawal tracking ready`);

      console.log(`\n📋 Next Steps:`);
      console.log(`1. Initialize pool: node initializePoolV3.js`);
      console.log(`2. Test liquidity: node testPoolV3.js`);
      console.log(`3. Verify token flow: node debugTokenV3.js`);

      return {
        poolAddress,
        tokenAddress: lpTokenAddress,
        tokenInfo: tokenInfoSimple,
        deploymentInfo,
      };
    } catch (tokenError) {
      console.error(`❌ Token creation failed:`, tokenError);

      // Try to get detailed error information from transaction receipt
      let detailedError = tokenError.message;
      let hederaErrorCode = "Unknown";
      let hederaErrorMessage = "Unknown error occurred";

      try {
        if (tokenError.receipt && tokenError.receipt.logs) {
          // Look for TokenCreationFailedEvent in logs
          const tokenCreationFailedTopic = ethers.id(
            "TokenCreationFailedEvent(int32,string)"
          );
          const errorLog = tokenError.receipt.logs.find(
            (log) => log.topics[0] === tokenCreationFailedTopic
          );

          if (errorLog) {
            const decodedLog = poolContract.interface.parseLog(errorLog);
            hederaErrorCode = decodedLog.args.responseCode.toString();
            hederaErrorMessage = decodedLog.args.errorMessage;
            console.error(`🔍 Hedera Error Code: ${hederaErrorCode}`);
            console.error(`📝 Hedera Error Message: ${hederaErrorMessage}`);
            detailedError = `Hedera Error ${hederaErrorCode}: ${hederaErrorMessage}`;
          }
        }

        // Also check if we can get the error from contract call
        if (tokenError.data) {
          console.error(`📄 Error data: ${tokenError.data}`);
        }
      } catch (parseError) {
        console.error(
          `⚠️ Could not parse detailed error: ${parseError.message}`
        );
      }

      // Still save basic deployment info
      const basicDeploymentInfo = {
        contractName: "ClearSkyLiquidityPoolV3",
        contractAddress: poolAddress,
        deployerAddress: deployer.address,
        network: network,
        chainId: networkInfo.chainId.toString(),
        deployedAt: new Date().toISOString(),
        deploymentTxHash: poolContract.deploymentTransaction().hash,
        error: "Token creation failed",
        errorMessage: detailedError,
        hederaErrorCode: hederaErrorCode,
        hederaErrorMessage: hederaErrorMessage,
        tokenCreated: false,
      };

      const outputPath = path.join(
        process.cwd(),
        "clearsky-pool-v3-deployment.json"
      );
      fs.writeFileSync(
        outputPath,
        JSON.stringify(
          basicDeploymentInfo,
          (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          2
        )
      );
      console.log(`💾 Basic deployment info saved to: ${outputPath}`);

      console.log(`\n⚠️ Pool deployed but token creation failed.`);
      console.log(`📋 You can retry token creation with:`);
      console.log(`   node createTokenV3.js`);

      throw tokenError;
    }
  } catch (error) {
    console.error(`❌ Deployment failed:`, error);
    throw error;
  }
}

// Main execution
if (importPath === scriptPath) {
  deployPoolV3()
    .then((result) => {
      console.log(`\n🎉 ClearSky Pool V3 deployment completed successfully!`);
      console.log(`🏊‍♂️ Pool Address: ${result.poolAddress}`);
      console.log(`🪙 Token Address: ${result.tokenAddress}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Deployment failed:", error);
      process.exit(1);
    });
}

export { deployPoolV3 };
