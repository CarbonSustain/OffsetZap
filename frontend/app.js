// ABI for BaseCarbonBridge contract
const bridgeABI = [
  "function initiateRetirement(bool useUSDC, uint256 amount, uint16 dstChainId, string calldata carbonType, address beneficiary) external payable returns (uint256 requestId)",
  "function getRequest(uint256 requestId) external view returns (address user, uint256 amount, uint16 dstChainId, string memory carbonType, address beneficiary, bool completed, bytes memory proof)",
  "function supportedCarbonTypes(string) external view returns (bool)",
  "function supportedChains(uint16) external view returns (bool)"
];

// Contract addresses
const BRIDGE_ADDRESS = "0xD2B8bd67e83Bd5Fa38b172cCe6f34F898F9DA5e9"; // BaseCarbonBridge on Base
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on Base

// Chain IDs for LayerZero
const CHAIN_IDS = {
  POLYGON: 109, // LayerZero Polygon chain ID
  CELO: 125    // LayerZero Celo chain ID
};

// Global variables
let provider = null;
let signer = null;
let account = null;
let bridge = null;
let useUSDC = false;
let transactions = [];

// DOM Elements
const connectButton = document.getElementById('connectButton');
const offsetForm = document.getElementById('offsetForm');
const statusForm = document.getElementById('statusForm');
const ethButton = document.getElementById('ethButton');
const usdcButton = document.getElementById('usdcButton');
const notificationEl = document.getElementById('notification');
const transactionList = document.getElementById('transactionList');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.getAttribute('data-tab');
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show selected tab content
      tabContents.forEach(content => {
        content.style.display = 'none';
      });
      document.getElementById(`${tabId}Tab`).style.display = 'block';
    });
  });
  
  // Connect wallet button
  connectButton.addEventListener('click', connectWallet);
  
  // Payment method selection
  ethButton.addEventListener('click', () => {
    useUSDC = false;
    ethButton.classList.add('button-primary');
    ethButton.classList.remove('button-secondary');
    usdcButton.classList.add('button-secondary');
    usdcButton.classList.remove('button-primary');
  });
  
  usdcButton.addEventListener('click', () => {
    useUSDC = true;
    usdcButton.classList.add('button-primary');
    usdcButton.classList.remove('button-secondary');
    ethButton.classList.add('button-secondary');
    ethButton.classList.remove('button-primary');
  });
  
  // Form submissions
  offsetForm.addEventListener('submit', submitRetirement);
  statusForm.addEventListener('submit', checkRetirementStatus);
});

// Connect to wallet
async function connectWallet() {
  if (!window.ethereum) {
    showNotification('error', 'MetaMask not detected. Please install MetaMask.');
    return;
  }
  
  try {
    connectButton.textContent = 'Connecting...';
    connectButton.disabled = true;
    
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const { chainId } = await provider.getNetwork();
    
    // Check if we're on Base (84532 for Base Sepolia)
    if (chainId !== 84532) {
      showNotification('error', 'Please connect to Base Sepolia network');
      connectButton.textContent = 'Connect Wallet';
      connectButton.disabled = false;
      return;
    }
    
    signer = provider.getSigner();
    account = await signer.getAddress();
    
    // Initialize contract
    bridge = new ethers.Contract(BRIDGE_ADDRESS, bridgeABI, signer);
    
    connectButton.textContent = `Connected: ${account.substring(0, 6)}...${account.substring(account.length - 4)}`;
    showNotification('success', 'Wallet connected successfully!');
    
    // Load transaction history from local storage
    loadTransactions();
    
  } catch (error) {
    console.error('Error connecting wallet:', error);
    showNotification('error', 'Failed to connect wallet: ' + error.message);
    connectButton.textContent = 'Connect Wallet';
    connectButton.disabled = false;
  }
}

// Submit retirement
async function submitRetirement(e) {
  e.preventDefault();
  
  if (!signer || !bridge) {
    showNotification('error', 'Please connect your wallet first');
    return;
  }
  
  const amountInput = document.getElementById('amount');
  const carbonTypeSelect = document.getElementById('carbonType');
  const destinationChainSelect = document.getElementById('destinationChain');
  
  const amount = amountInput.value;
  const carbonType = carbonTypeSelect.value;
  const destinationChain = parseInt(destinationChainSelect.value);
  
  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    showNotification('error', 'Please enter a valid amount');
    return;
  }
  
  try {
    showNotification('success', 'Processing your transaction...');
    
    const amountWei = ethers.utils.parseEther(amount);
    const tx = await bridge.initiateRetirement(
      useUSDC,
      amountWei,
      destinationChain,
      carbonType,
      account,
      { value: useUSDC ? 0 : amountWei }
    );
    
    // Add to transactions list
    const newTx = {
      hash: tx.hash,
      status: 'pending',
      amount,
      useUSDC,
      carbonType,
      destinationChain,
      timestamp: Date.now()
    };
    
    transactions.unshift(newTx);
    saveTransactions();
    updateTransactionList();
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    // Update transaction status
    transactions = transactions.map(t => 
      t.hash === tx.hash 
        ? { ...t, status: 'completed', requestId: receipt.events[0].args.requestId.toString() } 
        : t
    );
    saveTransactions();
    updateTransactionList();
    
    showNotification('success', 'Retirement initiated successfully!');
    
    // Reset form
    amountInput.value = '';
    
  } catch (error) {
    console.error('Error submitting retirement:', error);
    showNotification('error', 'Failed to process retirement: ' + error.message);
    
    // Update transaction status if it exists
    if (tx) {
      transactions = transactions.map(t => 
        t.hash === tx.hash 
          ? { ...t, status: 'failed' } 
          : t
      );
      saveTransactions();
      updateTransactionList();
    }
  }
}

// Check retirement status
async function checkRetirementStatus(e) {
  e.preventDefault();
  
  if (!signer || !bridge) {
    showNotification('error', 'Please connect your wallet first');
    return;
  }
  
  const requestIdInput = document.getElementById('requestId');
  const requestId = requestIdInput.value;
  
  if (!requestId) {
    showNotification('error', 'Please enter a request ID');
    return;
  }
  
  try {
    const result = await bridge.getRequest(requestId);
    
    const [user, amount, dstChainId, carbonType, beneficiary, completed, proof] = result;
    
    // Add to transactions list
    const newTx = {
      requestId,
      status: completed ? 'completed' : 'pending',
      user,
      amount: ethers.utils.formatEther(amount),
      destinationChain: dstChainId,
      carbonType,
      beneficiary,
      completed,
      proof: completed ? ethers.utils.hexlify(proof) : null,
      timestamp: Date.now()
    };
    
    transactions.unshift(newTx);
    saveTransactions();
    updateTransactionList();
    
    showNotification('success', completed 
      ? 'Retirement completed! Proof available.' 
      : 'Retirement is still pending.');
    
    // Reset form
    requestIdInput.value = '';
    
  } catch (error) {
    console.error('Error checking retirement status:', error);
    showNotification('error', 'Failed to check retirement status: ' + error.message);
  }
}

// Show notification
function showNotification(type, message) {
  notificationEl.className = `notification notification-${type}`;
  notificationEl.textContent = message;
  notificationEl.style.display = 'block';
  
  // Hide after 5 seconds
  setTimeout(() => {
    notificationEl.style.display = 'none';
  }, 5000);
}

// Save transactions to local storage
function saveTransactions() {
  localStorage.setItem('offsetZapTransactions', JSON.stringify(transactions));
}

// Load transactions from local storage
function loadTransactions() {
  const savedTransactions = localStorage.getItem('offsetZapTransactions');
  if (savedTransactions) {
    transactions = JSON.parse(savedTransactions);
    updateTransactionList();
  }
}

// Update transaction list in UI
function updateTransactionList() {
  if (transactions.length === 0) {
    transactionList.innerHTML = '<p>No transactions yet.</p>';
    return;
  }
  
  transactionList.innerHTML = '';
  
  transactions.forEach(tx => {
    const txCard = document.createElement('div');
    txCard.className = 'transaction-card';
    
    const txHeader = document.createElement('div');
    txHeader.className = 'transaction-header';
    
    const txTitle = document.createElement('div');
    txTitle.className = 'transaction-title';
    txTitle.textContent = tx.requestId ? `Request #${tx.requestId}` : `Transaction ${tx.hash?.substring(0, 10)}...`;
    
    const txStatus = document.createElement('div');
    txStatus.className = `transaction-status status-${tx.status}`;
    txStatus.textContent = tx.status.charAt(0).toUpperCase() + tx.status.slice(1);
    
    txHeader.appendChild(txTitle);
    txHeader.appendChild(txStatus);
    
    const txDetails = document.createElement('div');
    txDetails.className = 'transaction-details';
    
    // Amount
    const amountItem = document.createElement('div');
    amountItem.className = 'detail-item';
    
    const amountLabel = document.createElement('div');
    amountLabel.className = 'detail-label';
    amountLabel.textContent = 'Amount';
    
    const amountValue = document.createElement('div');
    amountValue.className = 'detail-value';
    amountValue.textContent = `${tx.amount} ${tx.useUSDC ? 'USDC' : 'ETH'}`;
    
    amountItem.appendChild(amountLabel);
    amountItem.appendChild(amountValue);
    
    // Carbon Type
    const carbonTypeItem = document.createElement('div');
    carbonTypeItem.className = 'detail-item';
    
    const carbonTypeLabel = document.createElement('div');
    carbonTypeLabel.className = 'detail-label';
    carbonTypeLabel.textContent = 'Carbon Type';
    
    const carbonTypeValue = document.createElement('div');
    carbonTypeValue.className = 'detail-value';
    carbonTypeValue.textContent = tx.carbonType;
    
    carbonTypeItem.appendChild(carbonTypeLabel);
    carbonTypeItem.appendChild(carbonTypeValue);
    
    // Destination Chain
    const chainItem = document.createElement('div');
    chainItem.className = 'detail-item';
    
    const chainLabel = document.createElement('div');
    chainLabel.className = 'detail-label';
    chainLabel.textContent = 'Destination Chain';
    
    const chainValue = document.createElement('div');
    chainValue.className = 'detail-value';
    chainValue.textContent = tx.destinationChain === CHAIN_IDS.POLYGON ? 'Polygon' : 'Celo';
    
    chainItem.appendChild(chainLabel);
    chainItem.appendChild(chainValue);
    
    // Timestamp
    const timeItem = document.createElement('div');
    timeItem.className = 'detail-item';
    
    const timeLabel = document.createElement('div');
    timeLabel.className = 'detail-label';
    timeLabel.textContent = 'Timestamp';
    
    const timeValue = document.createElement('div');
    timeValue.className = 'detail-value';
    timeValue.textContent = new Date(tx.timestamp).toLocaleString();
    
    timeItem.appendChild(timeLabel);
    timeItem.appendChild(timeValue);
    
    txDetails.appendChild(amountItem);
    txDetails.appendChild(carbonTypeItem);
    txDetails.appendChild(chainItem);
    txDetails.appendChild(timeItem);
    
    txCard.appendChild(txHeader);
    txCard.appendChild(txDetails);
    
    // Add proof section if available
    if (tx.proof) {
      const proofSection = document.createElement('div');
      proofSection.className = 'proof-section';
      
      const proofTitle = document.createElement('div');
      proofTitle.className = 'proof-title';
      proofTitle.textContent = 'Retirement Proof';
      
      const proofCard = document.createElement('div');
      proofCard.className = 'proof-card';
      
      const proofDetails = document.createElement('div');
      proofDetails.className = 'proof-details';
      
      const proofItem = document.createElement('div');
      proofItem.className = 'detail-item';
      
      const proofLabel = document.createElement('div');
      proofLabel.className = 'detail-label';
      proofLabel.textContent = 'Proof Hash';
      
      const proofValue = document.createElement('div');
      proofValue.className = 'detail-value';
      proofValue.textContent = `${tx.proof.substring(0, 20)}...`;
      
      proofItem.appendChild(proofLabel);
      proofItem.appendChild(proofValue);
      
      const proofLink = document.createElement('a');
      proofLink.href = `https://explorer.base.org/tx/${tx.hash}`;
      proofLink.target = '_blank';
      proofLink.rel = 'noopener noreferrer';
      proofLink.className = 'proof-link';
      proofLink.textContent = 'View on Block Explorer';
      
      proofDetails.appendChild(proofItem);
      proofCard.appendChild(proofDetails);
      proofCard.appendChild(proofLink);
      
      proofSection.appendChild(proofTitle);
      proofSection.appendChild(proofCard);
      
      txCard.appendChild(proofSection);
    }
    
    transactionList.appendChild(txCard);
  });
}
