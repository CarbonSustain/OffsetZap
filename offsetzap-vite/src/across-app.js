import { ethers } from 'ethers';
import { createAcrossClient } from '@across-protocol/app-sdk';

// Global client instance
let acrossClient = null;

// Buffer polyfill for browser environment
const toHexString = (bytes) => {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

// Helper function to encode strings to hex without using Buffer
function stringToHex(str) {
  return '0x' + toHexString(new TextEncoder().encode(str));
}

// Fix for Buffer not being available in browser
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  console.log('Adding Buffer polyfill for browser environment');
  window.Buffer = {
    from: (data, encoding) => {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data);
      }
      return data;
    },
    isBuffer: () => false
  };
}

// Constants
const BASE_CHAIN_ID = 8453;
const POLYGON_CHAIN_ID = 137;

// Facilitator contract on Polygon that will handle the retirement
const FACILITATOR_ADDRESS = '0x1358a1b9a4F6Cb95e7df2D5E7303C6c2f96D6516';

// Across multicall handler on Polygon
const ACROSS_MULTICALL_HANDLER = '0x924a9f036260DdD5808007E1AA95f08eD08aA569';

// Token addresses
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// DOM Elements
let connectButton;
let networkButton;
let retireButton;
let usdcAmountInput;
let beneficiaryNameInput;
let beneficiaryAddressInput;
let poolTokenSelect;
let statusMessageEl;
let resultCardEl;
let resultContentEl;

// Global variables
let provider;
let signer;
let userAddress;

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  connectButton = document.getElementById('connect-button');
  networkButton = document.getElementById('network-button');
  retireButton = document.getElementById('retire-button');
  usdcAmountInput = document.getElementById('usdc-amount');
  beneficiaryNameInput = document.getElementById('beneficiary-name');
  beneficiaryAddressInput = document.getElementById('beneficiary-address');
  poolTokenSelect = document.getElementById('pool-token');
  statusMessageEl = document.getElementById('status-message');
  resultCardEl = document.getElementById('result-card');
  resultContentEl = document.getElementById('result-content');

  // Add event listeners
  connectButton.addEventListener('click', connectWallet);
  networkButton.addEventListener('click', switchToBaseNetwork);
  retireButton.addEventListener('click', executeRetirement);

  // Initialize UI
  clearStatus();
  clearResult();
});

// Connect to wallet
async function connectWallet() {
  clearStatus();
  try {
    if (!window.ethereum) {
      showStatus('Please install MetaMask or another Ethereum wallet.', 'error');
      return;
    }

    // Request accounts
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    
    // Check network
    const network = await provider.getNetwork();
    if (network.chainId !== BASE_CHAIN_ID) {
      showStatus('Connected! Please switch to Base network (Chain ID: 8453)', 'warning');
      networkButton.classList.remove('hidden');
      retireButton.disabled = true;
    } else {
      showStatus('Connected to wallet on Base network!', 'success');
      networkButton.classList.add('hidden');
      retireButton.disabled = false;
    }
    
    // Update UI
    connectButton.textContent = userAddress.substring(0, 6) + '...' + userAddress.substring(38);
    connectButton.disabled = true;
  } catch (err) {
    showStatus('Failed to connect wallet: ' + (err.message || err), 'error');
  }
}

// UI Helper functions
function showStatus(message, type = 'info') {
  statusMessageEl.textContent = message;
  statusMessageEl.className = 'status status-' + type;
  statusMessageEl.classList.remove('hidden');
}

function clearStatus() {
  statusMessageEl.textContent = '';
  statusMessageEl.className = 'status hidden';
}

function showResult(html) {
  resultCardEl.classList.remove('hidden');
  resultContentEl.innerHTML = html;
}

function clearResult() {
  resultCardEl.classList.add('hidden');
  resultContentEl.innerHTML = '';
}

// Switch to Base network
function switchToBaseNetwork() {
  if (!window.ethereum) return;
  window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x2105' }], // 8453 in hex for Base
  });
}

// Execute retirement
async function executeRetirement() {
  console.log('Executing retirement...');
  clearStatus();
  clearResult();
  
  if (!signer || !userAddress) {
    showStatus('Connect your wallet first.', 'error');
    return;
  }
  
  // Check network
  const network = await provider.getNetwork();
  if (network.chainId !== BASE_CHAIN_ID) {
    showStatus('Please switch to Base network (Chain ID: 8453)', 'warning');
    return;
  }
  
  // Get form values
  const amountStr = usdcAmountInput.value.trim();
  if (!amountStr) {
    showStatus('Please enter a USDC amount', 'error');
    return;
  }
  
  const beneficiaryName = beneficiaryNameInput.value.trim() || 'OffsetZap User';
  let beneficiaryAddress = beneficiaryAddressInput.value.trim();
  if (!beneficiaryAddress) beneficiaryAddress = userAddress;
  const poolToken = poolTokenSelect.value;
  
  console.log('Form values:', { amountStr, beneficiaryName, beneficiaryAddress, poolToken });
  
  // Validate amount
  let amount;
  try {
    amount = ethers.utils.parseUnits(amountStr, 6);
    console.log('Parsed amount:', amount.toString());
  } catch (e) {
    console.error('Error parsing amount:', e);
    showStatus('Invalid USDC amount', 'error');
    return;
  }
  
  // Check if amount is valid
  if (amount.lte(0)) {
    showStatus('Amount must be greater than 0', 'error');
    return;
  }
  
  showStatus('Preparing Across Protocol bridge...', 'info');
  
  try {
    // Prepare Across client
    console.log('Preparing Across client...');
    
    try {
      // Always create a fresh client to avoid stale state issues
      acrossClient = createAcrossClient({
        integratorId: '0x4f66', // OffsetZap integrator ID
        chains: [BASE_CHAIN_ID, POLYGON_CHAIN_ID],
      });
    } catch (clientError) {
      console.error('Error creating Across client:', clientError);
      throw new Error(`Failed to initialize Across client: ${clientError.message || clientError}`);
    }
    
    console.log('Across client created successfully');
    
    // Prepare message - IMPORTANT: Use the user's wallet address as beneficiary
    // This ensures the KlimaDAO retirement NFT is sent to a wallet that can receive it
    // Using a contract address as beneficiary would cause the transaction to fail
    const retirementParams = {
      beneficiary: userAddress, // Always use the user's wallet address to receive the NFT
      beneficiaryName: beneficiaryName,
      poolToken: poolToken
    };
    
    console.log('Retirement parameters:', retirementParams);
    const jsonMessage = JSON.stringify(retirementParams);
    // Use our helper function instead of direct TextEncoder usage
    const retirementParamsHex = stringToHex(jsonMessage);
    
    console.log('Retirement params hex:', retirementParamsHex);
    
    // Encode the transfer call to send USDC directly to the facilitator
    const transferCalldata = {
      name: 'transfer',
      type: 'function',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable'
    };
    
    console.log('Transfer calldata prepared');
    
    // Encode the facilitator's handleAcrossTransfer function
    const facilitatorCalldata = {
      name: 'handleAcrossTransfer',
      type: 'function',
      inputs: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'message', type: 'bytes' }
      ],
      outputs: [],
      stateMutability: 'nonpayable'
    };
    
    console.log('Retirement params hex:', retirementParamsHex);
    
    // Encode the multicall message with initial values (will be updated with exact output amount later)
    // Make sure we're using ethers.utils for encoding to avoid Buffer issues
    const messageHex = ethers.utils.defaultAbiCoder.encode(
      [
        {
          type: 'tuple',
          components: [
            {
              type: 'tuple[]',
              name: 'calls',
              components: [
                { type: 'address', name: 'target' },
                { type: 'bytes', name: 'callData' },
                { type: 'uint256', name: 'value' }
              ]
            },
            { type: 'address', name: 'fallbackRecipient' }
          ]
        }
      ],
      [
        {
          calls: [
            {
              // First call: Transfer USDC directly to the facilitator
              target: USDC_POLYGON,
              callData: '0x', // Placeholder - will be updated with exact amount
              value: 0
            },
            {
              // Second call: Call the facilitator's handleAcrossTransfer function
              target: FACILITATOR_ADDRESS,
              callData: '0x', // Placeholder - will be updated with exact amount
              value: 0
            }
          ],
          fallbackRecipient: userAddress // Use user address as fallback recipient
        }
      ]
    );
    
    // Prepare route using the multicall handler as recipient
    const route = {
      originChainId: BASE_CHAIN_ID,
      destinationChainId: POLYGON_CHAIN_ID,
      inputToken: USDC_BASE,
      outputToken: USDC_POLYGON,
      recipient: ACROSS_MULTICALL_HANDLER, // Use the multicall handler instead of facilitator directly
      message: messageHex
    };
    
    showStatus('Getting quote from Across Protocol...', 'info');
    console.log('Requesting quote with route:', route);
    console.log('Input amount:', amount.toString());
    
    console.log('Requesting quote with route:', JSON.stringify(route, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ));
    console.log('Input amount:', amount.toString());
    
    // Make sure acrossClient is defined before calling getQuote
    if (!acrossClient) {
      throw new Error('Across client is not initialized');
    }
    
    // Get quote with proper error handling
    let quote;
    try {
      // Ensure route and inputAmount are properly formatted
      const quoteParams = {
        route: {
          ...route,
          originChainId: Number(route.originChainId),
          destinationChainId: Number(route.destinationChainId)
        },
        inputAmount: amount
      };
      
      console.log('Quote params:', JSON.stringify(quoteParams, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
      ));
      
      quote = await acrossClient.getQuote(quoteParams);
      console.log('Quote received successfully');
      console.log('Quote details:', JSON.stringify(quote, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
      ));
    } catch (quoteError) {
      console.error('Error getting quote:', quoteError);
      throw new Error(`Failed to get quote: ${quoteError.message || quoteError}`);
    }
    
    if (!quote || !quote.deposit) {
      throw new Error('Invalid quote received from Across Protocol');
    }
    
    // Extract the exact output amount that will be received on the destination chain
    const outputAmount = quote.deposit.outputAmount;
    console.log(`Output amount after fees: ${outputAmount}`);
    
    // Now that we have the exact output amount, update our calls to use this amount
    // Encode the transfer call with the exact output amount
    const updatedTransferCalldata = ethers.utils.encodeFunctionData(
      transferCalldata,
      [FACILITATOR_ADDRESS, outputAmount]
    );
    
    // Encode the facilitator call with the exact output amount
    const updatedFacilitatorCalldata = ethers.utils.encodeFunctionData(
      facilitatorCalldata,
      [FACILITATOR_ADDRESS, outputAmount, retirementParamsHex]
    );
    
    // Update the route message with the updated call data
    const updatedMessageHex = ethers.utils.defaultAbiCoder.encode(
      [
        {
          type: 'tuple',
          components: [
            {
              type: 'tuple[]',
              name: 'calls',
              components: [
                { type: 'address', name: 'target' },
                { type: 'bytes', name: 'callData' },
                { type: 'uint256', name: 'value' }
              ]
            },
            { type: 'address', name: 'fallbackRecipient' }
          ]
        }
      ],
      [
        {
          calls: [
            {
              // First call: Transfer USDC directly to the facilitator with exact amount
              target: USDC_POLYGON,
              callData: updatedTransferCalldata,
              value: 0
            },
            {
              // Second call: Call the facilitator's handleAcrossTransfer function with exact amount
              target: FACILITATOR_ADDRESS,
              callData: updatedFacilitatorCalldata,
              value: 0
            }
          ],
          fallbackRecipient: userAddress // Use user address as fallback recipient
        }
      ]
    );
    
    // Update the route with the new message
    route.message = updatedMessageHex;
    
    // IMPORTANT: We also need to update the quote's deposit message directly
    // This ensures the Across SDK uses our updated message with the correct output amount
    if (quote && quote.deposit) {
      quote.deposit.message = updatedMessageHex;
      console.log('Updated quote deposit message');
    } else {
      console.error('Quote or quote.deposit is undefined, cannot update message');
      throw new Error('Invalid quote structure - missing deposit information');
    }
    
    console.log('Updated route with exact amounts:', route);
    
    showStatus('Executing bridge transaction...', 'info');
    
    // Log the deposit object
    console.log('Deposit object:', JSON.stringify(quote.deposit, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ));
    
    // Create a simpler wallet client for Across SDK that avoids toString issues
    const walletClient = {
      account: {
        address: userAddress
      },
      sendTransaction: async (tx) => {
        try {
          console.log('Transaction request received:', tx);
          
          // Create a minimal transaction request with only the essential properties
          const txRequest = {
            to: tx.to,
            from: tx.from || userAddress,
            data: tx.data
          };
          
          // Handle value - convert to hex string directly to avoid toString issues
          if (tx.value) {
            console.log('Transaction value type:', typeof tx.value);
            // If it's already a BigNumber, use it directly
            if (ethers.BigNumber.isBigNumber(tx.value)) {
              txRequest.value = tx.value;
            } 
            // If it's a bigint, convert to hex string
            else if (typeof tx.value === 'bigint') {
              txRequest.value = '0x' + tx.value.toString(16);
            }
            // Otherwise try to create a BigNumber
            else {
              try {
                txRequest.value = ethers.BigNumber.from('0x' + Number(tx.value).toString(16));
              } catch (e) {
                console.error('Failed to convert value to BigNumber:', e);
                txRequest.value = ethers.BigNumber.from(0);
              }
            }
          }
          
          // Let the provider handle gas estimation
          console.log('Sending transaction with request:', txRequest);
          const txResponse = await signer.sendTransaction(txRequest);
          console.log('Transaction sent successfully:', txResponse.hash);
          return txResponse.hash;
        } catch (err) {
          console.error('Error in sendTransaction:', err);
          showStatus('Transaction error: ' + (err.message || err), 'error');
          throw err;
        }
      },
      signTypedData: async (data) => {
        try {
          console.log('Signing typed data');
          return await signer._signTypedData(
            data.domain,
            data.types,
            data.message
          );
        } catch (err) {
          console.error('Error in signTypedData:', err);
          showStatus('Signing error: ' + (err.message || err), 'error');
          throw err;
        }
      },
      getAddress: async () => userAddress
    };
    
    // Check if we have a valid deposit object
    if (!quote || !quote.deposit) {
      throw new Error('Invalid quote received - missing deposit information');
    }
    
    console.log('Executing quote with deposit:', JSON.stringify(quote.deposit, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ));
    
    // Execute the quote with proper error handling
    try {
      await acrossClient.executeQuote({
        walletClient,
        deposit: quote.deposit,
        onProgress: (progress) => {
          console.log(`Progress step: ${progress.step}, status: ${progress.status}`);
          
          if (progress.step === 'approve' && progress.status === 'txSuccess') {
            const { txReceipt } = progress;
            showStatus('USDC approval tx: ' + txReceipt.transactionHash, 'success');
            console.log('Approval receipt:', txReceipt.transactionHash);
          }
          
          if (progress.step === 'deposit' && progress.status === 'txSuccess') {
            const { depositId, txReceipt } = progress;
            showStatus('Deposit sent! Hash: ' + txReceipt.transactionHash, 'success');
            console.log('Deposit receipt:', txReceipt.transactionHash);
            console.log('Deposit ID:', depositId);
            
            // Show deposit details to user
            showResult(`
              <div class="result-item">
                <h3>Deposit Transaction Sent</h3>
                <p><b>Status:</b> Bridging in progress</p>
                <p><b>Deposit ID:</b> ${depositId}</p>
                <p><b>Transaction:</b> <a href='https://basescan.org/tx/${txReceipt.transactionHash}' target='_blank'>View on BaseScan</a></p>
                <p><small>Your carbon retirement will be processed automatically once funds arrive on Polygon.</small></p>
              </div>
            `);
          }
          
          if (progress.step === 'fill' && progress.status === 'txSuccess') {
            const { fillTxTimestamp, txReceipt, actionSuccess } = progress;
            const status = actionSuccess ? 'Success' : 'Failed';
            const statusClass = actionSuccess ? 'success' : 'error';
            
            console.log('Fill receipt:', txReceipt.transactionHash);
            console.log('Action success:', actionSuccess);
            console.log('Fill timestamp:', fillTxTimestamp);
            
            showStatus(`Carbon retirement ${status}! Hash: ${txReceipt.transactionHash}`, statusClass);
            
            // Show fill details to user
            showResult(`
              <div class="result-item">
                <h3>Carbon Retirement ${status}</h3>
                <p><b>Status:</b> <span class="status-${statusClass}">${status}</span></p>
                <p><b>Transaction:</b> <a href='https://polygonscan.com/tx/${txReceipt.transactionHash}' target='_blank'>View on PolygonScan</a></p>
                <p><b>Beneficiary:</b> ${userAddress}</p>
                <p><b>Completed at:</b> ${new Date(fillTxTimestamp * 1000).toLocaleString()}</p>
                ${actionSuccess ? 
                  `<p><small>An NFT receipt has been minted to your wallet address.</small></p>` : 
                  `<p><small>The retirement action failed. Please contact support with the transaction hash.</small></p>`
                }
              </div>
            `);
          }
        }
      });
    } catch (executeError) {
      console.error('Error executing quote:', executeError);
      throw new Error(`Failed to execute transaction: ${executeError.message || executeError}`);
    }
  } catch (err) {
    showStatus('Bridge or retirement failed: ' + (err.message || err), 'error');
  }
}

export { connectWallet, executeRetirement, switchToBaseNetwork };
