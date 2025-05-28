require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

module.exports = {
  solidity: "0.8.18",
  networks: {
    polygon: {
      url: process.env.POLYGON_RPC_URL,
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

async function deployBasePolygonBridge() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  const Contract = await ethers.getContractFactory("BasePolygonBridge");
  console.log("Deploying BasePolygonBridge contract...");
  const contract = await Contract.deploy();
  await contract.deployed();
  console.log("BasePolygonBridge contract deployed to:", contract.address);
  // Optional: Interact with the contract (if needed)
  const tx = await contract.sendMessageToPolygon("Hello, Polygon!");
  await tx.wait();
  console.log("Message sent to Polygon:", tx.hash);
}

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
async function deployOffsetZapToBase(polygonContractAddress) {
  // Step 1: Deploy the Base Contract (OffsetZap.sol)
  console.log("Deploying the Base Contract (OffsetZap.sol)...");
  // Get contract factory for OffsetZap
  const OffsetZap = await ethers.getContractFactory("OffsetZap");
  // Deploy the Base Contract (OffsetZap) with the Polygon contract address
  const offsetZap = await OffsetZap.deploy(polygonContractAddress);
  await offsetZap.deployed();
  console.log("Base Contract (OffsetZap) deployed to:", offsetZap.address);
  return offsetZap;
}

async function main() {
  // deployBasePolygonBridge();
  /*
  const polygonContractAddress = process.env.POLYGON_CONTRACT_ADDRESS;
  deployOffsetZapToBase(polygonContractAddress);
  */
  const deployedAddress = await deployCarbonBridgeToBase();
  console.log("deployCarbonBridgeToBase: deployedAddress", deployedAddress);
}

// Trigger the deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
