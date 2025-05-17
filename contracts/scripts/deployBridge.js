const hre = require("hardhat");

async function main() {
  const polygonContractAddress = process.env.POLYGON_CONTRACT_ADDRESS;
  const usdcAddress = process.env.BASE_SEPOLIA_USDC_ADDRESS;

  const Bridge = await hre.ethers.getContractFactory("BasePolygonBridge");
  const bridge = await Bridge.deploy(polygonContractAddress, usdcAddress);
  await bridge.deployed();

  console.log("✅ BasePolygonBridge deployed to:", bridge.address);
}

main().catch((error) => {
  console.error("❌ Deployment error:", error);
  process.exitCode = 1;
});
