/**
 * Across Protocol Integration Module
 * 
 * This module provides functionality for bridging tokens from Base to Polygon mainnet
 * using the Across Protocol. It supports bridging ETH or USDC from Base to carbon tokens on Polygon.
 */

import { createAcrossClient } from "@across-protocol/app-sdk";
import { parseEther, parseUnits } from "viem";
import { base, polygon } from "viem/chains";
import { DEFAULT_FEE_SETTINGS, generateFeeMessage } from "./fee-handler.js";

// -----------------------------------------------------------------------
// Constants and Configuration
// -----------------------------------------------------------------------

/**
 * Chain IDs for Across Protocol
 */
export const ACROSS_CHAIN_IDS = {
  BASE_SEPOLIA: 84532,     // Base Sepolia chain ID
  POLYGON_AMOY: 80002,     // Polygon Amoy chain ID
  POLYGON: 137,           // Polygon chain ID
  BASE: 8453            // Base chain ID
};

/**
 * Klima Retirement Facilitator contract address on Polygon
 * This is the contract that will receive the bridged USDC and perform the carbon retirement
 */
export const KLIMA_RETIREMENT_FACILITATOR = "0xc8A7eF66A708D1Bb4A447444687321CED6287F9c";
export const KLIMA_AGGREGATOR_DIAMOND_ADDRESS = "0x8cE54d9625371fb2a068986d32C85De8E6e995f8";

/**
 * Token addresses for supported chains
 */
export const TOKEN_ADDRESSES = {
  // Base Sepolia (origin chain)
  [ACROSS_CHAIN_IDS.BASE_SEPOLIA]: {
    // ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Special Across ETH address
    USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // USDC on Base Sepolia
  },
  // Polygon Amoy (destination chain)
  [ACROSS_CHAIN_IDS.POLYGON_AMOY]: {
    // Output token on Polygon Amoy
    USDC: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582", // USDC on Polygon Amoy
    // Native token for operations
    MATIC: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" // Native MATIC token
  },
  // Polygon (destination chain)
  [ACROSS_CHAIN_IDS.POLYGON]: {
    // Output token on Polygon
    USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e on Polygon
    // Native token for operations
    POL: "0x0000000000000000000000000000000000001010" // Native POL token
  },
  // Base (origin chain)
  [ACROSS_CHAIN_IDS.BASE]: {
    // Output token on Base
    // ETH: "0x4200000000000000000000000000000000000006", // ETH address on Base
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  }
};

// -----------------------------------------------------------------------
// Across Protocol Client
// -----------------------------------------------------------------------

let acrossClient = null;

/**
 * Initialize the Across Protocol client with the specified integrator ID
 * @param {string} integratorId - The integrator ID to use for the Across client
 * @returns {boolean} - Whether the initialization was successful
 */
export function initializeAcross(integratorId = "0x1234") {
  try {
    console.log("Initializing Across client with integrator ID:", integratorId);
    
    // Define the chains we want to support
    const baseMainnet = {
      id: ACROSS_CHAIN_IDS.BASE,
      name: "Base",
      rpcUrl: "https://mainnet.base.org",
      explorerUrl: "https://basescan.org",
      tokens: {
        // ETH: {
        //   address: TOKEN_ADDRESSES[ACROSS_CHAIN_IDS.BASE].ETH,
        //   decimals: 18,
        //   symbol: "ETH",
        //   name: "Ethereum"
        // },
        USDC: {
          address: TOKEN_ADDRESSES[ACROSS_CHAIN_IDS.BASE].USDC,
          decimals: 6,
          symbol: "USDC",
          name: "USD Coin"
        }
      }
    };
    
    const polygonMainnet = {
      id: ACROSS_CHAIN_IDS.POLYGON,
      name: "Polygon",
      rpcUrl: "https://polygon-rpc.com",
      explorerUrl: "https://polygonscan.com",
      tokens: {
        USDC: {
          address: TOKEN_ADDRESSES[ACROSS_CHAIN_IDS.POLYGON].USDC,
          decimals: 6,
          symbol: "USDC",
          name: "USD Coin"
        },
        POL: {
          address: TOKEN_ADDRESSES[ACROSS_CHAIN_IDS.POLYGON].POL,
          decimals: 18,
          symbol: "POL",
          name: "Polygon"
        }
      }
    };
    
    // Create the Across client with our supported chains
    acrossClient = createAcrossClient({
      integratorId: integratorId,
      chains: [base, polygon],
      //chains: [baseMainnet, polygonMainnet]
    });
    
    console.log("Across client initialized successfully");
    return true;
  } catch (error) {
    console.error("Failed to initialize Across client:", error);
    return false;
  }
}

/**
 * Helper function to get token address by chain ID and symbol
 * @param {number} chainId - The chain ID
 * @param {string} symbol - The token symbol
 * @returns {string} - The token address
 */
export function getTokenAddress(chainId, symbol) {
  if (!TOKEN_ADDRESSES[chainId]) {
    throw new Error(`Chain ID ${chainId} not supported`);
  }
  
  if (!TOKEN_ADDRESSES[chainId][symbol]) {
    throw new Error(`Token symbol ${symbol} not supported on chain ${chainId}`);
  }
  
  return TOKEN_ADDRESSES[chainId][symbol];
}

/**
 * Helper function to get the Polygon USDC address
 * @returns {string} - The Polygon USDC address
 */
export function getPolygonUSDCAddress() {
  return TOKEN_ADDRESSES[ACROSS_CHAIN_IDS.POLYGON].USDC;
}

/**
 * Get the list of supported input tokens for bridging
 * @returns {string[]} - Array of supported token symbols
 */
export function getSupportedInputTokens() {
  // Currently we only support ETH and USDC from Base
  return ["USDC"];
}

/**
 * Create a message for the retirement transaction
 * @param {string} sender - The sender address
 * @param {string|bigint} amount - The amount to retire
 * @param {string} beneficiary - The beneficiary address
 * @param {string} poolTokenAddress - The pool token address
 * @param {string} beneficiaryName - The beneficiary name
 * @returns {string} - The encoded message for handleAcrossTransfer
 */
export function createRetirementMessage(sender, amount, beneficiary, poolTokenAddress, beneficiaryName = "OffsetZap User") {
  // Create a message with retirement parameters that the contract can decode
  const message = {
    beneficiary,
    beneficiaryName,
    poolToken: poolTokenAddress
  };
  
  // Convert to JSON string and then to hex using TextEncoder (browser compatible)
  const jsonMessage = JSON.stringify(message);
  console.log("Retirement message JSON:", jsonMessage);
  
  // Convert to hex format
  const messageHex = '0x' + Array.from(new TextEncoder().encode(jsonMessage))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  console.log("Retirement message hex:", messageHex);
  return messageHex;
}

/**
 * Get a quote for bridging tokens from Base to Polygon
 * @param {Object} params - The quote parameters
 * @param {string} params.inputTokenSymbol - The input token symbol
 * @param {string|number} params.amount - The amount to bridge
 * @param {string} [params.recipient] - Optional recipient address
 * @param {string} params.beneficiaryName - The beneficiary name
 * @returns {Promise<Object>} - The quote object
 */
export async function getAcrossQuoteBySymbol(inputTokenSymbol, amount, recipient, beneficiaryName) {
  console.log(`Getting Across quote for ${amount} ${inputTokenSymbol}`);
  
  if (!acrossClient) {
    console.error("Across client not initialized");
    return null;
  }
  
  try {
    // Get chain IDs and token addresses
    const originChainId = ACROSS_CHAIN_IDS.BASE;
    const destinationChainId = ACROSS_CHAIN_IDS.POLYGON;
    const inputToken = getTokenAddress(originChainId, inputTokenSymbol);
    const outputToken = getPolygonUSDCAddress();
    // Always use the Klima contract address as recipient
    const klimaContractAddress = "0xAa84Ef9CB72641E14A0453757fB908c7c950C2f2";
    
    console.log("Getting Across quote with parameters:", {
      originChainId,
      destinationChainId,
      inputToken,
      outputToken,
      amount,
      recipient: klimaContractAddress, // Always use the Klima contract as recipient
      beneficiaryName
    });
    
    // Format the amount based on the token type
    const inputAmount = inputTokenSymbol === "ETH" 
      ? parseEther(amount.toString())
      : parseUnits(amount.toString(), 6); // USDC has 6 decimals
    
    // Create a route object as expected by the Across SDK
    const route = {
      originChainId,
      destinationChainId,
      inputToken,
      outputToken
    };
    
    // Get the quote directly from the Across client using the route object
    const quote = await acrossClient.getQuote({
      route,
      inputAmount,
      recipient: klimaContractAddress, // Always use the Klima contract as recipient
      beneficiaryName
    });
    
    console.log("Received quote from Across:", quote);
    return quote;
  } catch (error) {
    console.error("Failed to get Across quote:", error);
    throw error;
  }
}

/**
 * Wrapper function for getAcrossQuoteBySymbol
 * @param {Object} params - Parameters for the quote
 * @param {string} params.inputTokenSymbol - The input token symbol
 * @param {string|number} params.amount - The amount to bridge
 * @param {string} [params.recipient] - Optional recipient address
 * @param {string} [params.beneficiaryName] - Optional beneficiary name
 * @returns {Promise<Object>} - The quote object
 */
export async function getAcrossQuote(params) {
  return getAcrossQuoteBySymbol(
    params.inputTokenSymbol, 
    params.amount, 
    params.recipient, 
    params.beneficiaryName || 'OffsetZap User'
  );
}

/**
 * Execute a bridge transaction using the Across Protocol
 * @param {Object} quote - The quote object
 * @param {Object} walletClient - The wallet client
 * @param {string} carbonType - The carbon token type
 * @param {string} beneficiary - The beneficiary address
 * @param {string} poolTokenAddress - The pool token address
 * @param {Function} [onProgress] - Optional progress callback
 * @param {Object} [feeOptions] - Optional fee configuration
 * @returns {Promise<Object>} - The transaction result
 */

/**
 * Call the retireWithUsdc function on the KlimaRetirementFacilitator contract
 * @param {Object} provider - The ethers provider with signer
 * @param {string} usdcAmount - The USDC amount to retire
 * @param {string} beneficiaryName - The name of the beneficiary
 * @param {string} beneficiaryAddress - The address of the beneficiary
 * @param {string} poolTokenAddress - The pool token address
 * @param {Function} onProgress - Optional callback for progress updates
 * @returns {Promise<Object>} - The transaction result
 */
export async function callRetireWithUsdc(provider, usdcAmount, beneficiaryName, beneficiaryAddress, poolTokenAddress, onProgress = null) {
  try {
    console.log("Calling retireExactSourceDefault on Klima Aggregator Diamond with parameters:", {
      aggregatorAddress: KLIMA_AGGREGATOR_DIAMOND_ADDRESS,
      usdcAmount,
      beneficiaryName,
      beneficiaryAddress,
      poolTokenAddress
    });
    
    // Import ethers for contract interaction
    const { ethers } = await import('ethers');
    
    // Create contract interface for the Klima Aggregator Diamond
    const aggregatorContract = new ethers.Contract(
      KLIMA_AGGREGATOR_DIAMOND_ADDRESS,
      [{"anonymous":false,"inputs":[{"indexed":false,"internalType":"enum LibRetire.CarbonBridge","name":"carbonBridge","type":"uint8"},{"indexed":true,"internalType":"address","name":"retiringAddress","type":"address"},{"indexed":false,"internalType":"string","name":"retiringEntityString","type":"string"},{"indexed":true,"internalType":"address","name":"beneficiaryAddress","type":"address"},{"indexed":false,"internalType":"string","name":"beneficiaryString","type":"string"},{"indexed":false,"internalType":"string","name":"retirementMessage","type":"string"},{"indexed":true,"internalType":"address","name":"carbonPool","type":"address"},{"indexed":false,"internalType":"address","name":"poolToken","type":"address"},{"indexed":false,"internalType":"uint256","name":"retiredAmount","type":"uint256"}],"name":"CarbonRetired","type":"event"},{"inputs":[{"internalType":"address","name":"sourceToken","type":"address"},{"internalType":"address","name":"poolToken","type":"address"},{"internalType":"uint256","name":"maxAmountIn","type":"uint256"},{"internalType":"string","name":"retiringEntityString","type":"string"},{"internalType":"address","name":"beneficiaryAddress","type":"address"},{"internalType":"string","name":"beneficiaryString","type":"string"},{"internalType":"string","name":"retirementMessage","type":"string"},{"internalType":"enum LibTransfer.From","name":"fromMode","type":"uint8"}],"name":"retireExactSourceDefault","outputs":[{"internalType":"uint256","name":"retirementIndex","type":"uint256"}],"stateMutability":"payable","type":"function"},{"inputs":[{"internalType":"address","name":"sourceToken","type":"address"},{"internalType":"address","name":"poolToken","type":"address"},{"internalType":"address","name":"projectToken","type":"address"},{"internalType":"uint256","name":"maxAmountIn","type":"uint256"},{"internalType":"string","name":"retiringEntityString","type":"string"},{"internalType":"address","name":"beneficiaryAddress","type":"address"},{"internalType":"string","name":"beneficiaryString","type":"string"},{"internalType":"string","name":"retirementMessage","type":"string"},{"internalType":"enum LibTransfer.From","name":"fromMode","type":"uint8"}],"name":"retireExactSourceSpecific","outputs":[{"internalType":"uint256","name":"retirementIndex","type":"uint256"}],"stateMutability":"payable","type":"function"}],
      provider.getSigner()
    );
    
    // Create USDC contract interface to monitor transfers
    const usdcAddress = getPolygonUSDCAddress();
    const usdcContract = new ethers.Contract(
      usdcAddress,
      [
        "event Transfer(address indexed from, address indexed to, uint256 value)",
        "function decimals() view returns (uint8)"
      ],
      provider
    );
    
    // Get USDC decimals for formatting
    const decimals = await usdcContract.decimals();
    
    // Notify of transaction start
    if (onProgress) {
      onProgress({
        type: 'retirement',
        status: 'pending',
        message: 'Preparing retirement transaction...'
      });
    }
    
    // Ensure all values are properly defined and formatted
    const safeUsdcAmount = usdcAmount ? usdcAmount.toString() : '0';
    const safeBeneficiaryName = beneficiaryName || "OffsetZap User";
    const safeBeneficiaryAddress = beneficiaryAddress || provider.getSigner().getAddress();
    const safePoolTokenAddress = poolTokenAddress || "0x0000000000000000000000000000000000000000";
    
    console.log("Safe parameters for retirement:", {
      safeUsdcAmount,
      safeBeneficiaryName,
      safeBeneficiaryAddress,
      safePoolTokenAddress
    });
    
    // Call the retireExactSourceDefaul t function
    const tx = await aggregatorContract.retireExactSourceDefault(
      usdcAddress, // sourceToken
      safePoolTokenAddress, // poolToken
      safeUsdcAmount, // maxAmountIn
      safeBeneficiaryName, // retiringEntityString
      safeBeneficiaryAddress, // beneficiaryAddress
      safeBeneficiaryName, // beneficiaryString
      "Carbon retirement via OffsetZap", // retirementMessage
      0, // fromMode
      {
        gasLimit: 1500000,
        gasPrice: await provider.getGasPrice()
      }
    );
    
    console.log("retireExactSourceDefault transaction sent:", tx);
    
    // Notify that transaction is submitted
    if (onProgress) {
      onProgress({
        type: 'retirement',
        status: 'submitted',
        message: 'Retirement transaction submitted to blockchain',
        hash: tx.hash,
        explorerUrl: `https://polygonscan.com/tx/${tx.hash}`
      });
    }
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("retireExactSourceDefault transaction confirmed:", receipt);
    
    // Look for Transfer events in the receipt logs
    const transferEvents = receipt.logs
      .filter(log => {
        try {
          return log.address.toLowerCase() === usdcAddress.toLowerCase();
        } catch (e) {
          return false;
        }
      })
      .map(log => {
        try {
          return usdcContract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter(event => event && event.name === 'Transfer');
    
    // Extract transfer details if available
    let transferDetails = [];
    if (transferEvents.length > 0) {
      transferDetails = transferEvents.map(event => ({
        from: event.args.from,
        to: event.args.to,
        value: ethers.utils.formatUnits(event.args.value, decimals)
      }));
      console.log("USDC transfers detected:", transferDetails);
    }
    
    // Notify of transaction completion
    if (onProgress) {
      onProgress({
        type: 'retirement',
        status: receipt.status === 1 ? 'success' : 'failed',
        message: receipt.status === 1 
          ? `Successfully retired carbon credits for ${beneficiaryName || beneficiaryAddress}` 
          : 'Carbon retirement transaction failed',
        hash: receipt.transactionHash,
        explorerUrl: `https://polygonscan.com/tx/${receipt.transactionHash}`,
        transfers: transferDetails
      });
    }
    
    return {
      hash: receipt.transactionHash,
      status: receipt.status === 1 ? 'success' : 'failed',
      transfers: transferDetails
    };
  } catch (error) {
    console.error("Failed to call retireExactSourceDefault:", error);
    
    // Notify of error
    if (onProgress) {
      onProgress({
        type: 'retirement',
        status: 'error',
        message: `Retirement failed: ${error.message || 'Unknown error'}`
      });
    }
    
    throw error;
  }
}

/**
 * Execute an Across bridge transaction with retirement message
 * @param {Object} quote - The Across quote object
 * @param {Object} walletClient - The wallet client
 * @param {string} carbonType - The carbon type to retire
 * @param {string} beneficiary - The beneficiary address
 * @param {string} poolTokenAddress - The pool token address
 * @param {string} beneficiaryName - The beneficiary name
 * @param {Function} onProgress - Progress callback
 * @param {Object} feeOptions - Fee options
 * @returns {Promise<Object>} - The transaction result
 */
export async function executeAcrossBridge(quote, walletClient, carbonType, beneficiary, poolTokenAddress, onProgress, beneficiaryName = "OffsetZap User", feeOptions = {}) {
  if (!acrossClient) {
    throw new Error("Across client not initialized");
  }
  
  // Initialize transaction hash storage
  let storedTxHash = null;
  
  try {
    console.log("Executing Across bridge with parameters:", {
      carbonType,
      beneficiary,
      poolTokenAddress,
      outputAmount: quote.deposit.outputAmount
    });
    
    // Format the wallet client for Across SDK
    const formattedWalletClient = {
      account: {
        address: walletClient.address
      },
      chain: {
        id: ACROSS_CHAIN_IDS.BASE
      },
      getChainId: async () => {
        // For now, we'll return the Base chain ID directly
        // In a production app, you might want to get this from the provider
        return ACROSS_CHAIN_IDS.BASE;
      },
      writeContract: async (request) => {
        // Handle the writeContract method by encoding the function call
        console.log("writeContract request:", request);
        
        try {
          // Import ethers for ABI encoding
          const { ethers } = await import('ethers');
          let data;
          
          // Check if data is already provided
          if (request.data) {
            data = request.data;
            console.log("Using provided data:", data);
          }
          // If no data but we have functionName, abi, and args, encode it
          else if (request.functionName && request.abi && request.args) {
            console.log(`Encoding ${request.functionName} with provided ABI`);
            
            try {
              // Create interface from the provided ABI
              const iface = new ethers.utils.Interface(request.abi);
              
              // Convert any BigInt values to strings for encoding
              const processedArgs = request.args.map(arg => 
                typeof arg === 'bigint' ? arg.toString() : arg
              );
              
              // Encode the function call
              data = iface.encodeFunctionData(request.functionName, processedArgs);
              console.log(`Encoded ${request.functionName} data:`, data);
            } catch (encodeError) {
              console.error("Error encoding with provided ABI:", encodeError);
              throw encodeError;
            }
          }
          // Special case for common functions like approve
          else if (request.functionName === 'approve' && request.args) {
            console.log("Encoding approve function");
            
            // Create an interface for the ERC20 token
            const erc20Interface = new ethers.utils.Interface([
              'function approve(address spender, uint256 amount) returns (bool)'
            ]);
            
            // Encode the function call
            // Ensure the amount is properly defined before conversion
            const approvalAmount = request.args[1] !== undefined && request.args[1] !== null ? 
              request.args[1].toString() : '0';
            
            data = erc20Interface.encodeFunctionData('approve', [
              request.args[0],  // spender address
              approvalAmount  // amount (safely converted to string)
            ]);
            
            console.log("Encoded approval data:", data, "with amount:", approvalAmount);
          }
          // Special case for deposit function
          else if (request.functionName === 'deposit' && request.args) {
            console.log("Encoding deposit function");
            
            try {
              // The Across deposit function is complex, so we'll use a more complete ABI
              const depositInterface = new ethers.utils.Interface([
                'function deposit(tuple(address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, uint16 exclusivityEnforcer) deposit, bytes message)'
              ]);
              
              // Convert BigInt values to strings for encoding and handle undefined/null values
              const processedArgs = request.args.map(arg => {
                if (arg === undefined || arg === null) {
                  // Handle undefined/null arguments
                  return '0';
                } else if (typeof arg === 'bigint') {
                  return arg.toString();
                } else if (typeof arg === 'object' && arg !== null) {
                  // Handle nested objects like the deposit struct
                  const processed = {};
                  for (const key in arg) {
                    if (arg[key] === undefined || arg[key] === null) {
                      // Handle undefined/null values in objects
                      processed[key] = key.includes('Amount') || key.includes('ChainId') ? '0' : '';
                    } else {
                      processed[key] = typeof arg[key] === 'bigint' ? 
                        arg[key].toString() : arg[key];
                    }
                  }
                  return processed;
                }
                return arg;
              });
              
              // Log the processed arguments for debugging
              console.log("Processed deposit arguments:", JSON.stringify(processedArgs, null, 2));
              
              // Encode the function call
              data = depositInterface.encodeFunctionData('deposit', processedArgs);
              console.log("Encoded deposit data:", data);
            } catch (encodeError) {
              console.error("Error encoding deposit function:", encodeError);
              throw encodeError;
            }
          }
          
          if (!data) {
            console.error("Cannot encode transaction: missing data, ABI, or function details", request);
            throw new Error("Failed to encode transaction data");
          }
          
          // Prepare the transaction with manual gas limits
          const tx = {
            to: request.address,
            data: data,
            value: request.value || "0x0",
            gasLimit: 500000 // Set a manual gas limit that should be sufficient
          };
          
          console.log("Sending transaction with manual gas limit:", tx);
          return walletClient.sendTransaction(tx);
        } catch (error) {
          console.error("Error in writeContract:", error);
          throw error;
        }
      },
      ...walletClient
    };
    
    // Get the user's address from the wallet client
    console.log("Wallet client:", formattedWalletClient);
    const userAddress = formattedWalletClient.account.address;
    console.log("User address:", userAddress);
    
    // Set up fee collection parameters
    const {
      feePercentage = DEFAULT_FEE_SETTINGS.feePercentage,
      feeRecipientAddress = DEFAULT_FEE_SETTINGS.feeRecipientAddress,
      collectFee = true // Set to false to disable fee collection
    } = feeOptions;
    
    let message;
    
    // Determine which message to use based on whether we're collecting fees
    if (collectFee && feePercentage > 0) {
      console.log(`Collecting platform fee: ${feePercentage * 100}% to ${feeRecipientAddress}`);
      
      try {
        // Generate fee collection message
        message = generateFeeMessage(
          userAddress,
          quote.deposit.outputAmount,
          quote.deposit.outputToken,
          feeRecipientAddress,
          feePercentage
        );
        console.log("Generated fee message:", message);
      } catch (feeError) {
        console.error("Failed to generate fee message, falling back to retirement message:", feeError);
        // Fall back to retirement message
        message = createRetirementMessage(
          userAddress,
          quote.deposit.outputAmount,
          beneficiary,
          poolTokenAddress,
          beneficiaryName
        );
        console.log("Generated retirement message (fallback):", message);
      }
    } else {
      // Generate standard retirement message
      message = createRetirementMessage(
        userAddress,
        quote.deposit.outputAmount,
        beneficiary,
        poolTokenAddress,
        beneficiaryName
      );
      console.log("Generated retirement message:", message);
    }
    
    const depositWithMessage = {
      ...quote.deposit,
      message
    };
    
    console.log("Executing quote with deposit:", depositWithMessage);
    
    // Based on the Across SDK example, we should use executeQuote which handles both approval and deposit
    console.log("Executing quote with executeQuote...");
    
    // We're already tracking transaction hash at the top of the function
    
    try {
      // Create a custom wallet client wrapper to intercept and fix any issues
      const wrappedWalletClient = {
        ...formattedWalletClient,
        sendTransaction: async (tx) => {
          // Make sure all values are defined and properly formatted
          const safeTx = {
            ...tx,
            to: tx.to || formattedWalletClient.address,
            data: tx.data || '0x',
            // Ensure value is properly defined before any potential BigInt conversion
            value: tx.value !== undefined && tx.value !== null ? tx.value : '0x0',
            // Ensure gasLimit is properly defined
            gasLimit: tx.gasLimit || tx.gas || 500000
          };
          
          // Log the transaction for debugging
          console.log("Sending transaction with safe values:", safeTx);
          
          try {
            // Call the original sendTransaction
            const result = await formattedWalletClient.sendTransaction(safeTx);
            console.log("Transaction result:", result);
            
            // Store the hash for progress updates
            if (result && result.hash) {
              storedTxHash = result.hash;
              console.log("Transaction successful with hash:", storedTxHash);
            } else {
              console.warn("Transaction completed but no hash was returned");
            }
            
            return result;
          } catch (error) {
            console.error("Transaction error details:", {
              error: error.message,
              txData: safeTx
            });
            throw error;
          }
        }
      };
      
      // Use executeQuote which handles both approval and deposit transactions
      const result = await acrossClient.executeQuote({
        walletClient: wrappedWalletClient,
        deposit: depositWithMessage,
        infiniteApproval: true, // Use infinite approval to simplify future transactions
        overrides: {
          gasLimit: 500000, // Set a high gas limit for all transactions
          maxFeePerGas: undefined, // Let the wallet determine this
          maxPriorityFeePerGas: undefined // Let the wallet determine this
        },
        onProgress: (progress) => {
          console.log("Progress from acrossClient.executeQuote:", progress);
          
          try {
            // Handle each step specifically, similar to the test script
            if (progress.step === "approve" && progress.status === "txSuccess") {
              // Token approval successful
              const { txReceipt } = progress;
              console.log('Approval transaction successful with hash:', txReceipt.transactionHash);
            }
            
            if (progress.step === "deposit" && progress.status === "txSuccess") {
              // Deposit successful, store the transaction hash
              const { depositId, txReceipt } = progress;
              storedTxHash = txReceipt.transactionHash;
              console.log('Deposit transaction successful with hash:', storedTxHash);
              console.log('Deposit ID:', depositId);
            }
            
            if (progress.step === "fill" && progress.status === "txSuccess") {
              // Fill successful, check if cross-chain message was executed
              const { fillTxTimestamp, txReceipt, actionSuccess } = progress;
              console.log('Fill transaction successful with hash:', txReceipt.transactionHash);
              console.log('Fill timestamp:', fillTxTimestamp);
              console.log('Cross-chain action success:', actionSuccess);
            }
            
            // Pass the progress to the caller's callback if provided
            if (onProgress) {
              onProgress(progress);
            }
          } catch (innerError) {
            console.warn("Error in progress callback:", innerError);
            // Don't let callback errors break the flow
          }
        }
      });
      
      console.log("Execute quote result:", result);
      
      // Check if we have a fill transaction hash and if the cross-chain action was successful
      if (result && result.fillTxHash) {
        console.log("Fill transaction hash:", result.fillTxHash);
        console.log("Cross-chain action success:", result.actionSuccess !== false); // Default to true if undefined
        
        // If the cross-chain action failed, log a warning
        if (result.actionSuccess === false) {
          console.warn("Cross-chain message execution failed. The tokens may have been transferred but the retirement function was not called.");
        }
      }
      
      // The Across SDK already handles the transaction execution and monitoring
      // We just need to return a standardized result with the hash we stored during progress tracking
      const txResult = {
        hash: storedTxHash || (result && result.depositTxHash),
        status: 'success',
        fillHash: result && result.fillTxHash,
        actionSuccess: result && result.actionSuccess
      };
      
      console.log("Returning transaction result:", txResult);
      return txResult;
    } catch (error) {
      console.error("Across bridge execution failed:", error);
      
      // Special handling for BigInt conversion errors
      if (error.message && error.message.includes('BigInt')) {
        console.warn("BigInt conversion error detected. This is likely a monitoring issue, not a transaction failure.");
        
        // If we have a transaction hash from a previous successful step, use it
        if (storedTxHash) {
          console.log("Using previously stored transaction hash:", storedTxHash);
          return {
            hash: storedTxHash,
            status: 'success',
            note: 'Transaction was submitted successfully, but monitoring encountered an error.',
            warning: 'The transaction may have been successful, but we could not verify if the retirement function was called. Check the contract on Polygonscan to see if tokens were received.'
          };
        }
      }
      
      // Check for cross-chain message execution failures
      if (error.message && error.message.includes('action')) {
        console.warn("Cross-chain message execution may have failed. The tokens might have been transferred but the retirement function was not called.");
        
        if (storedTxHash) {
          return {
            hash: storedTxHash,
            status: 'partial_success',
            error: error.message,
            warning: 'The tokens were likely transferred to the contract, but the retirement function may not have been called. You may need to manually trigger the retirement.'
          };
        }
      }
      
      // If we have a transaction hash, we can still return it for tracking
      if (storedTxHash) {
        console.warn("Error occurred but transaction was submitted. Returning hash for tracking.");
        
        // Notify the progress handler about the error
        if (onProgress) {
          onProgress({
            status: 'warning', // Use warning instead of error since the transaction might still succeed
            step: 'execution',
            error: error
          });
        }
        
        // Return the hash so the UI can still track the transaction
        return {
          hash: storedTxHash,
          status: 'pending',
          error: error.message,
          warning: 'An error occurred during transaction monitoring. The transaction may still be processing. Check the blockchain explorer for the latest status.'
        };
      }
      
      // No hash available, throw the error
      throw new Error(`Failed to execute Across bridge: ${error.message || error}`);
    }
    
    // Note: We already return in the try block above
  } catch (error) {
    console.error("Failed to execute Across bridge:", error);
    throw error;
  }
}
