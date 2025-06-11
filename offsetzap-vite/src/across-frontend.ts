import { createWalletClient, http, custom, parseUnits, Address, Chain } from 'viem';
import { base, polygon } from 'viem/chains';
import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { createAcrossClient, AcrossClient, DefaultLogger } from '@across-protocol/app-sdk';
import { privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, encodeAbiParameters, decodeFunctionData } from "viem";
import { XmtpClient } from './xmtp-client'; // Import our new XMTP client wrapper

// TypeScript declarations for window properties
declare global {
  interface Window {
    ethereum?: any;
    walletConnectProvider?: any;
  }
}

// Constants
const BASE_CHAIN_ID = 8453;
const POLYGON_CHAIN_ID = 137;
const BACKEND_URL = 'http://localhost:3000';
const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;

// RPC URLs - use consistent Infura endpoints
const BASE_RPC_URL = 'https://base-mainnet.infura.io/v3/591c10e615c04ad5a783c9d6b44f0853';
const POLYGON_RPC_URL = 'https://polygon-mainnet.infura.io/v3/591c10e615c04ad5a783c9d6b44f0853';



// DOM elements
const connectWalletBtn = document.getElementById('connect-button') as HTMLButtonElement;
const switchNetworkBtn = document.getElementById('network-button') as HTMLButtonElement;
const retireBtn = document.getElementById('retire-button') as HTMLButtonElement;
const amountInput = document.getElementById('usdc-amount') as HTMLInputElement;
const beneficiaryNameInput = document.getElementById('beneficiary-name') as HTMLInputElement;
const beneficiaryAddressInput = document.getElementById('beneficiary-address') as HTMLInputElement;
const poolTokenSelect = document.getElementById('pool-token') as HTMLSelectElement;
const statusDiv = document.getElementById('status-message') as HTMLDivElement;
const resultDiv = document.getElementById('result-content') as HTMLDivElement;
const walletAddressSpan = document.getElementById('wallet-address') as HTMLSpanElement || document.createElement('span');
const walletModalDiv = document.createElement('div'); // For wallet selection modal

// Global state
let walletClient: any;
let userAddress: Address;
let currentChainId: number;
let wcProvider: EthereumProvider; // WalletConnect provider
let acrossClient: any;
// Interface for retirement parameters
interface RetirementParams {
  beneficiary: Address;
  beneficiaryName: string;
  poolToken: string;
  retirementMessage?: string;
}

// Interface for multicall message
interface MulticallMessage {
  target: `0x${string}`;
  callData: `0x${string}`;
  value: string | bigint;
}

// Interface for quote response
interface QuoteResponse {
  deposit: {
    spokePoolAddress: string;
    depositAddress: string;
    depositCalldata: string;
    value: string;
    inputAmount: any; // Could be string or bigint
    outputAmount: any; // Could be string or bigint
    recipient: string;
    message: string;
    quoteTimestamp: number;
  };
  limits: {
    minDeposit: any; // Could be string or bigint
    maxDeposit: any; // Could be string or bigint
    maxDepositInstant: any; // Could be string or bigint
    maxDepositShortDelay: any; // Could be string or bigint
    recommendedDepositInstant: any; // Could be string or bigint
  };
  fees: {
    lpFee: any;
    relayerGasFee: any;
    relayerCapitalFee: any;
    totalRelayFee: any;
  };
  isAmountTooLow: boolean;
  estimatedFillTimeSec: number;
}

// Interface for Ethereum provider
interface EthereumProvider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  on(event: string, callback: (...args: any[]) => void): void;
  removeListener(event: string, callback: (...args: any[]) => void): void;
  connected?: boolean;
  chainId?: number;
  connect?: () => Promise<void>;
  session?: any; // For WalletConnect session data
}

// Helper function to create wallet client
export function createUserWalletClient(
  privateKey: `0x${string}`,
  chain: Chain,
  rpcUrl: string,
) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    chain,
    account,
    transport: http(rpcUrl), // Use the provided RPC URL directly
  });
  return walletClient;
}

// Helper function to convert hex string to Uint8Array
function hexToBytes(hexString: string): Uint8Array {
  // Remove 0x prefix if present
  const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  const bytes = new Uint8Array(hex.length / 2);
  
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  
  return bytes;
}

// Initialize XMTP backend connection
async function initializeXmtp() {
  try {
    console.log("Checking XMTP backend service health...");
    const isHealthy = await xmtpBackendClient.checkHealth();
    
    if (isHealthy) {
      console.log("XMTP backend service is healthy and ready to use");
      return true;
    } else {
      console.error("XMTP backend service is not available");
      return false;
    }
  } catch (error) {
    console.error("Failed to connect to XMTP backend service:", error);
    return false;
  }
}

// Create a singleton instance of our XMTP client
const xmtpBackendClient = new XmtpClient();

// Function to send XMTP message via the backend service
async function sendXmtpMessage(recipientAddress: string, message: string): Promise<void> {
  try {
    console.log(`Sending message to ${recipientAddress} via backend service...`);
    
    // Log the message details for debugging
    console.log({
      recipient: recipientAddress,
      messageSummary: message.substring(0, 50) + (message.length > 50 ? '...' : '')
    });
    
    // Send the message using our backend service
    const result = await xmtpBackendClient.sendMessage(recipientAddress, message);
    
    if (result.success) {
      console.log(`✅ Message successfully sent to ${recipientAddress}`);
      // Display success message in UI
      statusDiv.innerHTML += `<p>Message sent to ${recipientAddress.substring(0, 6)}...${recipientAddress.substring(recipientAddress.length - 4)} ✅</p>`;
    } else {
      console.error(`Failed to send message: ${result.error}`);
      statusDiv.innerHTML += `<p class="error">Failed to send message: ${result.error}</p>`;
    }
  } catch (error) {
    console.error(`Error sending message to ${recipientAddress}:`, error);
    statusDiv.innerHTML += `<p class="error">Failed to send message: ${error instanceof Error ? error.message : String(error)}</p>`;
  }
}

// Function to send XMTP message to the offset team wallet
async function sendXmtpMessagetoOffset(message: string): Promise<void> {
  // Use a hardcoded address for the offset team
  const recipientAddress = '0x24216b523E78BA06538b5EB50FA353075fFDC08c'; //'0xa8A5a8fC9336B0036c7a08606790c26b5bB65d00';
  
  // Simply use the same function we created for sending messages
  await sendXmtpMessage(recipientAddress, message);
}

// Function to send carbon retirement notification using structured data
async function sendRetirementNotification(
  recipientAddress: string, 
  requestId: string | number, 
  amount: string | number, 
  status: 'initiated' | 'completed' | 'failed',
  transactionHash?: string
): Promise<void> {
  try {
    console.log(`Sending retirement notification to ${recipientAddress}...`);
    
    // Send using the backend's structured notification endpoint
    const result = await xmtpBackendClient.sendRetirementNotification({
      recipientAddress,
      requestId,
      amount,
      tokenSymbol: 'ETH', // Default to ETH
      status,
      transactionHash
    });
    
    if (result.success) {
      console.log(`✅ Retirement notification sent to ${recipientAddress}`);
    } else {
      console.error(`Failed to send retirement notification: ${result.error}`);
    }
  } catch (error) {
    console.error(`Error sending retirement notification:`, error);
  }
}

// Facilitator contract on Polygon that will handle the retirement
const FACILITATOR_ADDRESS = '0x1358a1b9a4F6Cb95e7df2D5E7303C6c2f96D6516' as `0x${string}`;

// Across multicall handler on Polygon
const ACROSS_MULTICALL_HANDLER = '0x924a9f036260DdD5808007E1AA95f08eD08aA569' as `0x${string}`;

// Token addresses
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as `0x${string}`;

// BCT token address on Polygon
const BCT_TOKEN = '0x2F800Db0fdb5223b3C3f354886d907A671414A7F' as `0x${string}`;

// Create custom chain configurations with our RPC URLs
const customBaseChain = {
  ...base,
  rpcUrls: {
    ...base.rpcUrls,
    default: {
      http: [BASE_RPC_URL],
    },
    public: {
      http: [BASE_RPC_URL],
    }
  }
};

const customPolygonChain = {
  ...polygon,
  rpcUrls: {
    ...polygon.rpcUrls,
    default: {
      http: [POLYGON_RPC_URL],
    },
    public: {
      http: [POLYGON_RPC_URL],
    }
  }
};

// Supported chains configuration
const supportedChains = [
  {
    chainId: BASE_CHAIN_ID,
    viemChain: customBaseChain,
    usdcAddress: USDC_BASE
  },
  {
    chainId: POLYGON_CHAIN_ID,
    viemChain: customPolygonChain,
    usdcAddress: USDC_POLYGON,
  },
];

// Initialize Across client
function initAcrossClient() {
  if (!acrossClient) {
    console.log('Initializing Across client...');
    acrossClient = createAcrossClient({
      integratorId: '0x4f66', // OffsetZap integrator ID
      chains: [base, polygon],
    });
    console.log('Across client initialized successfully');
  }
  return acrossClient;
}

// Helper function to encode retirement call
function encodeRetirementCall(params: RetirementParams, amount: bigint): string {
  // Create a JSON message with retirement parameters
  const jsonMessage = JSON.stringify({
    beneficiary: params.beneficiary,
    beneficiaryName: params.beneficiaryName,
    poolToken: params.poolToken,
    retirementMessage: params.retirementMessage || 'Carbon retired via OffsetZap using Across Protocol'
  });
  
  // Convert to hex using TextEncoder for proper UTF-8 encoding
  const retirementParamsHex = '0x' + Array.from(new TextEncoder().encode(jsonMessage))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // Encode the facilitator's handleAcrossTransfer function call using viem
  return encodeFunctionData({
    abi: [
      {
        name: 'handleAcrossTransfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'message', type: 'bytes' }
        ],
        outputs: []
      }
    ],
    functionName: 'handleAcrossTransfer',
    args: [
      FACILITATOR_ADDRESS,
      amount,
      retirementParamsHex as `0x${string}`
    ]
  });
}

// Helper function to encode USDC transfer call
function encodeTransferCall(amount: bigint): string {
  return encodeFunctionData({
    abi: [{
      name: 'transfer',
      type: 'function',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable'
    }],
    functionName: 'transfer',
    args: [
      FACILITATOR_ADDRESS,
      amount
    ]
  });
}

// Helper function to update multicall with exact output amount
function updateMulticallWithExactOutput(messages: MulticallMessage[], exactOutputAmount: bigint): MulticallMessage[] {
  // Clone the original messages
  const updatedMessages = JSON.parse(JSON.stringify(messages));
  
  // Create updated messages with exact output amount
  const updatedTransferCalldata = encodeTransferCall(exactOutputAmount);
  
  // Extract retirement params from the original message
  const originalMessage = messages.find(msg => msg.target === FACILITATOR_ADDRESS);
  let retirementParamsHex = '0x' as `0x${string}`;
  
  if (originalMessage) {
    try {
      // Decode the function call using viem
      const decoded = decodeFunctionData({
        abi: [
          {
            name: 'handleAcrossTransfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'recipient', type: 'address' },
              { name: 'amount', type: 'uint256' },
              { name: 'message', type: 'bytes' }
            ],
            outputs: []
          }
        ],
        data: originalMessage.callData
      });
      
      // Extract the retirement params
      retirementParamsHex = decoded.args[2] as `0x${string}`;
    } catch (error) {
      console.error('Error decoding original message:', error);
    }
  }
  
  // Create updated facilitator call with exact output amount
  const updatedFacilitatorCalldata = encodeFunctionData({

    abi: [
      {
        name: 'handleAcrossTransfer',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'message', type: 'bytes' }
        ],
        outputs: []
      }
    ],
    functionName: 'handleAcrossTransfer',
    args: [
      FACILITATOR_ADDRESS,
      exactOutputAmount,
      retirementParamsHex
    ]
  });
  
  // Create the updated multicall message
  const updatedMessageHex = encodeAbiParameters(
    [
      {
        name: 'instructions',
        type: 'tuple',
        components: [
          {
            name: 'calls',
            type: 'tuple[]',
            components: [
              { name: 'target', type: 'address' },
              { name: 'callData', type: 'bytes' },
              { name: 'value', type: 'uint256' }
            ]
          },
          { name: 'fallbackRecipient', type: 'address' }
        ]
      }
    ],
    [
      {
        calls: [
          {
            // First call: Transfer USDC directly to the facilitator with exact amount
            target: USDC_POLYGON,
            callData: updatedTransferCalldata as `0x${string}`,
            value: 0n
          },
          {
            // Second call: Call the facilitator's handleAcrossTransfer function with exact amount
            target: FACILITATOR_ADDRESS,
            callData: updatedFacilitatorCalldata as `0x${string}`,
            value: 0n
          }
        ],
        fallbackRecipient: "0x352bd309f1b5595ca03d16008cd1404091cd5951" as `0x${string}` // fallback recipient in case the call fails
      }
    ]
  );
  
  // Return the updated messages with the new hex message
  return [
    {
      target: USDC_POLYGON,
      callData: updatedTransferCalldata as `0x${string}`,
      value: '0'
    },
    {
      target: FACILITATOR_ADDRESS,
      callData: updatedFacilitatorCalldata as `0x${string}`,
      value: '0'
    }
  ];
}

// Initialize the page
async function init(): Promise<void> {
  console.log('Initializing app...');
  
  // Setup event listeners
  connectWalletBtn.addEventListener('click', connectWallet);
  switchNetworkBtn.addEventListener('click', switchToBaseNetwork);
  retireBtn.addEventListener('click', executeRetirement);
  amountInput.addEventListener('input', validateAmount);
  
  try {
    // Initialize WalletConnect provider
    wcProvider = await EthereumProvider.init({
      projectId: '7693f4f273929ea857fd701e84d54bd6', // You'll need to get a project ID from WalletConnect Cloud
      chains: [BASE_CHAIN_ID],
      showQrModal: true,
      rpcMap: {
        [BASE_CHAIN_ID]: BASE_RPC_URL,
        [POLYGON_CHAIN_ID]: POLYGON_RPC_URL
      }
    });
    
    // Setup WalletConnect event listeners
    wcProvider.on('connect', (info: { accounts: string[]; chainId: number }) => {
      console.log('WalletConnect connected:', info);
      userAddress = info.accounts[0] as Address;
      currentChainId = info.chainId;
      updateWalletUI();
      createWalletClientWithAccount();
    });
    
    wcProvider.on('disconnect', () => {
      console.log('WalletConnect disconnected');
      userAddress = undefined as unknown as Address;
      walletClient = undefined;
      updateWalletUI(true);
    });
    
    console.log('WalletConnect provider initialized');
  } catch (err) {
    console.error('Error initializing WalletConnect:', err);
  }

  // const client = createAcrossClient({
  //   integratorId: "0x4f66", // OffsetZap integrator ID (request a real one from Across team)
  //   chains: [base, polygon],
  // });

  // Initialize connection to XMTP backend service
  const xmtpInitialized = await initializeXmtp();
  console.log('XMTP backend service connection initialized successfully');
  console.log('XMTP backend service ready:', xmtpInitialized);
}
// Helper function to create wallet client with account
async function createWalletClientWithAccount(): Promise<void> {
  if (!userAddress) {
    console.error('Cannot create wallet client: No user address');
    return;
  }
  
  try {
    // Initialize WalletConnect provider if not already connected
    if (!wcProvider || !wcProvider.connected) {
      try {
        // Make sure WalletConnect provider is initialized
        if (!wcProvider) {
          // Use the official WalletConnect project ID
          wcProvider = await EthereumProvider.init({
            projectId: '7693f4f273929ea857fd701e84d54bd6',
            chains: [BASE_CHAIN_ID],
            showQrModal: true,
            rpcMap: {
              [BASE_CHAIN_ID]: BASE_RPC_URL,
              [POLYGON_CHAIN_ID]: POLYGON_RPC_URL
            },
            metadata: {
              name: 'Across Protocol Carbon Retirement',
              description: 'Carbon offset application using Across Protocol',
              url: window.location.origin,
              icons: []
            }
          });
          
          // // Set up event listeners for WalletConnect
          // wcProvider.on('connect', (info: any) => {
          //   console.log('WalletConnect connected event:', info);
          //   if (wcProvider.session) {
          //     shareWalletConnectSession(wcProvider.session).catch(err => {
          //       console.warn('Error sharing session after connect:', err);
          //     });
          //   }
          // });
          
          wcProvider.on('disconnect', () => {
            console.log('WalletConnect disconnected');
          });
          
          console.log('WalletConnect provider initialized');
        }
        
        // For WalletConnect-only connections, try to connect
        if (!window.ethereum && !wcProvider.connected) {
          try {
            console.log('Connecting to WalletConnect directly...');
            // Make sure connect method exists before calling it
            if (wcProvider.connect && typeof wcProvider.connect === 'function') {
              await wcProvider.connect();
              console.log('WalletConnect connected:', wcProvider.connected);
              console.log('WalletConnect session:', wcProvider.session);
              
              // if (wcProvider.session) {
              //   await shareWalletConnectSession(wcProvider.session);
              // }
            } else {
              console.warn('WalletConnect provider does not have a connect method');
            }
          } catch (connErr) {
            console.error('Error connecting to WalletConnect:', connErr);
          }
        }
        
        // For MetaMask connections, we'll create a custom transport that uses WalletConnect
        if (window.ethereum) {
          console.log('Creating custom transport for MetaMask that uses WalletConnect');
          
          // Create a custom transport that proxies requests through WalletConnect
          const customWcTransport = custom({
            async request({ method, params }) {
              // First, ensure MetaMask is connected
              if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
                // For account requests, use MetaMask directly
                const accounts = await window.ethereum.request({ method, params });
                console.log('Got accounts from MetaMask:', accounts);
                return accounts;
              } else if (method === 'eth_chainId') {
                // For chainId requests, use MetaMask directly
                const chainId = await window.ethereum.request({ method, params });
                console.log('Got chainId from MetaMask:', chainId);
                return chainId;
              }
              
              // For all other requests, try to use WalletConnect
              try {
                // If WalletConnect is not connected, we need to create a session
                if (!wcProvider.connected || !wcProvider.session) {
                  console.log('WalletConnect not connected, creating session from MetaMask data');
                  
                  // Get account and chain from MetaMask
                  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                  const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
                  const chainId = parseInt(chainIdHex as string, 16);
                  
                  if (accounts && accounts.length > 0) {
                    // Create a session-like object
                    const sessionData = {
                      topic: `metamask-${Date.now()}`,
                      namespaces: {
                        eip155: {
                          accounts: [`eip155:${chainId}:${accounts[0]}`],
                          methods: ['eth_sendTransaction', 'eth_signTransaction', 'eth_sign'],
                          events: ['accountsChanged', 'chainChanged']
                        }
                      }
                    };
                    
                    // Set the session on the WalletConnect provider
                    // @ts-ignore - we're setting a property that might not be in the type
                    wcProvider.session = sessionData;
                    // @ts-ignore - we're setting a property that might not be in the type
                    wcProvider.connected = true;
                    
                    console.log('Created WalletConnect session from MetaMask data:', sessionData);
                    
                    // // Share the session with the backend
                    // await shareWalletConnectSession(sessionData);
                  }
                }
                
                // Now use WalletConnect for the request
                console.log(`Proxying ${method} through WalletConnect`);
                return await wcProvider.request({ method, params });
              } catch (wcError) {
                console.error(`WalletConnect request failed for ${method}:`, wcError);
                
                // Fall back to MetaMask
                console.log(`Falling back to MetaMask for ${method}`);
                return await window.ethereum.request({ method, params });
              }
            }
          }, {
            name: 'WalletConnect-MetaMask-Proxy',
            key: 'wcMetaMaskProxy'
          });
          
          // Use this custom transport for the wallet client
          walletClient = createWalletClient({
            account: userAddress,
            chain: customBaseChain,
            transport: customWcTransport // Using custom WalletConnect transport
          });
          
          // Force the RPC URL for all HTTP requests
          // @ts-ignore - Adding a custom property to override RPC URL
          walletClient.transport.url = BASE_RPC_URL;
          
          console.log('Created viem wallet client with custom WalletConnect transport:', walletClient);
          return walletClient;
        }
      } catch (err) {
        console.error('Error initializing WalletConnect provider:', err);
        // Fall back to using window.ethereum if WalletConnect fails
        if (window.ethereum) {
          walletClient = createWalletClient({
            account: userAddress,
            chain: customBaseChain,
            transport: custom(window.ethereum)
          });
          // Force the RPC URL for all HTTP requests
          // @ts-ignore - Adding a custom property to override RPC URL
          walletClient.transport.url = BASE_RPC_URL;
          console.log('Falling back to MetaMask wallet client with forced Infura RPC URL');
          return;
        } else {
          throw new Error('No provider available');
        }
      }
    }
    
    // Create wallet client using WalletConnect provider if possible
    if (wcProvider && wcProvider.connected) {
      walletClient = createWalletClient({
        account: userAddress,
        chain: customBaseChain,
        transport: custom(wcProvider)
      });
      // Force the RPC URL for all HTTP requests
      // @ts-ignore - Adding a custom property to override RPC URL
      walletClient.transport.url = BASE_RPC_URL;
      console.log('Created wallet client with WalletConnect and forced Infura RPC URL');
      console.log('wcProvider from createWalletClientWithAccount', wcProvider);
      console.log('viem wallet client from createWalletClientWithAccount', walletClient);

      const client = AcrossClient.create({
        //integratorId: "0x4f66", // OffsetZap integrator ID (request a real one from Across team)
        chains: [customBaseChain, customPolygonChain],
        useTestnet: false,
        logLevel: "DEBUG",
        walletClient,
        rpcUrls: {
          [base.id]: BASE_RPC_URL,
          [polygon.id]: POLYGON_RPC_URL,
        },
        tenderly: {
          accessKey: "UtkM6eDigDZ0ZZQn-dEg1W34LJiw6-3h",
          accountSlug: "danieloforji",
          projectSlug: "project",
        },
      });
    
      console.log('Across client created successfully');
      console.log('Across client:', client);

      // // Before creating user client, close the notification client if it exists
      // if (xmtpClient) {
      //   console.log('Closing notification XMTP client before creating user client...');
      //   await xmtpClient.close();
      //   // Keep a reference to the notification client's inboxId if needed
      //   const notificationInboxId = xmtpClient.inboxId;
      //   // Reset the global variable
      //   xmtpClient = null;
      //   console.log('Notification client closed successfully');
        
      //   // Wait a brief moment
      //   await new Promise(resolve => setTimeout(resolve, 500));
      // }
      
      // // Now create the user client
      // const userClient = await registerUserForXmtp();
      // console.log('User XMTP client created successfully');
      // console.log('User XMTP client inboxId:', userXmtpClient?.inboxId);
    } else if (window.ethereum) {
      // Fallback to MetaMask/injected provider if WalletConnect not available
      walletClient = createWalletClient({
        account: userAddress,
        chain: customBaseChain,
        transport: custom(window.ethereum)
      });
      // Force the RPC URL for all HTTP requests
      // @ts-ignore - Adding a custom property to override RPC URL
      walletClient.transport.url = BASE_RPC_URL;
      console.log('Created wallet client with MetaMask and forced Infura RPC URL');
    } else {
      throw new Error('No provider available');
    }
  } catch (err) {
    console.error('Error creating wallet client:', err);
    showStatus('Failed to create wallet client', 'error');
  }
}

// Update wallet UI
function updateWalletUI(disconnected = false): void {
  if (disconnected || !userAddress) {
    walletAddressSpan.textContent = 'Not connected';
    connectWalletBtn.textContent = 'Connect Wallet';
    connectWalletBtn.disabled = false;
    switchNetworkBtn.disabled = true;
    retireBtn.disabled = true;
  } else {
    walletAddressSpan.textContent = userAddress;
    connectWalletBtn.textContent = 'Wallet Connected';
    connectWalletBtn.disabled = true;
    switchNetworkBtn.disabled = false;
    retireBtn.disabled = currentChainId !== BASE_CHAIN_ID;
    
    // Update UI based on network
    updateNetworkUI(currentChainId);
  }
}

// Connect wallet function
async function connectWallet(): Promise<void> {
  try {
    showStatus('Connecting to wallet...', 'info');
    
    // Show wallet selection modal
    const walletType = await showWalletSelectionModal();
    
    if (walletType === 'metamask') {
      // Connect using MetaMask
      if (!window.ethereum) {
        throw new Error('MetaMask is not installed');
      }
      
      const ethereum = window.ethereum as EthereumProvider;
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      userAddress = accounts[0] as Address;
      
      // Get current network
      const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
      currentChainId = parseInt(chainIdHex, 16);
    } else if (walletType === 'walletconnect') {
      // Connect using WalletConnect
      if (!wcProvider) {
        throw new Error('WalletConnect provider not initialized');
      }
      
      if (wcProvider.connect) {
        await wcProvider.connect();
      } else {
        // Fallback for providers without connect method
        await wcProvider.request({ method: 'eth_requestAccounts' });
      }
      
      const accounts = await wcProvider.request({ method: 'eth_accounts' });
      userAddress = accounts[0] as Address;
      currentChainId = wcProvider.chainId || BASE_CHAIN_ID;
    }
    
    // Create wallet client and update UI
    await createWalletClientWithAccount();
    updateWalletUI();
    
    // // Initialize XMTP client for notifications
    // showStatus('Initializing secure messaging...', 'info');
    // try {
    //   if (!xmtpClient) {
    //     xmtpClient = await initializeXmtp();
    //     if (xmtpClient) {
    //       console.log('XMTP client initialized successfully');
    //       showStatus('Secure messaging initialized', 'success');
    //     } else {
    //       console.warn('Could not initialize XMTP client');
    //     }
    //   }
    // } catch (xmtpError) {
    //   console.error('Error initializing XMTP:', xmtpError);
    //   // Don't fail wallet connection if XMTP fails
    // }
    
    showStatus('Wallet connected successfully', 'success');
  } catch (err: any) {
    console.error('Error connecting wallet:', err);
    showStatus('Failed to connect wallet: ' + (err.message || err), 'error');
  }
}

// Switch to Base network
async function switchToBaseNetwork(): Promise<void> {
  try {
    const ethereum = window.ethereum as EthereumProvider;
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x2105' }], // Base chainId in hex
    });
    
    // Update network info after switch
    const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
    currentChainId = parseInt(chainIdHex, 16);
    
    // Update wallet client using our helper function
    await createWalletClientWithAccount();
    
    // Update UI
    updateNetworkUI(currentChainId);
    
    showStatus('Switched to Base network', 'success');
  } catch (err: any) {
    if (err.code === 4902) {
      // Chain not added, try to add it
      try {
        const ethereum = window.ethereum as EthereumProvider;
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x2105',
            chainName: 'Base Mainnet',
            nativeCurrency: {
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18
            },
            rpcUrls: ['https://base-mainnet.infura.io/v3/591c10e615c04ad5a783c9d6b44f0853'],
            blockExplorerUrls: ['https://basescan.org']
          }]
        });
        
        // Try switching again
        await switchToBaseNetwork();
      } catch (addErr: any) {
        console.error('Error adding Base network:', addErr);
        showStatus('Failed to add Base network: ' + (addErr.message || addErr), 'error');
      }
    } else {
      console.error('Error switching network:', err);
      showStatus('Failed to switch network: ' + (err.message || err), 'error');
    }
  }
}

// Update UI based on current network
function updateNetworkUI(chainId: number): void {
  if (chainId === BASE_CHAIN_ID) {
    switchNetworkBtn.textContent = 'Connected to Base';
    switchNetworkBtn.disabled = true;
    retireBtn.disabled = false;
    validateAmount(); // Check if amount is valid to enable/disable retire button
  } else {
    switchNetworkBtn.textContent = 'Switch to Base Network';
    switchNetworkBtn.disabled = false;
    retireBtn.disabled = true;
  }
}

// Validate amount input
function validateAmount(): boolean {
  const amountStr = amountInput.value.trim();
  if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
    retireBtn.disabled = true;
    return false;
  }
  
  // Only enable if on Base network
  retireBtn.disabled = currentChainId !== BASE_CHAIN_ID;
  return true;
}

// Execute Quote retirement function for frontend
async function executeQuote(quote: any): Promise<any> {
  try {
    console.log('Executing quote:', quote);
    
    // Initialize Across client if not already initialized
    if (!acrossClient) {
      acrossClient = initAcrossClient();
    }
    
    // Send XMTP message about execution start
    const startMessage = `OffsetZap Carbon Retirement Started:\n- Amount: ${quote.deposit.inputAmount} USDC\n- From: Base Network\n- To: Polygon Network\n- Timestamp: ${new Date().toISOString()}`;
    
    // Send to user
    await sendXmtpMessage(userAddress, startMessage);
    
    // Send to offset team
    await sendXmtpMessagetoOffset(startMessage);
    
    // Execute the quote
    const result = await acrossClient.executeQuote({
      walletClient: walletClient,
      deposit: quote.deposit,
      infiniteApproval: true,
      onProgress: (progress: any) => {
        console.log(`Progress step: ${progress.step}, status: ${progress.status}`);
        
        // Update UI based on progress status
        if (progress.step === "approve") {
          if (progress.status === "pending") {
            showStatus('Approving USDC for Across bridge...', 'info');
          } else if (progress.status === "txSent") {
            const { txHash } = progress;
            showStatus(`USDC approval transaction sent: ${txHash}`, 'info');
          } else if (progress.status === "txSuccess") {
            const { txReceipt } = progress;
            console.log('Approval receipt:', txReceipt.transactionHash);
            showStatus(`USDC approved for Across bridge!`, 'success');
          } else if (progress.status === "error") {
            showStatus(`USDC approval failed: ${progress.error?.message || 'Unknown error'}`, 'error');
          }
        }
        
        if (progress.step === "deposit") {
          if (progress.status === "pending") {
            showStatus('Preparing deposit to Across bridge...', 'info');
          } else if (progress.status === "txSent") {
            const { txHash } = progress;
            showStatus(`Deposit transaction sent: ${txHash}`, 'info');
          } else if (progress.status === "txSuccess") {
            const { depositId, txReceipt } = progress;
            console.log('Deposit receipt:', txReceipt.transactionHash);
            console.log('Deposit ID:', depositId);
            showStatus(`Deposit confirmed! Bridging in progress.`, 'success');
          } else if (progress.status === "error") {
            showStatus(`Deposit failed: ${progress.error?.message || 'Unknown error'}`, 'error');
          }
        }
        
        if (progress.step === "fill") {
          if (progress.status === "pending") {
            showStatus('Waiting for funds to arrive on Polygon...', 'info');
          } else if (progress.status === "txSent") {
            showStatus('Carbon retirement transaction initiated on Polygon...', 'info');
          } else if (progress.status === "txSuccess") {
            const { fillTxTimestamp, txReceipt, actionSuccess } = progress;
            console.log('Fill receipt:', txReceipt.transactionHash);
            console.log('Action success:', actionSuccess);
            console.log('Fill timestamp:', fillTxTimestamp);
            
            if (actionSuccess) {
              showStatus('Carbon successfully retired on Polygon!', 'success');
              
              // Show transaction details
              showResult(`
                <div class="result-item">
                  <h3>Carbon Retirement Complete!</h3>
                  <p><b>Status:</b> Success</p>
                  <p><b>Transaction:</b> <a href='https://polygonscan.com/tx/${txReceipt.transactionHash}' target='_blank'>View on PolygonScan</a></p>
                  <p><small>Your NFT receipt will be available at the beneficiary address.</small></p>
                </div>
              `);
              
              // Send XMTP message about successful completion
              const completionMessage = `OffsetZap Carbon Retirement Completed Successfully!\n- Transaction: https://polygonscan.com/tx/${txReceipt.transactionHash}\n- Timestamp: ${new Date().toISOString()}\n- NFT receipt will be available at the beneficiary address.`;
              
              // Send to user
              sendXmtpMessage(userAddress, completionMessage).catch(err => {
                console.error('Failed to send completion XMTP message to user:', err);
              });
              
              // Send to offset team
              sendXmtpMessagetoOffset(completionMessage).catch(err => {
                console.error('Failed to send completion XMTP message to offset team:', err);
              });
            } else {
              showStatus('Funds arrived on Polygon but carbon retirement action failed', 'info');
            }
          } else if (progress.status === "error") {
            const errorMessage = progress.error?.message || 'Unknown error';
            showStatus(`Fill transaction failed: ${errorMessage}`, 'error');
            
            // Send XMTP message about the error
            const errorNotification = `OffsetZap Carbon Retirement Error:\n- Error: ${errorMessage}\n- Step: Fill transaction\n- Timestamp: ${new Date().toISOString()}`;
            
            // Only send to offset team for monitoring
            sendXmtpMessagetoOffset(errorNotification).catch(err => {
              console.error('Failed to send error XMTP message:', err);
            });
          }
        }
      },
    });
    console.log('Quote executed successfully:', result);
    return result;
  } catch (err) {
    console.error('Error executing quote:', err);
    throw err;
  }
}


// Get quote function for frontend
async function getQuote(amountStr: string, beneficiaryName: string, beneficiaryAddress: string, poolToken: string): Promise<QuoteResponse> {
  try {
    console.log('Getting quote for:', { amountStr, beneficiaryName, beneficiaryAddress, poolToken });
    
    // Initialize Across client if not already initialized
    if (!acrossClient) {
      acrossClient = initAcrossClient();
    }
    
    // Parse and validate amount
    if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
      throw new Error('Invalid amount');
    }
    
    // Parse amount using parseUnits to get a BigInt with proper decimal handling
    const amount = parseUnits(amountStr, 6); // USDC has 6 decimals
    
    // Ensure we have a user address
    if (!userAddress) {
      throw new Error('No wallet connected');
    }
    
    // Prepare retirement parameters
    const retirementParams: RetirementParams = {
      beneficiary: (beneficiaryAddress || userAddress) as Address,
      beneficiaryName: beneficiaryName || 'OffsetZap User',
      poolToken: poolToken || BCT_TOKEN,
      retirementMessage: `Carbon retired via OffsetZap using Across Protocol`
    };
    
    // Encode the retirement call for the facilitator contract
    const retirementCalldata = encodeRetirementCall(retirementParams, amount);
    
    // Create multicall message for the facilitator
    const multicallMessages: MulticallMessage[] = [
      {
        target: FACILITATOR_ADDRESS,
        callData: retirementCalldata as `0x${string}`,
        value: '0'
      }
    ];
    
    // Set destination to Polygon Mainnet
    const destinationChainId = POLYGON_CHAIN_ID;
    const destinationUSDC = USDC_POLYGON;
    
    // Prepare route using the multicall handler as recipient
    const route = {
      originChainId: BASE_CHAIN_ID,
      destinationChainId: destinationChainId,
      inputToken: USDC_BASE,
      outputToken: destinationUSDC,
      recipient: ACROSS_MULTICALL_HANDLER as `0x${string}`,
      message: '0x' // Will be populated by multicallMessages
    };
    
    console.log('Requesting quote from Across with route:', route);
    
    // Request quote from Across
    const quote = await acrossClient.getQuote({
      route,
      inputAmount: amount, // Pass the BigInt directly as inputAmount
    });
    
    console.log('Received quote from Across:', quote);
    
    // Extract the exact output amount that will be received on the destination chain
    const exactOutputAmount = quote.deposit.outputAmount;
    
    // Update the multicall messages with the exact output amount
    const updatedMulticallMessages = updateMulticallWithExactOutput(
      multicallMessages,
      BigInt(exactOutputAmount)
    );
    
    // Update the route with the new message
    const updatedMessageHex = encodeAbiParameters(
      [
        {
          name: 'instructions',
          type: 'tuple',
          components: [
            {
              name: 'calls',
              type: 'tuple[]',
              components: [
                { name: 'target', type: 'address' },
                { name: 'callData', type: 'bytes' },
                { name: 'value', type: 'uint256' }
              ]
            },
            { name: 'fallbackRecipient', type: 'address' }
          ]
        }
      ],
      [
        {
          calls: updatedMulticallMessages.map(msg => ({
            target: msg.target,
            callData: msg.callData,
            value: BigInt(msg.value || '0')
          })),
          fallbackRecipient: userAddress as `0x${string}`
        }
      ]
    );
    
    // Update the route with the new message
    route.message = updatedMessageHex;
    quote.deposit.message = updatedMessageHex;
    
    // Send XMTP message about quote generation
    const quoteMessage = `OffsetZap Quote Generated:\n- Amount: ${amountStr} USDC\n- Beneficiary: ${beneficiaryName} (${beneficiaryAddress || userAddress})\n- Pool Token: ${poolToken}\n- Timestamp: ${new Date().toISOString()}`;
    
    try {
      // Check if our XMTP backend service is available
      const isHealthy = await xmtpBackendClient.checkHealth();
      if (!isHealthy) {
        console.log('XMTP backend service is not available. Skipping messaging.');
        return quote;
      }
      
      // Simply send messages directly through our backend service
      console.log(`Sending quote notification to ${userAddress}`);
      statusDiv.innerHTML += `<p>Sending quote details to your wallet...</p>`;
      
      // Send to user address
      await sendXmtpMessage(userAddress, quoteMessage);
      
      // Send to offset team
      await sendXmtpMessagetoOffset(quoteMessage);
      
      // Add success message
      statusDiv.innerHTML += `<p>Quote details sent to your wallet and the OffsetZap team</p>`;
    } catch (xmtpError) {
      console.error("Error with XMTP messaging:", xmtpError);
      // Don't fail the quote generation if messaging fails
    }
    
    return quote;
  } catch (err: any) {
    console.error('Error getting quote:', err);
    throw new Error(err.message || 'Failed to get quote');
  }
}


// Execute retirement function
async function executeRetirement(): Promise<any> {
  try {
    // Check if wallet is connected
    if (!userAddress) {
      showStatus('Please connect your wallet first', 'error');
      return;
    }
    
    // Check if on Base network
    if (currentChainId !== BASE_CHAIN_ID) {
      showStatus('Please switch to Base network first', 'error');
      return;
    }
    
    // Get form values
    const amountStr = amountInput.value;
    const beneficiaryName = beneficiaryNameInput.value;
    const beneficiaryAddress = beneficiaryAddressInput.value || userAddress;
    const poolToken = poolTokenSelect.value;
    
    // Validate inputs
    if (!amountStr || parseFloat(amountStr) <= 0) {
      showStatus('Please enter a valid amount', 'error');
      return;
    }

    // Show loading status for quote generation
    showStatus('Calculating carbon retirement quote...', 'info');
    console.log('Getting quote from function...');
    
    // Get the quote from Across Protocol
    const quote = await getQuote(amountStr, beneficiaryName, beneficiaryAddress, poolToken);
    console.log('Quote received:', quote);
    
    // Show quote details to user
    const depositAmount = parseFloat(amountStr).toFixed(2);
    showStatus(`Quote received! Ready to retire ${depositAmount} USDC worth of carbon`, 'success');
    
    // Show quote details in the result area
    showResult(`
      <div class="mb-3">
        <h5>Carbon Retirement Details</h5>
        <p><b>Amount:</b> ${depositAmount} USDC</p>
        <p><b>Beneficiary:</b> ${beneficiaryName || 'OffsetZap User'}</p>
        <p><b>Address:</b> ${beneficiaryAddress}</p>
        <p><small>Your transaction will bridge from Base to Polygon and automatically retire carbon.</small></p>
      </div>
    `);
    
    // Manually approve token spending before executing the quote
    showStatus('Approving USDC spending...', 'info');
    try {
      // Get the spokePoolAddress from the quote
      console.log('Quote:', quote);
      // The quote structure is different than expected - deposit is at the top level
      const spokePoolAddress = quote.deposit.spokePoolAddress as `0x${string}`;
      const inputAmount = quote.deposit.inputAmount;
      console.log('Spoke pool address:', spokePoolAddress);
      console.log('Input amount:', inputAmount);
      
      console.log(`Manually approving ${inputAmount} USDC to be spent by ${spokePoolAddress}`);
      
      // Create ERC20 ABI for approval
      const erc20ABI = [
        {
          "inputs": [
            { "name": "spender", "type": "address" },
            { "name": "amount", "type": "uint256" }
          ],
          "name": "approve",
          "outputs": [{ "name": "", "type": "bool" }],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ];
      
      // Encode the approval call
      const approvalCalldata = encodeFunctionData({
        abi: erc20ABI,
        functionName: 'approve',
        args: [spokePoolAddress, BigInt(inputAmount)]
      });
      console.log('Approval calldata:', approvalCalldata);
      
      // Send the approval transaction using ethereum provider directly
      console.log('Sending approval transaction using ethereum provider directly...');
      
      let approvalTx;
      if (window.ethereum) {
        try {
          // Use the ethereum provider directly
          approvalTx = await window.ethereum.request({
            method: 'eth_sendTransaction',
            params: [{
              from: userAddress,
              to: USDC_BASE_ADDRESS,
              data: approvalCalldata,
            }],
          });
          console.log('Transaction sent via ethereum provider:', approvalTx);
        } catch (error) {
          console.error('Error sending via ethereum provider:', error);
          throw error;
        }
      } else if (wcProvider && wcProvider.connected) {
        try {
          // Use WalletConnect provider directly
          approvalTx = await wcProvider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: userAddress,
              to: USDC_BASE_ADDRESS,
              data: approvalCalldata,
            }],
          });
          console.log('Transaction sent via WalletConnect provider:', approvalTx);
        } catch (error) {
          console.error('Error sending via WalletConnect provider:', error);
          throw error;
        }
      } else {
        throw new Error('No provider available for transaction');
      }
      
      console.log('Approval transaction sent:', approvalTx);
      showStatus('USDC approved! Now executing carbon retirement...', 'success');
    } catch (error) {
      console.error('Error approving token:', error);
      showStatus('Failed to approve USDC. Please try again.', 'error');
      return;
    }


    
    // Manually execute the deposit transaction instead of using executeQuote
    showStatus('Executing carbon retirement deposit...', 'info');

    // try {
    //   // Simulate deposit transaction to get the request object
    //   const { request: simulateDepositTxRequest } =
    //     await acrossClient.simulateDepositTx({
    //       walletClient,
    //       deposit: quote.deposit,
    //     });
    //   console.log("Simulation result:", simulateDepositTxRequest);
      
    //   // Try the alternative method: directly use walletClient.writeContract with the request
    //   showStatus('Sending deposit transaction using writeContract...', 'info');
      
    //   try {
    //     // Send the transaction using walletClient.writeContract
    //     const transactionHash = await walletClient.writeContract(simulateDepositTxRequest);
    //     console.log('Deposit transaction sent via writeContract:', transactionHash);
        
    //     showStatus('Carbon retirement deposit sent successfully!', 'success');
        
    //     // Get current block on destination chain
    //     const destinationChainId = POLYGON_CHAIN_ID; // We know the destination is Polygon
    //     const destinationBlock = await acrossClient
    //       .getPublicClient(destinationChainId)
    //       .getBlockNumber();
    //     console.log('Current destination block:', destinationBlock);
        
    //     // Wait for deposit transaction to be mined
    //     showStatus('Waiting for deposit transaction to be mined...', 'info');
    //     const { depositTxReceipt, depositId } = await acrossClient.waitForDepositTx({
    //       transactionHash,
    //       originChainId: BASE_CHAIN_ID, // We know the origin is Base
    //     });
        
    //     console.log('Deposit receipt:', depositTxReceipt);
    //     console.log(`Deposit id #${depositId}`);
        
    //     showStatus(`Deposit confirmed! Waiting for funds to arrive on Polygon (Deposit ID: ${depositId})`, 'success');
        
    //     // Wait for fill transaction on destination chain
    //     showStatus('Waiting for carbon retirement to complete on Polygon...', 'info');
        
    //     try {
    //       const fillResult = await acrossClient.waitForFillTx({
    //         depositId,
    //         deposit: quote.deposit,
    //         fromBlock: destinationBlock,
    //       });
          
    //       if (fillResult) {
    //         console.log('Fill tx timestamp:', fillResult.fillTxTimestamp);
    //         console.log('Fill tx receipt:', fillResult.fillTxReceipt);
            
    //         // Create a result object with fill information
    //         const result = {
    //           transactionHash: transactionHash,
    //           depositId: depositId,
    //           fillTxReceipt: fillResult.fillTxReceipt,
    //           fillTxTimestamp: fillResult.fillTxTimestamp
    //         };
            
    //         showStatus('Carbon retirement completed successfully on Polygon!', 'success');
            
    //         // Show transaction details with both deposit and fill tx info
    //         showResult(`
    //           <div class="result-item">
    //             <h3>Carbon Retirement Complete!</h3>
    //             <p><b>Status:</b> Success</p>
    //             <p><b>Deposit Transaction:</b> <a href='https://basescan.org/tx/${transactionHash}' target='_blank'>View on BaseScan</a></p>
    //             <p><b>Fill Transaction:</b> <a href='https://polygonscan.com/tx/${fillResult.fillTxReceipt.transactionHash}' target='_blank'>View on PolygonScan</a></p>
    //             <p><small>Your NFT receipt will be available at the beneficiary address.</small></p>
    //           </div>
    //         `);
            
    //         return result;
    //       }
    //     } catch (fillError) {
    //       console.error('Error waiting for fill transaction:', fillError);
    //       // Continue with basic result even if fill tracking fails
    //     }
        
    //     // Create a basic result object if fill tracking fails
    //     const result = {
    //       transactionHash: transactionHash,
    //       depositId: depositId,
    //     };
    //     console.log('writeContract deposit result:', result);
        
    //     return result;
    //   } catch (writeError) {
    //     console.error('Error using writeContract method:', writeError);
    //     showStatus('Failed with writeContract method, falling back to executeQuote...', 'info');
    //   }
    // } catch (e) {
    //   console.log("Deposit simulation error", e);
    // }
    
    // Fall back to executeQuote if the alternative method fails
    showStatus('Executing quote with Across SDK...', 'info');
    const result = await executeQuote(quote);
    console.log('Deposit result:', result);
    
      
      // Show success message with transaction details
      if (result && result.transactionHash) {
        const txHash = result.transactionHash;
        showStatus('Carbon retirement initiated successfully!', 'success');
        showResult(`
          <div class="mb-3">
            <h4>🌳 Carbon Retirement Initiated!</h4>
            <p>Your transaction has been submitted to the Base network.</p>
            <p><strong>Transaction Hash:</strong> <a href="https://basescan.org/tx/${txHash}" target="_blank">${txHash.substring(0, 10)}...${txHash.substring(txHash.length - 8)}</a></p>
            <p>Amount: ${depositAmount} USDC</p>
            <p>Beneficiary: ${beneficiaryName || userAddress}</p>
            <p><small>You'll receive an NFT receipt at the beneficiary address when the process completes.</small></p>
          </div>
        `);
        
        // Send XMTP message about the carbon retirement if client is initialized
        try {
          // Check health of the XMTP backend service
          const isHealthy = await xmtpBackendClient.checkHealth();
          
          if (!isHealthy) {
            console.log('XMTP backend service is not available. Skipping messaging.');
            return;
          }
          
          // Create a detailed message about the retirement
          const xmtpMessage = `
🌳 Carbon Retirement Initiated!

Amount: ${depositAmount} USDC
Beneficiary: ${beneficiaryName || 'OffsetZap User'}
Transaction: https://basescan.org/tx/${txHash}

Your carbon retirement is being processed and will complete automatically once funds arrive on Polygon.
Thank you for your contribution to a more sustainable future!
`;
          
          // Send message to the user
          showStatus('Sending confirmation message to your wallet...', 'info');
          await sendXmtpMessage(userAddress, xmtpMessage);
          
          // Optionally send message to the Offset team
          const notifyOffset = true; // This could be a checkbox in the UI
          if (notifyOffset) {
            showStatus('Notifying Offset team about your retirement...', 'info');
            await sendXmtpMessagetoOffset(`New carbon retirement by ${beneficiaryName || 'OffsetZap User'} for ${depositAmount} USDC`);
          }
          
          showStatus('Carbon retirement initiated successfully!', 'success');
        } catch (messagingError) {
          console.error('Error sending XMTP messages:', messagingError);
          // Don't fail the whole process if messaging fails
        }
      } else {
        showStatus('Carbon retirement initiated. Check your wallet for transaction details.', 'success');
      }
    } catch (error) {
      console.error('Error executing deposit transaction:', error);
      showStatus('Failed to execute carbon retirement. Please try again.', 'error');
    }

}

// Show status message
function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
  statusDiv.textContent = message;
  statusDiv.className = 'status status-' + type;
  statusDiv.classList.remove('hidden');
}

// Show result HTML
function showResult(html: string): void {
  resultDiv.innerHTML += html;
  document.getElementById('result-card')?.classList.remove('hidden');
}

// Share WalletConnect session with backend
async function shareWalletConnectSession(session: any): Promise<void> {
  try {
    console.log('Sharing WalletConnect session with backend:', session);
    
    const response = await fetch(`${BACKEND_URL}/api/wallet-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ session })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to share session: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Backend received wallet session:', result);
  } catch (err) {
    console.error('Error sharing WalletConnect session with backend:', err);
  }
}

// Show wallet selection modal
async function showWalletSelectionModal(): Promise<'metamask' | 'walletconnect'> {
  return new Promise((resolve) => {
    // Create modal container
    walletModalDiv.className = 'wallet-modal';
    walletModalDiv.innerHTML = `
      <div class="wallet-modal-content">
        <h3>Connect Your Wallet</h3>
        <p>Choose your preferred wallet to retire carbon:</p>
        <div class="wallet-options">
          <button id="metamask-btn" class="wallet-option-btn" ${!window.ethereum ? 'disabled' : ''}>
            <div class="wallet-option-icon">
              <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" width="40" height="40">
            </div>
            <span>MetaMask</span>
            ${!window.ethereum ? '<span class="wallet-not-available">Not detected</span>' : ''}
          </button>
          <button id="walletconnect-btn" class="wallet-option-btn">
            <div class="wallet-option-icon">
              <img src="https://avatars.githubusercontent.com/u/37784886" alt="WalletConnect" width="40" height="40">
            </div>
            <span>Connect any other wallet</span>
          </button>
        </div>
        <div class="wallet-footer">
          <button id="wallet-modal-close" class="modal-close-btn">Cancel</button>
        </div>
      </div>
    `;
    
    // Add modal to body
    document.body.appendChild(walletModalDiv);
    
    // Add styles for the modal
    const style = document.createElement('style');
    style.textContent = `
      .wallet-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        backdrop-filter: blur(5px);
      }
      .wallet-modal-content {
        background-color: white;
        padding: 30px;
        border-radius: 16px;
        max-width: 450px;
        width: 90%;
        text-align: center;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      }
      .wallet-modal-content h3 {
        margin-top: 0;
        font-size: 24px;
        color: #333;
        margin-bottom: 10px;
      }
      .wallet-modal-content p {
        color: #666;
        margin-bottom: 25px;
      }
      .wallet-options {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 25px;
      }
      .wallet-option-btn {
        display: flex;
        align-items: center;
        padding: 16px;
        border: 1px solid #e0e0e0;
        border-radius: 12px;
        background-color: #f8f9fa;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        position: relative;
      }
      .wallet-option-btn:hover {
        background-color: #f0f0f0;
        border-color: #ccc;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      }
      .wallet-option-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .wallet-option-btn:disabled:hover {
        transform: none;
        box-shadow: none;
      }
      .wallet-option-icon {
        margin-right: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
      }
      .wallet-option-btn span {
        font-size: 16px;
        font-weight: 500;
        color: #333;
      }
      .wallet-subtitle {
        display: block;
        font-size: 12px !important;
        font-weight: normal !important;
        color: #666 !important;
        margin-top: 4px;
      }
      .wallet-not-available {
        display: block;
        font-size: 12px !important;
        font-weight: normal !important;
        color: #ff5252 !important;
        margin-top: 4px;
      }
      .wallet-footer {
        display: flex;
        justify-content: center;
      }
      .modal-close-btn {
        background-color: transparent;
        border: 1px solid #ddd;
        color: #666;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
      }
      .modal-close-btn:hover {
        background-color: #f5f5f5;
        color: #333;
      }
        justify-content: space-around;
        margin: 20px 0;
      }
      .wallet-option-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 15px;
        border: 1px solid #ddd;
        border-radius: 10px;
        background-color: white;
        cursor: pointer;
        transition: all 0.2s;
      }
      .wallet-option-btn:hover {
        transform: translateY(-5px);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
      }
      .wallet-option-btn[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .wallet-option-btn span {
        margin-top: 10px;
      }
      .modal-close-btn {
        margin-top: 15px;
        padding: 8px 15px;
        background-color: #f1f1f1;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
    
    // Add event listeners
    const metamaskBtn = document.getElementById('metamask-btn');
    const walletconnectBtn = document.getElementById('walletconnect-btn');
    const closeBtn = document.getElementById('wallet-modal-close');
    
    if (metamaskBtn) {
      metamaskBtn.addEventListener('click', async () => {
        if (window.ethereum) {
          try {
            // Explicitly trigger MetaMask popup before resolving
            const ethereum = window.ethereum as EthereumProvider;
            await ethereum.request({ method: 'eth_requestAccounts' });
            document.body.removeChild(walletModalDiv);
            resolve('metamask');
          } catch (err) {
            console.error('Error triggering MetaMask:', err);
            // If there's an error, still resolve with metamask so the main function can handle it
            document.body.removeChild(walletModalDiv);
            resolve('metamask');
          }
        } else {
          alert('MetaMask is not installed. Please install MetaMask first.');
        }
      });
    }
    
    if (walletconnectBtn) {
      walletconnectBtn.addEventListener('click', () => {
        document.body.removeChild(walletModalDiv);
        resolve('walletconnect');
      });
    }
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.body.removeChild(walletModalDiv);
        // Reject the promise to indicate user cancelled
        resolve('metamask'); // Default to metamask on cancel
      });
    }
  });
}

// Global RPC interceptor to force all requests to use Infura endpoints
function setupRpcInterceptor() {
  const originalFetch = window.fetch;
  window.fetch = async function(input, init) {
    // Check if this is an RPC request to Base or Polygon
    if (typeof input === 'string') {
      // Redirect Base RPC requests
      if (input.includes('mainnet.base.org') || 
          input.includes('base-mainnet') || 
          input.includes('base.publicnode.com')) {
        console.log(`🔄 Intercepting Base RPC request to ${input}, redirecting to Infura`);
        input = BASE_RPC_URL;
      }
      
      // Redirect Polygon RPC requests
      if (input.includes('polygon-rpc') || 
          input.includes('polygon-mainnet') || 
          input.includes('polygon.publicnode.com')) {
        console.log(`🔄 Intercepting Polygon RPC request to ${input}, redirecting to Infura`);
        input = POLYGON_RPC_URL;
      }
    }
    
    return originalFetch.call(window, input, init);
  };
  
  console.log('✅ Global RPC interceptor installed');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupRpcInterceptor();
  init();
});

// Listen for account changes
if (window.ethereum) {
  const ethereum = window.ethereum as EthereumProvider;
  ethereum.on('accountsChanged', (accounts: string[]) => {
    if (accounts.length === 0) {
      // User disconnected wallet
      userAddress = '0x0000000000000000000000000000000000000000' as Address; // Use zero address as placeholder
      walletAddressSpan.textContent = 'Not connected';
      connectWalletBtn.textContent = 'Connect Wallet';
      connectWalletBtn.disabled = false;
      retireBtn.disabled = true;
      // Reset wallet client
      walletClient = undefined;
    } else {
      // User switched accounts
      userAddress = accounts[0] as Address;
      walletAddressSpan.textContent = userAddress;
      
      // Update wallet client with new account
      walletClient = createWalletClient({
        account: userAddress,
        chain: customBaseChain,
        transport: custom(window.ethereum)
      });
      // Force the RPC URL for all HTTP requests
      // @ts-ignore - Adding a custom property to override RPC URL
      walletClient.transport.url = BASE_RPC_URL;
      console.log('Updated wallet client with new account and forced Infura RPC URL');
    }
  });
  
  // Listen for chain changes
  ethereum.on('chainChanged', (chainIdHex: string) => {
    // Force page refresh on chain change
    window.location.reload();
  });
}

// Add TypeScript interface for Ethereum provider without modifying Window
// This avoids conflicts with existing ethereumWindow.ethereum declarations
interface EthereumWindow extends Window {
  ethereum?: EthereumProvider;
}

// Use type assertion when accessing ethereumWindow.ethereum
const ethereumWindow = window as EthereumWindow;

export { connectWallet, switchToBaseNetwork, executeRetirement };
