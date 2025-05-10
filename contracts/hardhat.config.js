require("@nomiclabs/hardhat-ethers");

module.exports = {
  solidity: "0.8.18",
  networks: {
    base: {
      url: "https://base-goerli.blockpi.network/v1/rpc/public",
      accounts: [process.env.PRIVATE_KEY]
    },
    polygon: {
      url: "https://polygon-mumbai.g.alchemy.com/v2/YOUR_ALCHEMY_KEY",
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
