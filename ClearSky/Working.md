// One-time set up and deploy the pool contract and token

cd offsetzap/clearsky
npx hardhat clean
npx hardhat compile
node deployPoolv3.js
node initializaPoolV3.js



// For every user txn
// adding liquidity to the pool
1. node associateTokenV3.js //associates the user's address to the CSLP token
2. node testPoolv3.js //adds liquity to the pool


