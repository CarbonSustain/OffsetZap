import { ethers } from 'ethers';

// Constants
const BASE_CHAIN_ID = 8453;
const POLYGON_CHAIN_ID = 137;
const BACKEND_URL = 'http://localhost:3000';

// DOM elements
const connectWalletBtn = document.getElementById('connect-button');
const switchNetworkBtn = document.getElementById('network-button');
const retireBtn = document.getElementById('retire-button');
const amountInput = document.getElementById('usdc-amount');
const beneficiaryNameInput = document.getElementById('beneficiary-name');
const beneficiaryAddressInput = document.getElementById('beneficiary-address');
const poolTokenSelect = document.getElementById('pool-token');
const statusDiv = document.getElementById('status-message');
const resultDiv = document.getElementById('result-content');
const walletAddressSpan = document.getElementById('wallet-address') || document.createElement('span'); // Create element if not exists

// Global state
let provider;
let signer;
let userAddress;
let currentChainId;

// Initialize the page
async function init() {
  // Check if MetaMask is installed
  if (typeof window.ethereum !== 'undefined') {
    provider = new ethers.BrowserProvider(window.ethereum);
    
    // Setup event listeners
    connectWalletBtn.addEventListener('click', connectWallet);
    switchNetworkBtn.addEventListener('click', switchToBaseNetwork);
    retireBtn.addEventListener('click', executeRetirement);
    amountInput.addEventListener('input', validateAmount);
    
    // Check if already connected
    try {
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        userAddress = accounts[0].address;
        walletAddressSpan.textContent = userAddress;
        connectWalletBtn.textContent = 'Wallet Connected';
        connectWalletBtn.disabled = true;
        
        // Get current network
        const network = await provider.getNetwork();
        currentChainId = Number(network.chainId);
        
        // Update UI based on network
        updateNetworkUI(currentChainId);
      }
    } catch (err) {
      console.error('Error checking wallet connection:', err);
    }
  } else {
    showStatus('MetaMask is not installed. Please install MetaMask to use this application.', 'error');
    connectWalletBtn.disabled = true;
    switchNetworkBtn.disabled = true;
    retireBtn.disabled = true;
  }
}

// Connect wallet function
async function connectWallet() {
  try {
    showStatus('Connecting to wallet...', 'info');
    
    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    userAddress = accounts[0];
    walletAddressSpan.textContent = userAddress;
    
    // Update UI
    connectWalletBtn.textContent = 'Wallet Connected';
    connectWalletBtn.disabled = true;
    
    // Get signer
    signer = await provider.getSigner();
    
    // Get current network
    const network = await provider.getNetwork();
    currentChainId = Number(network.chainId);
    
    // Update UI based on network
    updateNetworkUI(currentChainId);
    
    showStatus('Wallet connected successfully', 'success');
  } catch (err) {
    console.error('Error connecting wallet:', err);
    showStatus('Failed to connect wallet: ' + (err.message || err), 'error');
  }
}

// Switch to Base network
async function switchToBaseNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x2105' }], // Base chainId in hex
    });
    
    // Update network info after switch
    const network = await provider.getNetwork();
    currentChainId = Number(network.chainId);
    
    // Update UI
    updateNetworkUI(currentChainId);
    
    showStatus('Switched to Base network', 'success');
  } catch (err) {
    if (err.code === 4902) {
      // Chain not added, try to add it
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x2105',
            chainName: 'Base Mainnet',
            nativeCurrency: {
              name: 'Ethereum',
              symbol: 'ETH',
              decimals: 18
            },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org']
          }]
        });
        
        // Try switching again
        await switchToBaseNetwork();
      } catch (addErr) {
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
function updateNetworkUI(chainId) {
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
function validateAmount() {
  const amountStr = amountInput.value.trim();
  if (!amountStr || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
    retireBtn.disabled = true;
    return false;
  }
  
  // Only enable if on Base network
  retireBtn.disabled = currentChainId !== BASE_CHAIN_ID;
  return true;
}

// Execute retirement function
async function executeRetirement() {
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
    
    // Show loading status
    showStatus('Requesting quote from backend...', 'info');
    
    // Request quote from backend
    const response = await fetch(`${BACKEND_URL}/api/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amountStr,
        beneficiaryName,
        beneficiaryAddress,
        poolToken,
        userAddress
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get quote from backend');
    }
    
    const quoteData = await response.json();
    console.log('Quote received:', quoteData);
    
    if (!quoteData.success || !quoteData.quote || !quoteData.route) {
      throw new Error('Invalid quote response from backend');
    }
    
    // Parse the amount for approval
    const amount = ethers.parseUnits(amountStr, 6);
    
    // Get the USDC contract on Base
    const usdcContract = new ethers.Contract(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      ['function approve(address spender, uint256 amount) public returns (bool)'],
      signer
    );
    
    // Get the Across deposit contract address
    const spokePool = quoteData.quote.deposit.spokePool;
    
    // Show approval status
    showStatus('Approving USDC for Across bridge...', 'info');
    
    // Approve the Across deposit contract to spend USDC
    const approveTx = await usdcContract.approve(spokePool, amount);
    console.log('Approval transaction sent:', approveTx.hash);
    
    // Wait for approval confirmation
    showStatus(`USDC approval pending. Hash: ${approveTx.hash}`, 'info');
    const approveReceipt = await approveTx.wait();
    showStatus(`USDC approval confirmed! Hash: ${approveReceipt.transactionHash}`, 'success');
    
    // Show deposit details to user
    showResult(`
      <div class="result-item">
        <h3>USDC Approval Confirmed</h3>
        <p><b>Transaction:</b> <a href='https://basescan.org/tx/${approveReceipt.transactionHash}' target='_blank'>View on BaseScan</a></p>
      </div>
    `);
    
    // Now execute the deposit
    showStatus('Executing Across deposit...', 'info');
    
    // Get gas options for the transaction
    let gasOptions = {};
    try {
      const feeData = await provider.getFeeData();
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // EIP-1559 transaction
        gasOptions = {
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        };
      } else if (feeData.gasPrice) {
        // Legacy transaction
        gasOptions = { gasPrice: feeData.gasPrice };
      }
    } catch (feeError) {
      console.warn('Error getting fee data:', feeError);
    }
    
    // Send the deposit transaction with the quote data
    const depositTx = await signer.sendTransaction({
      to: quoteData.quote.deposit.depositAddress,
      data: quoteData.quote.deposit.depositCalldata,
      value: quoteData.quote.deposit.value || 0,
      gasLimit: 800000, // Use a higher gas limit to avoid issues
      ...gasOptions
    });
    
    console.log('Deposit transaction sent:', depositTx.hash);
    showStatus(`Deposit transaction sent! Hash: ${depositTx.hash}`, 'info');
    
    // Wait for deposit confirmation
    const depositReceipt = await depositTx.wait();
    console.log('Deposit confirmed:', depositReceipt);
    
    showStatus('Deposit confirmed! Bridging in progress.', 'success');
    
    // Show deposit details to user
    showResult(`
      <div class="result-item">
        <h3>Deposit Transaction Sent</h3>
        <p><b>Status:</b> Bridging in progress</p>
        <p><b>Transaction:</b> <a href='https://basescan.org/tx/${depositReceipt.transactionHash}' target='_blank'>View on BaseScan</a></p>
        <p><small>Your carbon retirement will be processed automatically once funds arrive on Polygon.</small></p>
      </div>
    `);
    
  } catch (err) {
    console.error('Error executing retirement:', err);
    showStatus('Bridge or retirement failed: ' + (err.message || err), 'error');
  }
}

// Show status message
function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = 'status status-' + type;
  statusDiv.classList.remove('hidden');
}

// Show result HTML
function showResult(html) {
  resultDiv.innerHTML += html;
  document.getElementById('result-card').classList.remove('hidden');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);

// Listen for account changes
if (window.ethereum) {
  window.ethereum.on('accountsChanged', (accounts) => {
    if (accounts.length === 0) {
      // User disconnected wallet
      userAddress = null;
      walletAddressSpan.textContent = 'Not connected';
      connectWalletBtn.textContent = 'Connect Wallet';
      connectWalletBtn.disabled = false;
      retireBtn.disabled = true;
    } else {
      // User switched accounts
      userAddress = accounts[0];
      walletAddressSpan.textContent = userAddress;
    }
  });
  
  // Listen for chain changes
  window.ethereum.on('chainChanged', (chainIdHex) => {
    // Force page refresh on chain change
    window.location.reload();
  });
}

export { connectWallet, switchToBaseNetwork, executeRetirement };
