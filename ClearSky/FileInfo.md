1. deployFactory.js
Deploys the following contracts: ClearSkyFactory, FCDR1155, SeriesVault, Orderbook. Generates clearsky-factory-deployment.json

2. deployCDR.js
Deploys HbarOffset contract. Generates clearsky-cdr-deployment.json

3. CreateCSLPToken.js
Called from the frontend to create a new CSLP token via an API call. Placed in OffsetZap instead of clearsky-frontend since the script uses sensitive information about admin account. 

4. testOffset.js
Creates a dummy Offset request with sample data and calls requestOffset() in HbarOffset.sol to test the relayer and CarbonMark API calls. 

5. initSeriesToken.js
Initialises series NFT. This is now carried out in deployFactory.js 