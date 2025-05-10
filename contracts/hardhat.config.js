require("@nomiclabs/hardhat-ethers");

module.exports = {
  solidity: "0.8.18",
  networks: {
    base: {
      url: "https://base-goerli.blockpi.network/v1/rpc/public",
      accounts: [process.env.PRIVATE_KEY],
    },
    polygon: {
      url: process.env.ALCHEMY_API,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
