import { ethers } from 'ethers';
import { createAcrossClient } from '@across-protocol/app-sdk';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

// Constants
const BASE_CHAIN_ID = 8453;
const POLYGON_CHAIN_ID = 137;
const POLYGON_AMOY_CHAIN_ID = 10109; // Polygon Amoy testnet chain ID

// Facilitator contract on Polygon that will handle the retirement
const FACILITATOR_ADDRESS = '0x1358a1b9a4F6Cb95e7df2D5E7303C6c2f96D6516';

// Across multicall handler on Polygon
const ACROSS_MULTICALL_HANDLER = '0x924a9f036260DdD5808007E1AA95f08eD08aA569';

// Token addresses
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Polygon Amoy gas price settings
const POLYGON_AMOY_GAS_SETTINGS = {
  maxFeePerGas: ethers.parseUnits("30", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("25", "gwei")
};

// Create Express app
const app = express();

// Configure CORS to allow requests from any origin during development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// Global client instance
let acrossClient = null;

// Initialize Across client
function initAcrossClient() {
  if (!acrossClient) {
    console.log('Initializing Across client...');
    acrossClient = createAcrossClient({
      integratorId: '0x4f66', // OffsetZap integrator ID
      chains: [BASE_CHAIN_ID, POLYGON_CHAIN_ID],
    });
    console.log('Across client initialized successfully');
  }
  return acrossClient;
}

// Helper function to encode retirement call
function encodeRetirementCall(params, amount) {
  // Create a JSON message with retirement parameters
  const jsonMessage = JSON.stringify({
    beneficiaryAddress: params.beneficiaryAddress,
    beneficiaryName: params.beneficiaryName,
    retirementMessage: params.retirementMessage,
    poolToken: params.poolToken
  });
  
  // Convert to hex
  const retirementParamsHex = '0x' + Buffer.from(jsonMessage).toString('hex');
  
  // Encode the facilitator's retirement function call
  const facilitatorInterface = new ethers.Interface([
    'function handleCarbonRetirement(address beneficiary, uint256 amount, bytes message) external'
  ]);
  
  return facilitatorInterface.encodeFunctionData('handleCarbonRetirement', [
    params.beneficiaryAddress,
    amount,
    retirementParamsHex
  ]);
}

// Helper function to update multicall with exact output amount
function updateMulticallWithExactOutput(messages, exactOutputAmount) {
  // Clone the original messages
  const updatedMessages = JSON.parse(JSON.stringify(messages));
  
  // Update the calldata with the exact output amount
  // This is a simplified version - in a real implementation, you would decode
  // the original calldata, update the amount parameter, and re-encode it
  
  return updatedMessages;
}

// Get quote endpoint
app.post('/api/quote', async (req, res) => {
  try {
    const { amountStr, beneficiaryName, beneficiaryAddress, poolToken, userAddress } = req.body;
    console.log('Quote request received:', req.body);
    
    // Parse and validate amount
    if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid amount' });
    }
    
    const amount = ethers.parseUnits(amountStr, 6); // USDC has 6 decimals
    
    console.log('Requesting quote for:', {
      amount: amount.toString(),
      beneficiaryName,
      beneficiaryAddress,
      poolToken,
      userAddress
    });
    
    // Prepare retirement parameters
    const retirementParams = {
      beneficiaryAddress: beneficiaryAddress || userAddress,
      beneficiaryName: beneficiaryName || 'OffsetZap User',
      retirementMessage: `Carbon retired via OffsetZap using Across Protocol`,
      poolToken: poolToken || 'klima_bct'
    };
    
    // Encode the retirement call for the facilitator contract
    const retirementCalldata = encodeRetirementCall(retirementParams, amount);
    
    // Create multicall message for the facilitator
    const multicallMessages = [
      {
        target: FACILITATOR_ADDRESS,
        callData: retirementCalldata,
        value: '0'
      }
    ];
    
    // Determine if we're using Polygon Mainnet or Amoy testnet
    // For this implementation, we'll use Polygon Mainnet, but code is ready for Amoy
    const destinationChainId = POLYGON_CHAIN_ID; // Can be changed to POLYGON_AMOY_CHAIN_ID for testnet
    const destinationUSDC = USDC_POLYGON; // Would need to be updated for Amoy testnet
    
    // Request quote from Across
    const quote = await acrossClient.getQuote({
      fromChainId: BASE_CHAIN_ID,
      toChainId: destinationChainId,
      fromToken: USDC_BASE,
      toToken: destinationUSDC,
      amount: amount.toString(),
      fromAddress: userAddress,
      toAddress: ACROSS_MULTICALL_HANDLER,
      multicallMessages
    });
    
    // Extract the exact output amount
    const exactOutputAmount = quote.outputAmount;
    
    // Update the multicall messages with the exact output amount
    const updatedMulticallMessages = updateMulticallWithExactOutput(
      multicallMessages,
      exactOutputAmount
    );
    
    // Get updated quote with the updated multicall messages
    const updatedQuote = await acrossClient.getQuote({
      fromChainId: BASE_CHAIN_ID,
      toChainId: destinationChainId,
      fromToken: USDC_BASE,
      toToken: destinationUSDC,
      amount: amount.toString(),
      fromAddress: userAddress,
      toAddress: ACROSS_MULTICALL_HANDLER,
      multicallMessages: updatedMulticallMessages
    });
    
    // Get route information
    const route = await acrossClient.getRoute(updatedQuote);
    
    console.log('Quote received:', {
      depositAmount: updatedQuote.deposit.inputAmount,
      outputAmount: updatedQuote.outputAmount,
      route: route.routeType
    });
    
    // Add gas settings for Polygon Amoy if that's the destination
    let gasSettings = null;
    if (destinationChainId === POLYGON_AMOY_CHAIN_ID) {
      gasSettings = POLYGON_AMOY_GAS_SETTINGS;
    }
    
    // Return the quote, route, and gas settings to the frontend
    res.json({
      success: true,
      quote: updatedQuote,
      route,
      gasSettings,
      destinationChainId
    });
  } catch (err) {
    console.error('Error in /api/quote endpoint:', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Across backend server running on port ${PORT}`);
  initAcrossClient(); // Initialize client on startup
});

export default app;
