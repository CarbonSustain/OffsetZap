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

async function deployMockBridge() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  const Contract = await ethers.getContractFactory("MockBridge");
  console.log("Deploying MockBridge contract...");
  const contract = await Contract.deploy();
  await contract.deployed();
  console.log("MockBridge contract deployed to:", contract.address);
  // Optional: Interact with the contract (if needed)
  const tx = await contract.sendMessageToPolygon("Hello, Polygon!");
  await tx.wait();
  console.log("Message sent to Polygon:", tx.hash);
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
}

async function main() {
  // deployMockBridge();
  const polygonContractAddress = process.env.POLYGON_CONTRACT_ADDRESS;
  deployOffsetZapToBase(polygonContractAddress);
  console.log("deployOffsetZapToBase Polygon contract address set in OffsetZap:", polygonContractAddress);
}

// Trigger the deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
