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

async function deployCarbonOffsetToPolygon() {
  // Step 2: Deploy the Polygon Contract (CarbonOffset.sol)
  console.log("Deploying the Polygon Contract (CarbonOffset.sol)...");
  // Get contract factory for CarbonOffset
  const CarbonOffset = await ethers.getContractFactory("CarbonOffset");
  const bctTokenAddress = process.env.BCT_TOKEN_ADDRESS; // Replace with the address of the BCT token
  const klimaRetireContractAddress = process.env.KLIMA_RETIRE_CONTRACT_ADDRESS; // Replace with the address of the KlimaRetire contract
  const carbonOffset = await CarbonOffset.deploy(bctTokenAddress, klimaRetireContractAddress);
  await carbonOffset.deployed();
  console.log("Polygon Contract (CarbonOffset) deployed to:", carbonOffset.address);
  // Optional: Call a method from the deployed Base contract (e.g., send ETH or USDC to the Polygon contract)
  // Example: Send ETH from the Base contract (OffsetZap) to the Polygon contract (CarbonOffset)
  const tx2 = await offsetZap.forwardToPolygon(ethers.utils.parseEther("0.01")); // Example of sending 0.1 ETH to the Polygon contract
  await tx2.wait();
  console.log("Forwarded funds to Polygon contract from Base contract.");
  return carbonOffset.address;
}

async function main() {
  const carbonOffsetAddress = deployCarbonOffsetToPolygon();
  console.log("carbonOffsetAddress:", carbonOffsetAddress);
}

// Trigger the deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
