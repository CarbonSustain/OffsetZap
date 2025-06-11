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
      url: process.env.ALCHEMY_API,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 80001,
    },
    polygonAmoy: {
      url: process.env.POLYGON_RPC_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 80002,
    },
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC_URL,
      accounts: [`0x${process.env.PRIVATE_KEY_2}`],
      chainId: 137,
    },
    base: {
      url: process.env.BASE_SEPOLIA_RPC_URL,
      accounts: [`0x${process.env.PRIVATE_KEY_2}`],
      chainId: 84532,
    },
    celoAlfaJores: {
      url: process.env.CELO_ALFAJORES_RPC_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      chainId: 44787,
    },
    // Hedera Mainnet
    hederaMainnet: {
      url: process.env.HEDERA_MAINNET_RPC_URL,
      accounts: [`${process.env.PRIVATE_KEY_HEDERA}`],
      chainId: 295,
    },
    // Hedera Testnet
    hederaTestnet: {
      url: process.env.HEDERA_TESTNET_RPC_URL,
      accounts: [`${process.env.PRIVATE_KEY_HEDERA}`],
      chainId: 296,
    },
    // Hedera Previewnet
    hederaPreviewnet: {
      url: process.env.HEDERA_PREVIEWNET_RPC_URL,
      accounts: [`${process.env.PRIVATE_KEY_HEDERA}`],
      chainId: 297,
    },
  },
};
