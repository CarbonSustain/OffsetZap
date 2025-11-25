const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  console.log(
    `\n🚀 Deploying CDR stack with ${deployer.address} on ${network}...`
  );

  // ---- Hedera Carbon Retirer config ----
  const dexRouter = process.env.CDR_HEDERA_DEX_ROUTER;
  const usdcHedera = process.env.CDR_HEDERA_USDC;
  const wrappedHbar = process.env.CDR_HEDERA_WH_BAR || hre.ethers.ZeroAddress;
  const hederaRelayer = process.env.CDR_RELAYER || deployer.address;

  if (!dexRouter || !usdcHedera) {
    throw new Error(
      "Missing Hedera config: set CDR_HEDERA_DEX_ROUTER and CDR_HEDERA_USDC"
    );
  }

  // ---- Polygon Executor config ----
  const polygonUsdc = process.env.CDR_POLYGON_USDC || usdcHedera;
  const bctToken = process.env.CDR_POLYGON_BCT;
  const nctToken = process.env.CDR_POLYGON_NCT;
  const klimaAggregator = process.env.CDR_POLYGON_KLIMA_AGG;
  const polygonRelayer = process.env.CDR_RELAYER_POLYGON || hederaRelayer;

  if (!bctToken || !nctToken || !klimaAggregator) {
    throw new Error(
      "Missing Polygon config: set CDR_POLYGON_BCT, CDR_POLYGON_NCT, CDR_POLYGON_KLIMA_AGG"
    );
  }

  // ---- Deploy HederaCarbonRetirer ----
  console.log("📦 Deploying HederaCarbonRetirer...");
  const RetirerFactory = await hre.ethers.getContractFactory(
    "HederaCarbonRetirer"
  );
  const hederaRetirer = await RetirerFactory.deploy(
    dexRouter,
    usdcHedera,
    wrappedHbar,
    hederaRelayer
  );
  await hederaRetirer.waitForDeployment();
  const hederaRetirerAddress = await hederaRetirer.getAddress();
  console.log(`   ↳ HederaCarbonRetirer deployed at ${hederaRetirerAddress}`);

  // ---- Deploy PolygonCDRExecutor ----
  console.log("📦 Deploying PolygonCDRExecutor...");
  const ExecutorFactory = await hre.ethers.getContractFactory(
    "PolygonCDRExecutor"
  );
  const polygonExecutor = await ExecutorFactory.deploy(
    polygonUsdc,
    bctToken,
    nctToken,
    klimaAggregator,
    polygonRelayer
  );
  await polygonExecutor.waitForDeployment();
  const polygonExecutorAddress = await polygonExecutor.getAddress();
  console.log(`   ↳ PolygonCDRExecutor deployed at ${polygonExecutorAddress}`);

  // ---- Persist deployment info ----
  const outPath = path.join(__dirname, "clearsky-cdr-deployment.json");
  let deploymentJson = {};
  if (fs.existsSync(outPath)) {
    deploymentJson = JSON.parse(fs.readFileSync(outPath, "utf8"));
  }

  deploymentJson[network] = {
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    hederaRetirer: {
      address: hederaRetirerAddress,
      dexRouter,
      usdcHedera,
      wrappedHbar,
      relayer: hederaRelayer,
    },
    polygonExecutor: {
      address: polygonExecutorAddress,
      usdc: polygonUsdc,
      bctToken,
      nctToken,
      klimaAggregator,
      relayer: polygonRelayer,
    },
  };

  fs.writeFileSync(outPath, JSON.stringify(deploymentJson, null, 2));
  console.log(`\n📝 Deployment info saved to ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
