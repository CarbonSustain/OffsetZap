import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

async function createFCDRTokenV3() {
  console.log("🪙 Creating FCDR Token for existing ClearSky Pool V3...\n");

  try {
    // Load deployment info
    let deploymentInfo;
    try {
      const deploymentData = fs.readFileSync(
        "clearsky-pool-v3-deployment.json",
        "utf8"
      );
      deploymentInfo = JSON.parse(deploymentData);
      console.log(
        `📂 Loaded deployment info for pool at: ${deploymentInfo.contractAddress}`
      );
    } catch (error) {
      console.error(
        "❌ Could not load deployment info. Please run deployPoolV3.js first."
      );
      throw error;
    }

    // Setup provider and wallet
    const network = process.env.NETWORK || "testnet";
    let rpcUrl;

    if (network === "mainnet") {
      rpcUrl = process.env.HEDERA_MAINNET_RPC_URL;
    } else {
      rpcUrl = process.env.HEDERA_TESTNET_RPC_URL;
    }

    if (!rpcUrl) {
      throw new Error(`Missing ${network.toUpperCase()}_RPC_URL in .env file`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null,
    });

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("Missing PRIVATE_KEY in .env file");
    }

    const signer = new ethers.Wallet(privateKey, provider);
    console.log(`👤 Creating FCDR token with account: ${signer.address}`);
    console.log(
      `💰 Account balance: ${ethers.formatEther(
        await provider.getBalance(signer.address)
      )} HBAR`
    );

    // Load contract ABI and connect to deployed contract
    const contractPath =
      "./artifacts/contracts/ClearSkyLiquidityPoolV3.sol/ClearSkyLiquidityPoolV3.json";
    if (!fs.existsSync(contractPath)) {
      throw new Error(
        "Contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }

    const contractArtifact = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    const { abi } = contractArtifact;

    const poolContract = new ethers.Contract(
      deploymentInfo.contractAddress,
      abi,
      signer
    );

    console.log(
      `🔗 Connected to pool contract at: ${deploymentInfo.contractAddress}`
    );

    // Check if FCDR token already exists
    try {
      const existingFcdrToken = await poolContract.fcdrToken();
      if (existingFcdrToken !== "0x0000000000000000000000000000000000000000") {
        console.log(`⚠️ FCDR token already exists at: ${existingFcdrToken}`);
        console.log(`✅ No need to create FCDR token again.`);
        return;
      }
    } catch (error) {
      console.log(
        `ℹ️ FCDR token doesn't exist yet, proceeding with creation...`
      );
    }

    // Create FCDR token
    console.log(`\n🪙 Creating FCDR Token...`);
    console.log(`📝 FCDR Token Configuration:`);
    console.log(`   • Name: Future CDR`);
    console.log(`   • Symbol: FCDR`);
    console.log(`   • Decimals: 0`);
    console.log(
      `   • Treasury: ${deploymentInfo.contractAddress} (Contract itself)`
    );
    console.log(`   • Supply Key: Contract-controlled (for minting)`);
    console.log(`   • Wipe Key: Contract-controlled (for future burning)`);

    try {
      console.log(`🎯 Simulating createFCDRToken() first...`);

      try {
        const simulateTx = await poolContract.createFCDRToken.staticCall({
          gasLimit: 10000000,
          value: ethers.parseEther("20"), // Include HBAR fee for HTS token creation (same as CSLP)
        });
        console.log(`✅ Simulation successful`);
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

      console.log(`🎯 Now calling actual createFCDRToken()...`);
      const createTx = await poolContract.createFCDRToken({
        gasLimit: 10000000, // Gas limit for execution
        value: ethers.parseEther("20"), // Send 20 HBAR to cover HTS token creation fee (same as CSLP)
      });

      console.log(`⏳ Waiting for FCDR token creation transaction...`);
      console.log(`📄 FCDR creation TX hash: ${createTx.hash}`);

      const createReceipt = await createTx.wait();
      console.log(
        `✅ FCDR token creation confirmed in block ${createReceipt.blockNumber}`
      );
      console.log(
        `⛽ Gas used for FCDR creation: ${createReceipt.gasUsed.toString()}`
      );

      // Get the created FCDR token information
      const fcdrTokenAddress = await poolContract.fcdrToken();
      console.log(`\n🎉 FCDR Token Created Successfully!`);
      console.log(`📍 FCDR Token Address: ${fcdrTokenAddress}`);
      console.log(`📝 FCDR Token Name: Future CDR`);
      console.log(`🏷️ FCDR Token Symbol: FCDR`);
      console.log(`🔢 FCDR Token Decimals: 0`);
      console.log(
        `🏦 FCDR Treasury: ${deploymentInfo.contractAddress} (Contract itself)`
      );
      console.log(
        `🔑 FCDR Supply Key: Contract-controlled (${deploymentInfo.contractAddress})`
      );

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

      // Update deployment info with FCDR token information
      deploymentInfo.fcdrTokenInfo = {
        name: "Future CDR",
        symbol: "FCDR",
        decimals: 0,
        tokenAddress: fcdrTokenAddress,
        tokenId: fcdrTokenId,
        treasury: deploymentInfo.contractAddress,
        supplyKey: deploymentInfo.contractAddress,
        adminKey: "Contract-controlled",
        wipeKey: "Contract-controlled",
        created: true,
        createdBy: "Contract (HIP-1028 Split)",
        createdAt: new Date().toISOString(),
      };

      // Save updated deployment info
      fs.writeFileSync(
        "clearsky-pool-v3-deployment.json",
        JSON.stringify(
          deploymentInfo,
          (key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          2
        )
      );
      console.log(`💾 Updated deployment info saved`);

      console.log(`\n🎉 FCDR Token Creation Complete!`);
      console.log(`✅ FCDR token is ready for emergency withdrawal tracking!`);

      return {
        success: true,
        fcdrTokenAddress: fcdrTokenAddress,
        fcdrTokenId: fcdrTokenId,
        txHash: createTx.hash,
      };
    } catch (tokenError) {
      console.error(`❌ FCDR token creation failed:`, tokenError);

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

      console.log(`\n⚠️ FCDR token creation failed.`);
      console.log(
        `📋 You can try again with more HBAR or check the error details above.`
      );

      throw tokenError;
    }
  } catch (error) {
    console.error(`❌ FCDR token creation failed:`, error);
    throw error;
  }
}

// Main execution
createFCDRTokenV3()
  .then((result) => {
    console.log(`\n🎉 FCDR token creation completed successfully!`);
    console.log(`🪙 FCDR Token Address: ${result.fcdrTokenAddress}`);
    console.log(`📄 Transaction: ${result.txHash}`);
  })
  .catch((error) => {
    console.error("FCDR token creation failed:", error);
    process.exit(1);
  });

export { createFCDRTokenV3 };
