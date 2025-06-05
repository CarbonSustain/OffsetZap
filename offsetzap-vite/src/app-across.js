/**
 * OffsetZap Frontend Application
 * 
 * This file contains the main application logic for the OffsetZap frontend,
 * integrating the Across Protocol for cross-chain carbon retirement.
 */

import { ethers } from 'ethers';
import { 
  initializeAcross, 
  getAcrossQuote, 
  executeAcrossBridge, 
  callRetireWithUsdc,
  getSupportedInputTokens,
  getPolygonUSDCAddress,
  ACROSS_CHAIN_IDS
} from './across.js';

// -----------------------------------------------------------------------
// Carbon Token Options
// -----------------------------------------------------------------------

/**
 * Carbon token options for retirement
 * 
 * Note: Using lowercase naming convention with underscores (e.g., "toucan_nct") 
 * to match contract expectations and avoid InvalidCarbonType errors
 */
const CARBON_TOKEN_OPTIONS = {
  "nct": { 
    name: "Nature Carbon Tonne", 
    poolAddress: "0xD838290e877E0188a4A44700463419ED96c16107",
    description: "Nature-based carbon credits"
  },
  "bct": { 
    name: "Klima Base Carbon Tonne", 
    poolAddress: "0x2F800Db0fdb5223b3C3f354886d907A671414A7F",
    description: "Base carbon credits via Klima"
  },
  "moss_mco2": { 
    name: "Moss Carbon Credit", 
    poolAddress: "0xFC98e825A2264D890F9a1e68ed50E1526abCcacD",
    description: "Moss Carbon Credits"
  },
  "c3_ubo": { 
    name: "Universal Base Offset", 
    poolAddress: "0x2B3eCb0991AF0498ECE9135bcD04013d7993110c",
    description: "Universal Base Carbon Offset"
  },
  "c3_nbo": { 
    name: "Nature Base Offset", 
    poolAddress: "0x6BCa3B77C1909Ce1a4Ba1A20d1103bDe8d222E48",
    description: "Nature Base Carbon Offset"
  }
};

// -----------------------------------------------------------------------
// App State
// -----------------------------------------------------------------------

// Initialize application state
let state = {
  provider: null,
  signer: null,
  walletClient: null,
  userAddress: null,
  selectedInputToken: 'USDC',
  selectedCarbonType: 'bct',
  selectedPoolToken: null, // Will be set based on carbon type
  amount: '0',
  beneficiaryAddress: null,
  currentQuote: null,
  transactionStatus: 'idle', // idle, loading, success, error
  transactions: []
};

// -----------------------------------------------------------------------
// App Initialization
// -----------------------------------------------------------------------

/**
 * Initialize the application
 */
async function initializeApp() {
  try {
    console.log('Initializing OffsetZap app...');
    
    // Initialize Across Protocol client
    const acrossInitialized = initializeAcross('0x1234');
    if (!acrossInitialized) {
      throw new Error('Failed to initialize Across Protocol client');
    }
    
    // Initialize UI elements
    initializeUI();
    
    // Connect to wallet if available
    if (window.ethereum) {
      await connectWallet();
    }
    
    console.log('App initialized successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    updateStatus('error', 'Failed to initialize application');
  }
}

/**
 * Initialize UI elements
 */
function initializeUI() {
  // Populate input token dropdown
  const inputTokens = getSupportedInputTokens();
  const inputTokenSelect = document.getElementById('input-token-select');
  inputTokenSelect.innerHTML = '';
  
  inputTokens.forEach(token => {
    const option = document.createElement('option');
    option.value = token;
    option.textContent = token;
    inputTokenSelect.appendChild(option);
  });
  
  // Populate carbon token dropdown with our defined options
  const carbonTokenSelect = document.getElementById('carbon-token-select');
  carbonTokenSelect.innerHTML = '';
  
  Object.entries(CARBON_TOKEN_OPTIONS).forEach(([token, details]) => {
    const option = document.createElement('option');
    option.value = token;
    option.textContent = `${token} - ${details.name}`;
    carbonTokenSelect.appendChild(option);
  });
  
  // Set the initial pool token based on the default carbon type
  state.selectedPoolToken = CARBON_TOKEN_OPTIONS[state.selectedCarbonType].poolAddress;
  
  // Set up event listeners
  document.getElementById('connect-wallet-button').addEventListener('click', connectWallet);
  document.getElementById('get-quote-button').addEventListener('click', getQuote);
  document.getElementById('submit-retirement-button').addEventListener('click', submitRetirement);
  
  // Input change handlers
  inputTokenSelect.addEventListener('change', (e) => {
    state.selectedInputToken = e.target.value;
    clearQuote();
  });
  
  carbonTokenSelect.addEventListener('change', (e) => {
    state.selectedCarbonType = e.target.value;
    // Update the selected pool token address based on the carbon type
    state.selectedPoolToken = CARBON_TOKEN_OPTIONS[state.selectedCarbonType].poolAddress;
    console.log(`Selected carbon token: ${state.selectedCarbonType}, Pool address: ${state.selectedPoolToken}`);
    clearQuote();
  });
  
  document.getElementById('amount-input').addEventListener('input', (e) => {
    state.amount = e.target.value;
    clearQuote();
  });
  
  document.getElementById('beneficiary-input').addEventListener('input', (e) => {
    state.beneficiary = e.target.value;
  });
}

// -----------------------------------------------------------------------
// Wallet Connection
// -----------------------------------------------------------------------

/**
 * Connect to the user's wallet
 */
async function connectWallet() {
  try {
    // Check if MetaMask is installed
    if (!window.ethereum) {
      throw new Error('MetaMask not detected. Please install MetaMask to use this app.');
    }
    
    updateStatus('loading', 'Connecting wallet...');
    
    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    if (accounts.length === 0) {
      throw new Error('No accounts found. Please unlock your MetaMask wallet.');
    }
    
    // Get the connected account
    state.userAddress = accounts[0];
    
    // Create ethers provider and signer
    state.provider = new ethers.providers.Web3Provider(window.ethereum);
    state.signer = state.provider.getSigner();
    
    // Create a wallet client compatible with Across SDK
    state.walletClient = {
      address: state.userAddress,
      signMessage: async (message) => {
        return await state.signer.signMessage(message);
      },
      sendTransaction: async (tx) => {
        // Format transaction for ethers
        const transaction = {
          to: tx.to,
          data: tx.data,
          value: tx.value,
          gasLimit: tx.gas
        };
        
        // Update UI with transaction hash
        const result = await state.signer.sendTransaction(transaction);
        if (result && result.hash) {
          console.log("Transaction successful with hash:", result.hash);
          updateStatus('success', `Transaction submitted! Hash: ${result.hash}`);
          addTransaction({
            hash: result.hash,
            type: 'retirement',
            status: 'pending',
            timestamp: Date.now(),
            amount: state.amount,
            token: state.selectedInputToken,
            carbonType: state.selectedCarbonType
          });
          console.log("add transaction:", addTransaction);
        } else {
          console.warn("Transaction result missing hash:", result);
          updateStatus('error', 'Failed to get transaction hash');
        }
      }
    };
    
    // Update UI to show connected wallet
    document.getElementById('wallet-address').textContent = state.userAddress.substring(0, 6) + '...' + 
      state.userAddress.substring(state.userAddress.length - 4);
    
    // Check if we're on the correct network (Base)
    const network = await state.provider.getNetwork();
    if (network.chainId !== ACROSS_CHAIN_IDS.BASE) {
      updateStatus('warning', `Please switch to Base network (Chain ID: ${ACROSS_CHAIN_IDS.BASE})`);
      
      // Prompt user to switch to Base
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${ACROSS_CHAIN_IDS.BASE.toString(16)}` }]
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          updateStatus('error', 'Base network not found in your wallet. Please add it manually.');
        }
        throw switchError;
      }
    }
    
    // Enable the get quote button
    document.getElementById('get-quote-button').disabled = false;
    
    updateStatus('success', 'Wallet connected successfully');
    console.log('Wallet connected:', state.userAddress);
  } catch (error) {
    console.error('Failed to connect wallet:', error);
    updateStatus('error', `Failed to connect wallet: ${error.message}`);
  }
}

// -----------------------------------------------------------------------
// Quote Handling
// -----------------------------------------------------------------------

/**
 * Get a quote for the current input parameters
 */
async function getQuote() {
  if (!state.userAddress || !state.provider) {
    updateStatus('error', 'Please connect your wallet first');
    return;
  }
  
  const amountInput = document.getElementById('amount-input').value;
  if (!amountInput || parseFloat(amountInput) <= 0) {
    updateStatus('error', 'Please enter a valid amount');
    return;
  }
  
  state.amount = amountInput;
  
  try {
    updateStatus('loading', 'Fetching quote from Across Protocol...');
    
    // Get beneficiary name from input
    const beneficiaryNameInput = document.getElementById('beneficiary-name-input').value;
    const beneficiaryName = beneficiaryNameInput || 'OffsetZap User';
    
    // Get quote from Across Protocol
    state.currentQuote = await getAcrossQuote({
      inputTokenSymbol: state.selectedInputToken,
      amount: state.amount,
      recipient: state.userAddress,
      beneficiaryName: beneficiaryName
    });
    
    // Store beneficiary name in state for later use
    state.beneficiaryName = beneficiaryName;
    
    // Display quote details
    updateQuoteDisplay(state.currentQuote);
    
    // Enable submit button
    document.getElementById('submit-retirement-button').disabled = false;
    
    updateStatus('success', 'Quote received successfully');
  } catch (error) {
    console.error('Failed to get quote:', error);
    updateStatus('error', `Quote failed: ${error.message}`);
    
    // Disable submit button
    document.getElementById('submit-retirement-button').disabled = true;
  }
}

/**
 * Update the quote display in the UI
 * @param {Object} quote - The quote object from Across Protocol
 */
function updateQuoteDisplay(quote) {
  if (!quote || !quote.deposit) {
    console.error('Invalid quote object');
    return;
  }
  
  const quoteDetails = document.getElementById('quote-details');
  
  // Format the output amount (USDC on Polygon has 6 decimals)
  const outputAmount = ethers.utils.formatUnits(
    quote.deposit.outputAmount.toString(),
    6
  );
  
  // Calculate total fee
  const totalFee = ethers.utils.formatUnits(
    quote.fees.totalRelayFee.total.toString(),
    6
  );
  
  // Calculate time to fill in minutes
  const estimatedTimeMin = Math.ceil(quote.estimatedFillTimeSec / 60);
  
  // Create the quote details HTML
  quoteDetails.innerHTML = `
    <div class="quote-item">
      <span>You'll receive:</span>
      <span>${parseFloat(outputAmount).toFixed(4)} USDC on Polygon</span>
    </div>
    <div class="quote-item">
      <span>Fee:</span>
      <span>${parseFloat(totalFee).toFixed(4)} USDC</span>
    </div>
    <div class="quote-item">
      <span>Estimated time:</span>
      <span>~${estimatedTimeMin} minutes</span>
    </div>
  `;
  
  // Show the quote section
  document.getElementById('quote-section').style.display = 'block';
}

/**
 * Clear the current quote
 */
function clearQuote() {
  state.currentQuote = null;
  document.getElementById('quote-details').innerHTML = '';
  document.getElementById('quote-section').style.display = 'none';
  document.getElementById('submit-retirement-button').disabled = true;
}

// -----------------------------------------------------------------------
// Retirement Submission
// -----------------------------------------------------------------------

/**
 * Submit the retirement transaction
 */
async function submitRetirement() {
  if (!state.userAddress || !state.provider) {
    updateStatus('error', 'Please connect your wallet first');
    return;
  }
  
  if (!state.currentQuote) {
    updateStatus('error', 'Please get a quote first');
    return;
  }
  
  // Get beneficiary address from input or use wallet address
  const beneficiaryInput = document.getElementById('beneficiary-input').value;
  state.beneficiaryAddress = beneficiaryInput || state.userAddress;
  
  // Get beneficiary name from input
  const beneficiaryNameInput = document.getElementById('beneficiary-name-input').value;
  state.beneficiaryName = beneficiaryNameInput || 'OffsetZap User';
  
  try {
    updateStatus('loading', 'Submitting retirement transaction...');
    
    // Create a placeholder transaction with a temporary ID before we have the hash
    // This allows us to track the transaction even if we don't get a hash immediately
    const tempTxId = `temp-${Date.now()}`;
    
    // Add a placeholder transaction to the list
    addTransaction({
      hash: tempTxId,
      type: 'bridge',
      status: 'pending',
      timestamp: Date.now(),
      amount: state.amount,
      token: state.selectedInputToken,
      carbonType: state.selectedCarbonType,
      statusMessage: 'Preparing bridging transaction...'
    });
    
    // Execute the bridge transaction with retirement message
    const result = await executeAcrossBridge(
      state.currentQuote,
      state.walletClient,
      state.selectedCarbonType,
      state.beneficiaryAddress,
      state.selectedPoolToken,
      // Wrap the updateTransactionStatus to handle the temp transaction ID
      (progress) => {
        try {
          // Skip BigInt errors if we already have a transaction hash
          if (progress.status === "txError" && 
              progress.error && progress.error.message && 
              progress.error.message.includes("BigInt") &&
              tempTxId && document.querySelector(`#tx-${tempTxId} .tx-hash`).textContent.includes('0x')) {
            console.log("Ignoring BigInt error since we already have a transaction hash");
            return;
          }
          
          // If we get a hash in the progress update, update our temp transaction
          if ((progress.txHash || progress.hash) && tempTxId) {
            const realHash = progress.txHash || progress.hash;
            // Update the temporary transaction with the real hash
            updateTransactionInList(tempTxId, {
              hash: realHash,
              statusMessage: `Transaction hash received: ${realHash.substring(0, 10)}...`
            });
          }
          
          // Pass to the normal handler
          updateTransactionStatus(progress);
        } catch (callbackError) {
          console.warn("Error in progress callback:", callbackError);
          // Don't let callback errors break the flow
        }
      },
      state.beneficiaryName // Pass the beneficiary name
    );
    
    // Validate transaction result
    if (!result || !result.hash) {
      console.error('Invalid transaction result:', result);
      // Update the temp transaction instead of throwing
      updateTransactionInList(tempTxId, {
        status: 'error',
        statusMessage: 'Failed to get transaction hash from bridge execution'
      });
      // Stop the process here since we have no hash to track
      throw new Error('Failed to get transaction hash from bridge execution');
    } else {
      console.log('Bridge transaction successful:', result);
      
      // Update the transaction in the list with the real hash
      updateTransactionInList(tempTxId, {
        hash: result.hash,
        status: 'pending',
        statusMessage: 'Bridging transaction submitted to blockchain'
      });
      
      // Check if this was a simulation failure but we should continue
      if (result.simulationFailed) {
        console.warn('Transaction simulation failed but we have a hash. Continuing with the process.');
        updateStatus('warning', 'Transaction simulation had issues but we are continuing with the process...');
      }
    }
    
    // Create transaction explorer link
    const txExplorerUrl = `https://basescan.org/tx/${result.hash}`;
    console.log('Bridge transaction can be viewed at:', txExplorerUrl);
    
    updateStatus('loading', 'Bridging transaction submitted. Waiting for funds to arrive on Polygon...');
    
    // No longer need to manually retire carbon as we're bridging directly to the retirement contract
    // which will automatically retire carbon upon receiving the bridged tokens
    /*
    // Wait for funds to arrive on Polygon (30 seconds is a conservative estimate)
    // In production, you might want to implement a polling mechanism instead
    try {
      await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds wait
      
      updateStatus('loading', 'Initiating carbon retirement on Polygon...');
      
      // Call the retirement function on the facilitator contract
      const retirementResult = await callRetireWithUsdc(
        state.provider,
        state.currentQuote.deposit.outputAmount,
        state.beneficiaryName,
        state.beneficiaryAddress,
        state.selectedPoolToken,
        updateTransactionStatus
      );
      
      console.log('Retirement transaction successful:', retirementResult);
      
      // Add retirement transaction to the list
      addTransaction({
        hash: retirementResult.hash,
        type: 'retirement',
        status: retirementResult.status === 'success' ? 'confirmed' : 'failed',
        timestamp: Date.now(),
        amount: state.amount,
        token: 'USDC',
        carbonType: state.selectedCarbonType,
        statusMessage: retirementResult.status === 'success' 
          ? `Successfully retired carbon credits for ${state.beneficiaryName}` 
          : 'Carbon retirement transaction failed'
      });
      
      // Create retirement transaction explorer link
      const retirementTxUrl = `https://polygonscan.com/tx/${retirementResult.hash}`;
      console.log('Retirement transaction can be viewed at:', retirementTxUrl);
      
      updateStatus('success', `Complete! Bridge: ${result.hash.substring(0, 10)}... | Retirement: ${retirementResult.hash.substring(0, 10)}...`);
    } catch (retirementError) 
    {
      console.error('Retirement transaction failed:', retirementError);
      updateStatus('error', `Bridging succeeded but retirement failed: ${retirementError.message}`);
    }
    */
    
    // Update status to show that bridging was successful and provide information about the cross-chain message execution
    let statusMessage = `Bridging complete! Transaction: ${result.hash.substring(0, 10)}...`;
    
    // If we have information about the fill transaction, include it
    if (result.fillHash) {
      statusMessage += `\nFill transaction: ${result.fillHash.substring(0, 10)}...`;
    }
    
    // If we have information about the cross-chain action success, include it
    if (result.actionSuccess === false) {
      statusMessage += `\n⚠️ Warning: The tokens were transferred to the contract, but the automatic retirement may not have been triggered.`;
      statusMessage += `\nYou may need to check the contract on Polygonscan to verify if retirement occurred.`;
    } else if (result.actionSuccess === true) {
      statusMessage += `\n✅ Carbon retirement was automatically triggered.`;
    } else {
      statusMessage += `\nCarbon retirement will happen automatically if the cross-chain message was executed successfully.`;
    }
    
    // If there's a warning message from the result, include it
    if (result.warning) {
      statusMessage += `\n⚠️ ${result.warning}`;
    }
    
    updateStatus(result.actionSuccess === false ? 'warning' : 'success', statusMessage);
    
    // Clear the form
    resetForm();
  } catch (error) {
    console.error('Failed to submit retirement:', error);
    
    // Check for BigInt conversion error which is likely just a monitoring issue
    if (error.message && error.message.includes('BigInt')) {
      console.warn('BigInt conversion error detected - this is likely a monitoring issue, not a transaction failure');
      
      // Check if we have a transaction hash in the DOM
      const txElements = document.querySelectorAll('.tx-hash');
      let foundHash = null;
      
      // Look through recent transactions in the UI
      for (const el of txElements) {
        const content = el.textContent;
        if (content && content.includes('0x')) {
          foundHash = content.trim();
          console.log('Found transaction hash in UI:', foundHash);
          break;
        }
      }
      
      if (foundHash) {
        // We found a hash, so the transaction might have been submitted successfully
        updateStatus('warning', `Your transaction was likely submitted (${foundHash.substring(0, 10)}...), but we encountered an error monitoring it. Carbon retirement will happen automatically if the transaction succeeds.`);
        
        // Add a transaction to the list so the user can track it
        addTransaction({
          hash: foundHash,
          type: 'bridge',
          status: 'pending',
          timestamp: Date.now(),
          details: `Bridged ${state.amount} ${state.selectedInputToken} to Polygon for carbon retirement (monitoring error occurred)`
        });
      } else {
        // No hash found, but still might be a monitoring issue
        updateStatus('warning', 'Your transaction may have been submitted, but we encountered an error monitoring it. Please check your wallet history or the blockchain explorer to confirm.');
      }
      return;
    }
    
    // Extract more detailed error information
    let errorMessage = error.message || 'Unknown error';
    
    // Simplify common error messages
    if (errorMessage.includes('user rejected')) {
      errorMessage = 'Transaction was rejected by the user.';
    } else if (errorMessage.includes('insufficient funds')) {
      errorMessage = 'Insufficient funds for transaction.';
    } else if (errorMessage.includes('nonce')) {
      errorMessage = 'Transaction nonce error. Please reset your wallet connection and try again.';
    }
    
    updateStatus('error', `Retirement failed: ${errorMessage}`);
  }
}

/**
 * Update the transaction status during the bridging process
 * @param {Object} progress - The progress object from Across Protocol
 */
function updateTransactionStatus(progress) {
  console.log('Transaction progress:', progress);
  
  let statusMessage = '';
  let statusType = 'loading';
  
  // Get transaction hash directly from the progress object
  // The Across SDK provides this in standard locations based on the step
   let txHash = null;
  
  // For deposit and approve steps, the hash is in txReceipt.transactionHash when status is txSuccess
  if (progress.status === 'txSuccess' && progress.txReceipt) {
    txHash = progress.txReceipt.transactionHash;
  }
  
  // For other cases, check standard locations
  if (!txHash && progress.txHash) {
    txHash = progress.txHash;
  }
  
  // Log the transaction hash if available
  if (txHash) {
    console.log(`Transaction hash for ${progress.step || 'unknown'} step: ${txHash}`);
  }
  
  // Handle different progress steps and statuses
  if (progress.step === 'approve') {
    if (progress.status === 'pending') {
      statusMessage = 'Approving token transfer...';
    } else if (progress.status === 'txSuccess') {
      statusMessage = 'Token transfer approved!';
    } else if (progress.status === 'warning') {
      statusMessage = `Approval warning: ${progress.message || 'Continuing with process...'}`;
      statusType = 'warning';
    } else if (progress.status === 'error') {
      statusMessage = `Approval failed: ${progress.error || 'Unknown error'}`;
      statusType = 'error';
    }
  } else if (progress.step === 'deposit') {
    if (progress.status === 'pending') {
      statusMessage = 'Depositing tokens to Across Protocol...';
    } else if (progress.status === 'txSuccess') {
      statusMessage = 'Tokens deposited! Waiting for bridge confirmation...';
    } else if (progress.status === 'warning') {
      statusMessage = `Deposit warning: ${progress.message || 'Continuing with process...'}`;
      statusType = 'warning';
    } else if (progress.status === 'error') {
      statusMessage = `Deposit failed: ${progress.error || 'Unknown error'}`;
      statusType = 'error';
    }
  } else if (progress.step === 'fill') {
    if (progress.status === 'pending') {
      statusMessage = 'Bridging in progress to Polygon...';
    } else if (progress.status === 'txSuccess') {
      statusMessage = 'Bridge complete! Retiring carbon credits...';
      statusType = 'success';
    } else if (progress.status === 'error') {
      statusMessage = `Bridge failed: ${progress.error || 'Unknown error'}`;
      statusType = 'error';
    }
  }
  
  // Update UI status
  updateStatus(statusType, statusMessage);
  
  // Update transaction in list if we have a hash
  if (txHash) {
    const txStatus = progress.status === 'txSuccess' ? 'success' : 
                    progress.status === 'error' ? 'error' : 'pending';
    
    // Create transaction explorer link
    const txExplorerUrl = `https://basescan.org/tx/${txHash}`;
    console.log(`Transaction can be viewed at: ${txExplorerUrl}`);
    
    updateTransactionInList(txHash, {
      status: txStatus,
      statusMessage,
      explorerUrl: txExplorerUrl
    });
  }
}

/**
 * Reset the form to initial state
 */
function resetForm() {
  document.getElementById('amount-input').value = '';
  document.getElementById('beneficiary-input').value = '';
  state.amount = '0';
  state.beneficiaryAddress = null;
  clearQuote();
}

// -----------------------------------------------------------------------
// UI Helpers
// -----------------------------------------------------------------------

/**
 * Update application status and UI
 * @param {string} type - Status type: 'loading', 'success', 'error', 'warning', 'idle'
 * @param {string} message - Status message to display
 */
function updateStatus(type, message = '') {
  // Update status container
  const statusContainer = document.getElementById('status-container');
  const statusMessage = document.getElementById('status-message');
  
  // Clear previous status classes
  statusContainer.className = 'status-container';
  
  // Update based on type
  switch (type) {
    case 'loading':
      statusContainer.classList.add('loading');
      document.getElementById('loading-indicator').style.display = 'block';
      statusMessage.textContent = message || 'Loading...';
      break;
    case 'success':
      statusContainer.classList.add('success');
      document.getElementById('loading-indicator').style.display = 'none';
      statusMessage.textContent = message || 'Success!';
      break;
    case 'error':
      statusContainer.classList.add('error');
      document.getElementById('loading-indicator').style.display = 'none';
      statusMessage.textContent = message || 'An error occurred';
      break;
    case 'warning':
      statusContainer.classList.add('warning');
      document.getElementById('loading-indicator').style.display = 'none';
      statusMessage.textContent = message || 'Warning';
      break;
    case 'idle':
    default:
      document.getElementById('loading-indicator').style.display = 'none';
      statusMessage.textContent = message || '';
      break;
  }
  
  // Show status container if there's a message
  statusContainer.style.display = message ? 'flex' : 'none';
  
  // Update transaction status
  state.transactionStatus = type;
}

/**
 * Add a transaction to the transaction list
 * @param {Object} transaction - Transaction object
 */
function addTransaction(transaction) {
  // Add to state
  state.transactions.unshift(transaction);
  
  // Update UI
  updateTransactionList();
}

/**
 * Update a transaction in the list
 * @param {string} hash - Transaction hash
 * @param {Object} updates - Updates to apply
 */
function updateTransactionInList(hash, updates) {
  // Normalize hash to string if it's an object
  const normalizedHash = typeof hash === 'object' && hash.hash ? hash.hash : hash;
  console.log("Updating transaction with hash:", normalizedHash);
  
  // Find transaction by hash
  const index = state.transactions.findIndex(tx => tx.hash === normalizedHash);
  
  // If transaction not found, check if hash is a substring of any transaction hash
  // This helps with hash format differences between providers
  let foundIndex = index;
  if (index === -1) {
    foundIndex = state.transactions.findIndex(tx => 
      tx.hash.includes(normalizedHash) || normalizedHash.includes(tx.hash)
    );
  }
  
  // If still not found, log and return
  if (foundIndex === -1) {
    console.warn(`Transaction with hash ${normalizedHash} not found in transaction list`);
    return;
  }
  
  // Update transaction
  state.transactions[foundIndex] = {
    ...state.transactions[foundIndex],
    ...updates
  };
  
  console.log(`Updated transaction ${normalizedHash}:`, state.transactions[foundIndex]);
  
  // Update UI
  updateTransactionList();
}

/**
 * Update the transaction list in the UI
 */
function updateTransactionList() {
  const transactionList = document.getElementById('transaction-list');
  if (!transactionList) return;
  
  // Clear existing list
  transactionList.innerHTML = '';
  
  // Add transactions
  if (state.transactions.length === 0) {
    transactionList.innerHTML = '<div class="no-transactions">No transactions yet</div>';
    return;
  }
  
  state.transactions.forEach(tx => {
    const txElement = document.createElement('div');
    txElement.className = `transaction-item ${tx.status}`;
    
    const date = new Date(tx.timestamp);
    const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    
    // Determine explorer URL - use tx.explorerUrl if available, otherwise construct it
    const explorerUrl = tx.explorerUrl || `https://basescan.org/tx/${tx.hash}`;
    
    // Format hash for display (shortened version)
    const shortHash = tx.hash.length > 14 ? 
      `${tx.hash.substring(0, 8)}...${tx.hash.substring(tx.hash.length - 6)}` : 
      tx.hash;
    
    // Status icon based on transaction status
    let statusIcon = '';
    switch(tx.status) {
      case 'success':
        statusIcon = '<span class="status-icon success">✓</span>';
        break;
      case 'error':
        statusIcon = '<span class="status-icon error">✗</span>';
        break;
      case 'pending':
        statusIcon = '<span class="status-icon pending">⧖</span>';
        break;
      default:
        statusIcon = '';
    }
    
    txElement.innerHTML = `
      <div class="transaction-header">
        <span class="transaction-type">${statusIcon} ${tx.type}</span>
        <span class="transaction-date">${dateString}</span>
      </div>
      <div class="transaction-details">
        <div>${tx.amount} ${tx.token} → ${tx.carbonType}</div>
        <div class="transaction-hash">
          <a href="${explorerUrl}" target="_blank" title="View on Block Explorer">
            ${shortHash}
          </a>
        </div>
      </div>
      ${tx.statusMessage ? `<div class="transaction-status">${tx.statusMessage}</div>` : ''}
    `;
    
    transactionList.appendChild(txElement);
  });
}

// -----------------------------------------------------------------------
// Initialize the app
// -----------------------------------------------------------------------

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializeApp);

// Export functions for global access (needed for HTML event handlers)
window.connectWallet = connectWallet;
window.getQuote = getQuote;
window.submitRetirement = submitRetirement;

// Export the module for use in other files
export {
  initializeApp,
  connectWallet,
  getQuote,
  submitRetirement
};
