// One-time set up and deploy the pool contract and token

cd OffsetZap/Clearsky
npx hardhat clean
npx hardhat compile
node deployPoolV3.js
node initializePoolV3.js

// Repopulate database with new values from deployment of pool contract
cd clearsky-backend/scripts
node seed-liquidity-pools.js 

// For every user txn
// adding liquidity to the pool
1. node associateTokenV3.js //associates the user's address to the CSLP token
2. node testPoolv3.js //adds liquity to the pool


