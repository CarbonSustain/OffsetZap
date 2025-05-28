require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

module.exports = {
  solidity: "0.8.18",
  networks: {
    polygon: {
      url: process.env.ALCHEMY_API,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 80001, // Polygon Mumbai
    },
    base: {
      url: process.env.BASE_SEPOLIA_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 84532, // Base Sepolia
    },
  },
};

async function deployCarbonBridgeToBase() {
  console.log("Deploying BaseCarbonBridge...");

  const BaseCarbonBridge = await ethers.getContractFactory("BaseCarbonBridge");
  const baseCarbonBridge = await BaseCarbonBridge.deploy();
  await baseCarbonBridge.waitForDeployment();

  const deployedAddress = baseCarbonBridge.target;

  console.log("BaseCarbonBridge deployed at:", deployedAddress);

  const abi = BaseCarbonBridge.interface.formatJson(); // Ethers v6 ABI formatting

  // Optional: Save to disk
  fs.writeFileSync(
    path.join(__dirname, "BaseCarbonBridgeDeployment.json"),
    JSON.stringify({ address: deployedAddress, abi }, null, 2)
  );

  return {
    address: deployedAddress,
    abi,
    contract: baseCarbonBridge,
  };
}

async function deployKlimaToPolygon() {
  console.log("Deploying deployKlimaToPolygon...");

  const KlimaToPolygon = await ethers.getContractFactory("KlimaRetirementFacilitator");
  const klimaToPolygon = await KlimaToPolygon.deploy();
  await klimaToPolygon.waitForDeployment();

  const deployedAddress = klimaToPolygon.target;

  console.log("BaseCarbonBridge deployed at:", deployedAddress);

  const abi = KlimaToPolygon.interface.formatJson(); // Ethers v6 ABI formatting

  // Optional: Save to disk
  fs.writeFileSync(
    path.join(__dirname, "KlimaToPolygonDeployment.json"),
    JSON.stringify({ address: deployedAddress, abi }, null, 2)
  );

  return {
    address: deployedAddress,
    abi,
    contract: baseCarbonBridge,
  };
}

async function main() {
  //const deployedAddress = await deployCarbonBridgeToBase();
  //console.log("deployCarbonBridgeToBase: deployedAddress", deployedAddress);

  const deployedAddress = await deployKlimaToPolygon();
  console.log("deployKlimaToPolygon: deployedAddress", deployedAddress);
}

// Trigger the deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
