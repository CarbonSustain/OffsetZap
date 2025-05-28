require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    mumbai: {
      url: process.env.POLYGON_RPC_URL,
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
};
