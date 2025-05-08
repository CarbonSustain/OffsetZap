const hre = require("hardhat");

async function main() {
  // Compile contracts just in case
  await hre.run('compile');

  // Get the contract factory
  const OffsetZap = await hre.ethers.getContractFactory("OffsetZap");

  // Deploy it
  const offsetZap = await OffsetZap.deploy();

  // Wait for the contract to be mined
  await offsetZap.deployed();

  console.log(`✅ OffsetZap deployed to: ${offsetZap.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
