import { ethers } from "ethers";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

async function testUSDCalculation() {
  console.log("🧪 Testing USD-based CSLP calculation...\n");

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

    // Setup provider
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

    // Contract ABI for the new functions
    const contractABI = [
      {
        inputs: [
          { internalType: "uint256", name: "usdAmount", type: "uint256" },
          {
            internalType: "uint256",
            name: "maturationAmount",
            type: "uint256",
          },
        ],
        name: "calculateCSLPFromUSD",
        outputs: [
          { internalType: "uint256", name: "cslpTokens", type: "uint256" },
        ],
        stateMutability: "pure",
        type: "function",
      },
    ];

    const contract = new ethers.Contract(
      deploymentInfo.contractAddress,
      contractABI,
      provider
    );

    console.log("🔍 Testing calculateCSLPFromUSD function...\n");

    // Test cases
    const testCases = [
      { usd: 10, maturation: 110, expected: 0.090909 },
      { usd: 20, maturation: 110, expected: 0.181818 },
      { usd: 50, maturation: 110, expected: 0.454545 },
      { usd: 100, maturation: 110, expected: 0.90909 },
    ];

    for (const testCase of testCases) {
      const usdAmountWei = Math.floor(testCase.usd * 100); // Convert to 2 decimals
      const maturationAmountWei = Math.floor(testCase.maturation * 100);

      console.log(
        `📊 Test: $${testCase.usd} USD, Maturation: $${testCase.maturation}`
      );
      console.log(
        `   Input: usdAmount=${usdAmountWei}, maturationAmount=${maturationAmountWei}`
      );

      try {
        const result = await contract.calculateCSLPFromUSD(
          usdAmountWei,
          maturationAmountWei
        );
        const cslpTokens = Number(result) / 1e6; // Convert from 6 decimals

        console.log(`   Result: ${result.toString()} (${cslpTokens} CSLP)`);
        console.log(`   Expected: ${testCase.expected} CSLP`);

        const isCorrect = Math.abs(cslpTokens - testCase.expected) < 0.000001;
        console.log(`   ✅ ${isCorrect ? "PASS" : "FAIL"}\n`);
      } catch (error) {
        console.log(`   ❌ ERROR: ${error.message}\n`);
      }
    }

    console.log("🎉 USD calculation test completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testUSDCalculation();
