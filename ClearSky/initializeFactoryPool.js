import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeFactoryPool() {
  console.log("🏊‍♂️ Initializing Factory Pool...\n");

  try {
    // Load factory deployment info
    const deploymentPath = path.join(
      __dirname,
      "clearsky-factory-deployment.json"
    );
    if (!fs.existsSync(deploymentPath)) {
      throw new Error(
        "Factory deployment file not found. Run deployFactory.js first."
      );
    }

    const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const factoryAddress = deploymentInfo.factory.contractAddress;
    const testPoolAddress = deploymentInfo.testPool.poolAddress;

    console.log(`📂 Loaded factory deployment info:`);
    console.log(`   Factory: ${factoryAddress}`);
    console.log(`   Test Pool: ${testPoolAddress}`);

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
    console.log(`👤 Initializing with account: ${signer.address}`);
    console.log(
      `💰 Account balance: ${ethers.formatEther(
        await provider.getBalance(signer.address)
      )} HBAR`
    );

    // Load pool contract ABI
    const poolContractPath =
      "./artifacts/contracts/ClearSkyLiquidityPoolV3.sol/ClearSkyLiquidityPoolV3.json";
    if (!fs.existsSync(poolContractPath)) {
      throw new Error(
        "Pool contract artifacts not found. Run 'npx hardhat compile' first."
      );
    }

    const poolContractArtifact = JSON.parse(
      fs.readFileSync(poolContractPath, "utf8")
    );
    const { abi: poolABI } = poolContractArtifact;

    const poolContract = new ethers.Contract(testPoolAddress, poolABI, signer);

    console.log(`🔗 Connected to pool contract at: ${testPoolAddress}`);

    // Check if pool is already initialized
    const [totalHBAR, totalLPTokens, totalValue] =
      await poolContract.getPoolInfo();
    console.log(`📊 Current Pool State:`);
    console.log(`   • Total HBAR: ${ethers.formatUnits(totalHBAR, 8)} HBAR`);
    console.log(
      `   • Total LP Tokens: ${ethers.formatUnits(totalLPTokens, 6)} CSLP`
    );
    console.log(`   • Total Value: ${ethers.formatUnits(totalValue, 8)} HBAR`);

    if (totalLPTokens > 0) {
      console.log(`⚠️ Pool is already initialized!`);
      return;
    }

    // Get shared token addresses from factory
    const cslpToken = deploymentInfo.sharedTokens.cslpToken.address;
    const fcdrToken = deploymentInfo.sharedTokens.fcdrToken.address;

    console.log(`\n🪙 Shared Token Information:`);
    console.log(`   • CSLP Token: ${cslpToken}`);
    console.log(`   • FCDR Token: ${fcdrToken}`);

    // Initialize with 10 HBAR
    const initAmount = ethers.parseUnits("10", 18); // 10 HBAR
    console.log(
      `\n💧 Initializing pool with ${ethers.formatEther(initAmount)} HBAR...`
    );

    // Call initializePool
    console.log(`📝 Calling initializePool()...`);
    const tx = await poolContract.initializePool({
      value: initAmount,
      gasLimit: 3000000, // Set higher gas limit for HTS operations
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
          data: log.data,
        });

        if (parsedLog) {
          console.log(`   🎯 ${parsedLog.name}:`);

          switch (parsedLog.name) {
            case "LiquidityAdded":
              console.log(`      • User: ${parsedLog.args.user}`);
              console.log(
                `      • HBAR Amount: ${ethers.formatUnits(
                  parsedLog.args.hbarAmount,
                  8
                )} HBAR`
              );
              console.log(
                `      • LP Tokens Minted: ${ethers.formatUnits(
                  parsedLog.args.lpTokensMinted,
                  6
                )} CSLP`
              );
              console.log(
                `      • Timestamp: ${new Date(
                  Number(parsedLog.args.timestamp) * 1000
                ).toISOString()}`
              );
              liquidityAdded = true;
              lpTokensMinted = parsedLog.args.lpTokensMinted;
              break;

            case "HTSMintAttempt":
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(
                `      • Amount: ${parsedLog.args.amount.toString()}`
              );
              break;

            case "HTSMintSuccess":
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(
                `      • Amount: ${parsedLog.args.amount.toString()}`
              );
              console.log(
                `      • New Total Supply: ${parsedLog.args.newTotalSupply.toString()}`
              );
              htsMintSuccess = true;
              break;

            case "HTSMintFailed":
              console.log(`      • Token: ${parsedLog.args.token}`);
              console.log(`      • To: ${parsedLog.args.to}`);
              console.log(
                `      • Amount: ${parsedLog.args.amount.toString()}`
              );
              console.log(
                `      • Response Code: ${parsedLog.args.responseCode}`
              );
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
    const [newTotalHBAR, newTotalLPTokens, newTotalValue] =
      await poolContract.getPoolInfo();

    console.log(`📊 Pool State After Initialization:`);
    console.log(`   • Total HBAR: ${ethers.formatUnits(newTotalHBAR, 8)} HBAR`);
    console.log(
      `   • Total LP Tokens: ${ethers.formatUnits(newTotalLPTokens, 6)} CSLP`
    );
    console.log(
      `   • Total Value: ${ethers.formatUnits(newTotalValue, 8)} HBAR`
    );

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    const finalBalance = await provider.getBalance(signer.address);
    console.log(
      `   • Your HBAR Balance: ${ethers.formatEther(finalBalance)} HBAR`
    );
    console.log(
      `   • Your LP Balance: ${ethers.formatUnits(
        lpTokensMinted,
        6
      )} CSLP (minted to contract treasury)`
    );

    console.log(`\n🎉 Factory Pool Initialization Complete!`);
    console.log(`✅ Liquidity Added: ${liquidityAdded}`);
    console.log(`✅ HTS Mint Success: ${htsMintSuccess}`);
    console.log(`🏊‍♂️ Pool is ready for users to add liquidity!`);

    console.log(`\n📋 Next Steps:`);
    console.log(`1. Test adding liquidity from frontend`);
    console.log(`2. Check pool state in Manage LP page`);

    return {
      success: true,
      txHash: tx.hash,
      poolState: {
        totalHBAR: newTotalHBAR,
        totalLPTokens: newTotalLPTokens,
        totalValue: newTotalValue,
      },
    };
  } catch (error) {
    console.error(`❌ Factory pool initialization failed:`, error);
    throw error;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeFactoryPool()
    .then((result) => {
      console.log(`\n🎉 Factory pool initialized successfully!`);
      console.log(`📄 Transaction: ${result.txHash}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Factory pool initialization failed:", error);
      process.exit(1);
    });
}

export { initializeFactoryPool };
