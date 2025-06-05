import { ethers } from 'ethers';
import { createAcrossClient } from '@across-protocol/app-sdk';

// Constants
const BASE_CHAIN_ID = 8453;
const POLYGON_CHAIN_ID = 137;
const FACILITATOR_ADDRESS = '0xAa84Ef9CB72641E14A0453757fB908c7c950C2f2';

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

// State
let provider;
let signer;
let userAddress;
let acrossClient;

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
  const beneficiaryName = beneficiaryNameInput.value.trim() || 'OffsetZap User';
  let beneficiaryAddress = beneficiaryAddressInput.value.trim();
  if (!beneficiaryAddress) beneficiaryAddress = userAddress;
  const poolToken = poolTokenSelect.value;
  
  // Validate amount
  let amount;
  try {
    amount = ethers.utils.parseUnits(amountStr, 6);
  } catch (e) {
    showStatus('Invalid USDC amount', 'error');
    return;
  }
  
  showStatus('Preparing Across Protocol bridge...', 'info');
  
  try {
    // Prepare Across client
    if (!acrossClient) {
      acrossClient = createAcrossClient({
        integratorId: '0xdead',
        chains: [BASE_CHAIN_ID, POLYGON_CHAIN_ID],
      });
    }
    
    // Prepare message
    const messageData = {
      beneficiary: beneficiaryAddress,
      beneficiaryName: beneficiaryName,
      poolToken: poolToken
    };
    const jsonMessage = JSON.stringify(messageData);
    const messageHex = '0x' + Array.from(new TextEncoder().encode(jsonMessage))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Prepare route
    const route = {
      originChainId: BASE_CHAIN_ID,
      destinationChainId: POLYGON_CHAIN_ID,
      inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
      outputToken: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon
      recipient: FACILITATOR_ADDRESS,
      message: messageHex
    };
    
    showStatus('Getting quote from Across Protocol...', 'info');
    const quote = await acrossClient.getQuote({ route, inputAmount: amount });
    
    showStatus('Executing bridge transaction...', 'info');
    
    // Create wallet client for Across SDK
    const walletClient = {
      account: {
        address: userAddress
      },
      sendTransaction: async (tx) => {
        console.log('Transaction request:', JSON.stringify(tx, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        ));
        
        // Create a safe transaction request with proper error handling
        try {
          const txRequest = {
            to: tx.to,
            from: tx.from || userAddress,
            data: tx.data
          };
          
          // Handle value safely
          if (tx.value !== undefined && tx.value !== null) {
            try {
              txRequest.value = ethers.BigNumber.from(tx.value.toString ? tx.value.toString() : String(tx.value));
              console.log('Value processed successfully:', txRequest.value.toString());
            } catch (err) {
              console.error('Error processing value:', err);
              // Default to zero if there's an error
              txRequest.value = ethers.BigNumber.from(0);
            }
          }
          
          // Handle gas safely
          if (tx.gas !== undefined && tx.gas !== null) {
            try {
              txRequest.gasLimit = ethers.BigNumber.from(tx.gas.toString ? tx.gas.toString() : String(tx.gas));
              console.log('Gas limit processed successfully:', txRequest.gasLimit.toString());
            } catch (err) {
              console.error('Error processing gas limit:', err);
              // Don't set gasLimit if there's an error - let the provider estimate it
            }
          }
          
          console.log('Final transaction request:', txRequest);
          const txResponse = await signer.sendTransaction(txRequest);
          console.log('Transaction sent successfully:', txResponse.hash);
          return txResponse.hash;
        } catch (err) {
          console.error('Error sending transaction:', err);
          throw err;
        }
      },
      signTypedData: async (data) => {
        try {
          console.log('Signing typed data:', data);
          return await signer._signTypedData(
            data.domain,
            data.types,
            data.message
          );
        } catch (err) {
          console.error('Error signing typed data:', err);
          throw err;
        }
      },
      getAddress: async () => userAddress
    };
    
    await acrossClient.executeQuote({
      walletClient,
      deposit: quote.deposit,
      onProgress: progress => {
        if (progress.step === 'approve' && progress.status === 'txSuccess') {
          showStatus('USDC approval tx: ' + progress.txReceipt.transactionHash, 'success');
        }
        if (progress.step === 'deposit' && progress.status === 'txSuccess') {
          showStatus('Deposit sent! Hash: ' + progress.txReceipt.transactionHash, 'success');
          showResult(`<div><b>Deposit Tx:</b> <a href='https://basescan.org/tx/${progress.txReceipt.transactionHash}' target='_blank'>View on BaseScan</a></div>`);
        }
        if (progress.step === 'fill' && progress.status === 'txSuccess') {
          showStatus('Fill complete! Hash: ' + progress.txReceipt.transactionHash, 'success');
          showResult(`<div><b>Fill Tx:</b> <a href='https://polygonscan.com/tx/${progress.txReceipt.transactionHash}' target='_blank'>View on PolygonScan</a></div>`);
        }
      }
    });
  } catch (err) {
    showStatus('Bridge or retirement failed: ' + (err.message || err), 'error');
  }
}

export { connectWallet, executeRetirement, switchToBaseNetwork };
