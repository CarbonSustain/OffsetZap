require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.20",
  networks: {
    base_sepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL,  // e.g., from Alchemy or Infura
      accounts: [process.env.PRIVATE_KEY]     // from MetaMask or Smart Wallet
    }
  }
};
