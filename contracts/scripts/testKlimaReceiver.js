// Test script for AcrossCarbonRetirementReceiver contract
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load deployment information
const deploymentPath = path.join(__dirname, "KlimadaoToPolygonDeployment.json");
const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

// Contract address and ABI
const CONTRACT_ADDRESS = deploymentData.address;
const CONTRACT_ABI = JSON.parse(deploymentData.abi);

// Constants from the contract
const ACROSS_SPOKE_POOL = "0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096"; // Across SpokePool on Polygon
const USDC_TOKEN = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // USDC on Polygon
const DEFAULT_POOL_TOKEN = "0x2F800Db0fdb5223b3C3f354886d907A671414A7F"; // BCT

async function main() {
  console.log("Testing AcrossCarbonRetirementReceiver at:", CONTRACT_ADDRESS);

  // Get the signer
  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);

  // Create contract instance
  const klimaReceiver = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

  // Create a test message with retirement parameters
  const testMessage = {
    beneficiary: signer.address,
    beneficiaryName: "Test User",
    poolTokenAddress: DEFAULT_POOL_TOKEN
  };

  // Encode the message as JSON
  const encodedMessage = ethers.toUtf8Bytes(JSON.stringify(testMessage));
  console.log("Encoded message:", JSON.stringify(testMessage));

  // Test 1: Simulate tokensReceived function
  console.log("\n--- Test 1: Simulating tokensReceived function ---");
  try {
    // We'll use callStatic to simulate the transaction without sending it
    await klimaReceiver.tokensReceived.staticCall(
      ACROSS_SPOKE_POOL, // operator
      ACROSS_SPOKE_POOL, // from (must be the SpokePool)
      CONTRACT_ADDRESS,  // to (must be the contract)
      ethers.parseUnits("100", 6), // 100 USDC
      encodedMessage,    // userData
      "0x"               // operatorData
    );
    console.log("✅ tokensReceived simulation successful!");
  } catch (error) {
    console.error("❌ tokensReceived simulation failed:", error.message);
  }

  // Test 2: Simulate handleAcrossTransfer function
  console.log("\n--- Test 2: Simulating handleAcrossTransfer function ---");
  try {
    // We'll use callStatic to simulate the transaction without sending it
    await klimaReceiver.handleAcrossTransfer.staticCall(
      CONTRACT_ADDRESS,  // recipient (must be the contract)
      ethers.parseUnits("100", 6), // 100 USDC
      encodedMessage     // message
    );
    console.log("✅ handleAcrossTransfer simulation successful!");
  } catch (error) {
    console.error("❌ handleAcrossTransfer simulation failed:", error.message);
  }

  // Test 3: Check if contract constants are correctly set
  console.log("\n--- Test 3: Checking contract constants ---");
  
  const contractSpokePool = await klimaReceiver.ACROSS_SPOKE_POOL();
  console.log("Contract ACROSS_SPOKE_POOL:", contractSpokePool);
  console.log("Expected ACROSS_SPOKE_POOL:", ACROSS_SPOKE_POOL);
  console.log("Match:", contractSpokePool === ACROSS_SPOKE_POOL);

  const contractUsdcToken = await klimaReceiver.USDC_TOKEN();
  console.log("Contract USDC_TOKEN:", contractUsdcToken);
  console.log("Expected USDC_TOKEN:", USDC_TOKEN);
  console.log("Match:", contractUsdcToken === USDC_TOKEN);

  const contractDefaultPoolToken = await klimaReceiver.DEFAULT_POOL_TOKEN();
  console.log("Contract DEFAULT_POOL_TOKEN:", contractDefaultPoolToken);
  console.log("Expected DEFAULT_POOL_TOKEN:", DEFAULT_POOL_TOKEN);
  console.log("Match:", contractDefaultPoolToken === DEFAULT_POOL_TOKEN);

  // Test 4: Check contract owner
  console.log("\n--- Test 4: Checking contract owner ---");
  const owner = await klimaReceiver.owner();
  console.log("Contract owner:", owner);
  console.log("Signer address:", signer.address);
  console.log("Is signer the owner?", owner === signer.address);
}

// Execute the main function
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
