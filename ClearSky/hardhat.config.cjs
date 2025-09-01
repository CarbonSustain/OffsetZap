require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // Hedera Testnet
    hederaTestnet: {
      url: process.env.HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 296,
      gas: 8000000,
      gasPrice: 1000000000, // 1 gwei
    },
    // Hedera Mainnet
    hederaMainnet: {
      url: process.env.HEDERA_MAINNET_RPC_URL || "https://mainnet.hashio.io/api",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 295,
      gas: 8000000,
      gasPrice: 1000000000, // 1 gwei
    },
    // Local development
    hardhat: {
      chainId: 1337,
      gas: 8000000,
      gasPrice: 1000000000,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
  etherscan: {
    // Hedera doesn't have Etherscan, but we keep this for compatibility
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
}; 