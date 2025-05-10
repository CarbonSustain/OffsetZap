const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const Zap = await hre.ethers.getContractFactory("CarbonOffsetZap");
  const zap = await Zap.deploy("0xBridgeMessengerAddress");
  await zap.deployed();
  console.log("CarbonOffsetZap deployed to:", zap.address);

  const Toucan = await hre.ethers.getContractFactory("ToucanPurchaser");
  const toucan = await Toucan.deploy("0xToucanPoolAddress");
  await toucan.deployed();
  console.log("ToucanPurchaser deployed to:", toucan.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
