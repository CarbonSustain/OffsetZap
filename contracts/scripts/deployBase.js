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
    celoAlfaJores: {
      url: process.env.CELO_ALFAJORES_RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 44787,
    },
  },
};

async function deployCarbonBridgeToBase() {
  console.log("Deploying BaseCarbonBridge...");

  const BaseCarbonBridge = await ethers.getContractFactory("BaseCarbonBridge");
  const baseCarbonBridge = await BaseCarbonBridge.deploy();
  await baseCarbonBridge.waitForDeployment();

  const deployedAddress = baseCarbonBridge.target

  console.log("BaseCarbonBridge deployed at:", deployedAddress);

  const abi = BaseCarbonBridge.interface.formatJson(); // Ethers v6 ABI formatting

  // Optional: Save to disk
  fs.writeFileSync(
    path.join(__dirname, "BaseCarbonBridgeUpdatedAmoyDeployment.json"),
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

  const KlimaToPolygon = await ethers.getContractFactory("KlimaRetirementFacilitatorV2");
  console.log("KlimaToPolygon 1 :", KlimaToPolygon);
  const klimaToPolygon = await KlimaToPolygon.deploy();
  console.log("KlimaToPolygon 2 :", klimaToPolygon);
  await klimaToPolygon.waitForDeployment();
  console.log("deployKlimaToPolygon deployed at:", klimaToPolygon);

  const deployedAddress = klimaToPolygon.target;

  console.log("BaseCarbonBridge deployed at:", deployedAddress);

  const abi = KlimaToPolygon.interface.formatJson(); // Ethers v6 ABI formatting

  // Optional: Save to disk
  fs.writeFileSync(
    path.join(__dirname, "KlimaToPolygonV2Deployment.json"),
    JSON.stringify({ address: deployedAddress, abi }, null, 2)
  );

  return {
    address: deployedAddress,
    abi,
    contract: baseCarbonBridge,
  };
}

async function deployToucanToCelo() {
  console.log("Deploying deployToucanToCelo...");

  const ToucanToCelo = await ethers.getContractFactory("CarbonRetirementFacilitatorCeloUpgradeable");
  console.log("ToucanToCelo 1 :", ToucanToCelo);
  const toucanToCelo = await ToucanToCelo.deploy();
  console.log("ToucanToCelo 2 :", toucanToCelo);
  await toucanToCelo.waitForDeployment();
  console.log("deployToucanToCelo deployed at:", toucanToCelo);

  const deployedAddress = toucanToCelo.target;

  console.log("BaseCarbonBridge deployed at:", deployedAddress);

  const abi = ToucanToCelo.interface.formatJson(); // Ethers v6 ABI formatting

  // Optional: Save to disk
  fs.writeFileSync(
    path.join(__dirname, "ToucanToCeloDeployment.json"),
    JSON.stringify({ address: deployedAddress, abi }, null, 2)
  );

  return {
    address: deployedAddress,
    abi,
    contract: toucanToCelo,
  };
}

async function deployToucanToPolygon() {
  console.log("Deploying deployToucanToPolygon...");

  const ToucanToPolygon = await ethers.getContractFactory("PolygonCarbonRetirementFacilitator");
  console.log("ToucanToPolygon 1 :", ToucanToPolygon);
  const toucanToPolygon = await ToucanToPolygon.deploy();
  console.log("ToucanToPolygon 2 :", toucanToPolygon);
  await toucanToPolygon.waitForDeployment();
  console.log("deployToucanToPolygon deployed at:", toucanToPolygon);

  const deployedAddress = toucanToPolygon.target;

  console.log("BaseCarbonBridge deployed at:", deployedAddress);

  const abi = ToucanToPolygon.interface.formatJson(); // Ethers v6 ABI formatting

  // Optional: Save to disk
  fs.writeFileSync(
    path.join(__dirname, "ToucanToPolygonDeployment.json"),
    JSON.stringify({ address: deployedAddress, abi }, null, 2)
  );

  return {
    address: deployedAddress,
    abi,
    contract: toucanToPolygon,
  };
}

async function deployklimadaoToPolygon() {
  console.log("Deploying deployklimadaoToPolygon...");

  const KlimadaoToPolygon = await ethers.getContractFactory("AcrossCarbonRetirementReceiver");
  console.log("KlimadaoToPolygon 1 :", KlimadaoToPolygon);
  const klimadaoToPolygon = await KlimadaoToPolygon.deploy();
  console.log("KlimadaoToPolygon 2 :", klimadaoToPolygon);
  await klimadaoToPolygon.waitForDeployment();
  console.log("deployklimadaoToPolygon deployed at:", klimadaoToPolygon);

  const deployedAddress = klimadaoToPolygon.target;

  console.log("deployklimadaoToPolygon deployed at:", deployedAddress);

  const abi = KlimadaoToPolygon.interface.formatJson(); // Ethers v6 ABI formatting

  // Optional: Save to disk
  fs.writeFileSync(
    path.join(__dirname, "KlimadaoToPolygonDeployment.json"),
    JSON.stringify({ address: deployedAddress, abi }, null, 2)
  );

  return {
    address: deployedAddress,
    abi,
    contract: klimadaoToPolygon,
  };
}

async function main() {
  // const deployedAddress = await deployCarbonBridgeToBase();
  // console.log("deployCarbonBridgeToBase: deployedAddress", deployedAddress);

  // const deployedAddress = await deployKlimaToPolygon();
  // console.log("deployKlimaToPolygon: deployedAddress", deployedAddress);

  // const deployedAddress = await deployToucanToCelo();
  // console.log("deployToucanToCelo: deployedAddress", deployedAddress);

  // const deployedAddress = await deployToucanToPolygon();
  // console.log("deployToucanToPolygon: deployedAddress", deployedAddress);

  const deployedAddress = await deployklimadaoToPolygon();
  console.log("deployklimadaoToPolygon: deployedAddress", deployedAddress);
}

// Trigger the deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
