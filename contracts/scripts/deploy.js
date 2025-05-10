const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);

  const bctTokenAddress = "0xA0bEd124a09ac2Bd941b10349d8d224fe3c955eb"; // Toucan BCT on Polygon
  const klimaAggregatorV2 = "0x8cE54d9625371fb2a068986d32C85De8E6e995f8"; // KlimaDAO Retirement Aggregator V2

  const CarbonOffset = await hre.ethers.getContractFactory("CarbonOffset");
  const contract = await CarbonOffset.deploy(bctTokenAddress, klimaAggregatorV2);
  await contract.deployed();

  console.log("CarbonOffset deployed to:", contract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
