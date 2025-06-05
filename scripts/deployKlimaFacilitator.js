// Script to deploy the OffsetZapKlimaFacilitator contract to Polygon Amoy
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Deploying OffsetZapKlimaFacilitator to Polygon Amoy...");

  // Contract addresses
  const USDC_ADDRESS_POLYGON_AMOY = "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582";
  const USDC_ADDRESS_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
  
  // This is the mainnet address - for testing on Amoy, you might need to deploy a mock
  // or use a different address if there's a testnet version
  const KLIMA_AGGREGATOR_V2 = "0x8cE54d9625371fb2a068986d32C85De8E6e995f8";
  
  // Carbon pool token addresses (these are mainnet addresses for reference)
  // For Polygon Amoy testnet, you might need to deploy mock tokens or use addresses provided by KlimaDAO
  const CARBON_POOL_TOKENS = {
    BCT: "0x1e67124681b402064cd0abe8ed1b5c79d2e02f64",  // Base Carbon Tonne
    NCT: "0xb2D0D5C86d933b0aceFE9B95bEC160d514d152E1",  // Nature Carbon Tonne
    MCO2: "0x64a3b8cA5A7e406A78e660AE10c7563D9153a739", // Moss Carbon Credit
    UBO: "0x5400A05B8B45EaF9105315B4F2e31F806AB706dE", // Universal Base Offset
    NBO: "0x251cA6A70cbd93Ccd7039B6b708D4cb9683c266C"  // Nature Base Offset
  };
  
  // Use BCT as the default pool token
  const DEFAULT_POOL_TOKEN = CARBON_POOL_TOKENS.BCT;
  
  // Get the contract factory
  const OffsetZapKlimaFacilitator = await hre.ethers.getContractFactory("OffsetZapKlimaFacilitator");
  
  // Deploy the contract with constructor arguments
  const deployTx = await OffsetZapKlimaFacilitator.deploy(
    USDC_ADDRESS_POLYGON,
    KLIMA_AGGREGATOR_V2,
    DEFAULT_POOL_TOKEN
  );

  // Wait for deployment to complete
  const facilitator = await deployTx.waitForDeployment();
  const facilitatorAddress = await facilitator.getAddress();

  console.log("OffsetZapKlimaFacilitator deployed to:", facilitatorAddress);
  console.log("Constructor arguments:");
  console.log("- USDC Address:", USDC_ADDRESS_POLYGON);
  console.log("- Klima Aggregator Address:", KLIMA_AGGREGATOR_V2);
  console.log("- Default Pool Token:", DEFAULT_POOL_TOKEN);
  
  // Verify the contract on Polygonscan (if API key is configured)
  console.log("Waiting for block confirmations...");
  
  // Wait for a few seconds to ensure the transaction is mined
  console.log("Waiting for transaction to be mined...");
  await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
  
  console.log("Verifying contract on Polygonscan...");
  try {
    await hre.run("verify:verify", {
      address: facilitatorAddress,
      constructorArguments: [
        USDC_ADDRESS_POLYGON,
        KLIMA_AGGREGATOR_V2,
        DEFAULT_POOL_TOKEN
      ],
    });
    console.log("Contract verified on Polygonscan!");
  } catch (error) {
    console.error("Error verifying contract:", error);
  }

  // Update the KLIMA_RETIREMENT_FACILITATOR constant in across.js
  console.log("\nIMPORTANT: Update the KLIMA_RETIREMENT_FACILITATOR constant in across.js with this address:");
  console.log(facilitatorAddress);
  
  // Save deployment info to a file for later reference
  const deploymentInfo = {
    timestamp: new Date().toISOString(),
    network: hre.network.name,
    facilitatorAddress: facilitatorAddress,
    usdcAddress: USDC_ADDRESS_POLYGON,
    klimaAggregatorAddress: KLIMA_AGGREGATOR_V2,
    defaultPoolTokenAddress: DEFAULT_POOL_TOKEN,
    carbonPoolTokens: CARBON_POOL_TOKENS
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }
  
  // Save to file with timestamp in filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(deploymentsDir, `klima-facilitator-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`\nDeployment info saved to: ${filePath}`);
  
  return {
    facilitatorAddress: facilitatorAddress,
    usdcAddress: USDC_ADDRESS_POLYGON,
    klimaAggregatorAddress: KLIMA_AGGREGATOR_V2,
    defaultPoolTokenAddress: DEFAULT_POOL_TOKEN
  };
}

// Execute the deployment
main()
  .then((deployedAddresses) => {
    console.log("Deployment successful!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
