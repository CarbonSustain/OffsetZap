require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.18" },
      { version: "0.8.20" },
      { version: "0.8.28" },
    ],
  },
  networks: {
    mumbai: {
      url: `https://rpc-mumbai.maticvigil.com`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 80001,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 137,
    },
    base: {
      url: process.env.BASE_SEPOLIA_RPC_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 84532,
    },
  },
}