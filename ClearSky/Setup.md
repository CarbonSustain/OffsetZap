// Hashpack accounts required

1. Admin account - Main ClearSky account; Used for contract deployment and treasury for CSLPs. Create account from https://portal.hedera.com to get both OPERATOR_KEY and PRIVATE_KEY from dashboard. 
env variables: REACT_APP_CLEARSKY_ACCOUNT, OPERATOR_ID, OPERATOR_KEY, PRIVATE_KEY

2. CDR HBAR account - Account to receive HBAR while retiring carbon credit on carbonmark. ONLY holds HBAR
env variables: REACT_APP_RETIREMENT_OFFSET_ACCOUNT_ID

3. Beneficiery Account - Account to set as beneiciary address while retiring carbon credits. 
env variables: REACT_APP_CARBONMARK_BENEFICIARY_ADDRESS


// One-time set up and deploy the pool contract and token

cd OffsetZap/ClearSky

1. Before compiling or deploying, check for: npm i -D @openzeppelin/contracts@5
2. npx hardhat clean
3. npx hardhat compile
4. node deployFactory.js
5. node deployCDR.js

// Then start the relayer

cd OffsetZap/ClearSky/contracts/CDR
node relayer.js


// To check contract sizes

node -e 'const a=require("./artifacts/contracts/CONTRACT_NAME.sol/CONTRACT_NAME.json"); console.log("bytes:", a.deployedBytecode.length/2)'
(Size should be < 24,576 bytes for it to successfully deploy)