// One-time set up and deploy the pool contract and token

cd OffsetZap/Clearsky
npx hardhat clean
npx hardhat compile
node deployFactory.js

Before compiling or deploying, check for:
npm i -D @openzeppelin/contracts@5

// To check contract sizes

node -e 'const a=require("./artifacts/contracts/ClearSkyFactory.sol/ClearSkyFactory.json"); console.log("bytes:", a.deployedBytecode.length/2)'

node -e 'const a=require("./artifacts/contracts/SeriesVault.sol/SeriesVault.json"); console.log("bytes:", a.deployedBytecode.length/2)'

node -e 'const a=require("./artifacts/contracts/ClearSkyLiquidityPoolV3.sol/ClearSkyLiquidityPoolV3.json"); console.log("bytes:", a.deployedBytecode.length/2)'

Should be < 24,576 bytes