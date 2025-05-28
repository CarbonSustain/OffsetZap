require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

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

  // Get the contract factory
  const BaseCarbonBridge = await ethers.getContractFactory("BaseCarbonBridge");

  // Deploy the contract with the Polygon contract address as a constructor argument
  const baseCarbonBridge = await BaseCarbonBridge.deploy();

  // Wait for the contract to be deployed
  await baseCarbonBridge.deployed();

  console.log("BaseCarbonBridge deployed at:", baseCarbonBridge.address);

  return baseCarbonBridge.address; // Optional: return address for further use
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
  const offsetZap = await deployCarbonBridgeToBase();

  console.log("deployCarbonBridgeToBase: address ", offsetZap.address);
  console.log("deployCarbonBridgeToBase: abi", offsetZap.abi);
  console.log("deployCarbonBridgeToBase: offsetZap", offsetZap);
}

// Trigger the deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
