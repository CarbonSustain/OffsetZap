// Imagine this scenario:

// Alice connects her wallet to OffsetZap and offsets 0.5 ETH worth of carbon credits
// The BaseCarbonBridge contract emits a RetirementInitiated event
// Our event listener detects this event and sees that Alice's wallet initiated it
// The listener sends a message directly to Alice's wallet: "Your carbon offset request #123 for 0.5 ETH of NCT has been initiated. We'll notify you when it's completed."
// Later, when the offset is completed on Polygon or Celo, the contract emits a RetirementCompleted event
// Our listener detects this and sends another message to Alice: "Great news! Your carbon offset request #123 has been completed successfully. View your proof of retirement here: [link]"



const { Web3 } = require('web3');
const { Client } = require('@xmtp/xmtp-js');
const ethers = require('ethers');
require('dotenv').config();

// Initialize Web3 with WebSocket provider for event listening
// Note: Use a WebSocket provider for event listening, not HTTP
const web3 = new Web3(process.env.BASE_SEPOLIA_WS_URL || 'wss://sepolia.base.org');

console.log("Beginning routine");
console.log("Listening for BaseCarbonBridge events...");

// BaseCarbonBridge contract details from deployment file
const contractABI = [
  // Events
  {"type":"event","anonymous":false,"name":"RetirementInitiated","inputs":[{"type":"uint256","name":"requestId","indexed":true},{"type":"address","name":"user","indexed":true},{"type":"uint256","name":"amountBase","indexed":false},{"type":"uint16","name":"dstChainId","indexed":false},{"type":"string","name":"carbonType","indexed":false},{"type":"address","name":"beneficiary","indexed":false}]},
  {"type":"event","anonymous":false,"name":"RetirementCompleted","inputs":[{"type":"uint256","name":"requestId","indexed":true},{"type":"address","name":"user","indexed":true},{"type":"uint256","name":"amountBase","indexed":false},{"type":"uint16","name":"srcChainId","indexed":false},{"type":"bytes","name":"proof","indexed":false}]},
  {"type":"event","anonymous":false,"name":"EmergencyWithdrawn","inputs":[{"type":"address","name":"token","indexed":false},{"type":"address","name":"to","indexed":false},{"type":"uint256","name":"amount","indexed":false}]},
  {"type":"event","anonymous":false,"name":"EndpointUpdated","inputs":[{"type":"address","name":"newEndpoint","indexed":false}]},
  {"type":"event","anonymous":false,"name":"FeePercentUpdated","inputs":[{"type":"uint16","name":"newFeeBps","indexed":false}]},
  {"type":"event","anonymous":false,"name":"FeesWithdrawn","inputs":[{"type":"address","name":"to","indexed":false},{"type":"uint256","name":"amount","indexed":false}]},
  {"type":"event","anonymous":false,"name":"OwnershipTransferred","inputs":[{"type":"address","name":"previousOwner","indexed":true},{"type":"address","name":"newOwner","indexed":true}]},
  
  // Errors
  {"type":"error","name":"AlreadyCompleted","inputs":[]},
  {"type":"error","name":"InsufficientValue","inputs":[]},
  {"type":"error","name":"InvalidCarbonType","inputs":[]},
  {"type":"error","name":"InvalidChain","inputs":[]},
  {"type":"error","name":"NotLZEndpoint","inputs":[]},
  {"type":"error","name":"TransferFailed","inputs":[]},
  {"type":"error","name":"Unauthorized","inputs":[]},
  {"type":"error","name":"ZeroAddress","inputs":[]},
  {"type":"error","name":"ZeroAmount","inputs":[]}
];

// Contract address from deployment file
const contractAddress = "0x9316F9B4D24fB53deAca13B3D72CF5c1D151C45b";

// Create contract instance
const contract = new web3.eth.Contract(contractABI, contractAddress);

// Function to decode revert reasons from failed transactions
async function getRevertReason(txHash) {
  try {
    // Get the transaction
    const tx = await web3.eth.getTransaction(txHash);
    
    // Try to simulate the transaction to get the revert reason
    try {
      await web3.eth.call({
        to: tx.to,
        from: tx.from,
        gas: tx.gas,
        gasPrice: tx.gasPrice,
        value: tx.value,
        data: tx.input
      }, tx.blockNumber);
    } catch (error) {
      // Parse the error message to extract the revert reason
      const errorMessage = error.message;
      
      // Check for known contract errors
      const knownErrors = [
        "AlreadyCompleted",
        "InsufficientValue",
        "InvalidCarbonType",
        "InvalidChain",
        "NotLZEndpoint",
        "TransferFailed",
        "Unauthorized",
        "ZeroAddress",
        "ZeroAmount"
      ];
      
      for (const errorType of knownErrors) {
        if (errorMessage.includes(errorType)) {
          return errorType;
        }
      }
      
      // If we can't identify a specific error, return the raw message
      return errorMessage;
    }
    
    // If we get here, the call succeeded, which shouldn't happen for a failed tx
    return "Unknown error (transaction simulation succeeded)";
  } catch (error) {
    console.error("Error in getRevertReason:", error);
    return "Could not determine revert reason";
  }
}

// Initialize XMTP client (this would be done with a dedicated notification wallet)
async function initializeXmtp() {
  try {
    // In production, you'd use a dedicated wallet for notifications
    // For this example, we're assuming a private key is in the .env file
    if (!process.env.NOTIFICATION_PRIVATE_KEY) {
      console.log("No notification wallet private key found. XMTP messages will be simulated.");
      return null;
    }
    
    const wallet = new ethers.Wallet(process.env.NOTIFICATION_PRIVATE_KEY);
    const xmtp = await Client.create(wallet);
    console.log("XMTP client initialized successfully");
    return xmtp;
  } catch (error) {
    console.error("Failed to initialize XMTP client:", error);
    return null;
  }
}

// Function to send XMTP message
async function sendXmtpMessage(xmtp, recipientAddress, message) {
  if (!xmtp) {
    console.log(`SIMULATION - Would send to ${recipientAddress}: ${message}`);
    return;
  }
  
  try {
    const conversation = await xmtp.conversations.newConversation(recipientAddress);
    await conversation.send(message);
    console.log(`Message sent to ${recipientAddress}`);
  } catch (error) {
    console.error(`Failed to send message to ${recipientAddress}:`, error);
  }
}

// Main function to start listening for events
async function startEventListener() {
  // Initialize XMTP client
  const xmtp = await initializeXmtp();
  
  try {
    // In web3.js v4, we need to use createSubscription for events
    console.log("Setting up RetirementInitiated event subscription...");
    
    // Create subscription for RetirementInitiated events
    const initiatedEvents = await contract.events.RetirementInitiated({
      fromBlock: 'latest'
    });
    
    // Set up event handlers
    initiatedEvents.on('data', async (event) => {
      const { requestId, user, amountBase, dstChainId, carbonType, beneficiary } = event.returnValues;
      
      console.log("New RetirementInitiated event received:");
      console.log({
        requestId,
        user,
        amountBase: web3.utils.fromWei(amountBase, 'ether'),
        dstChainId,
        carbonType,
        beneficiary
      });
      
      // Send XMTP message to user
      const message = `Your carbon offset request #${requestId} for ${web3.utils.fromWei(amountBase, 'ether')} ETH of ${carbonType} has been initiated. We'll notify you when it's completed.`;
      await sendXmtpMessage(xmtp, user, message);
    });
    
    initiatedEvents.on('connected', (subscriptionId) => {
      console.log(`Connected to the blockchain - Listening for RetirementInitiated events (ID: ${subscriptionId})`);
    });
    
    initiatedEvents.on('error', (error) => {
      console.error("RetirementInitiated event error:", error);
    });
    
    // Create subscription for RetirementCompleted events
    console.log("Setting up RetirementCompleted event subscription...");
    
    const completedEvents = await contract.events.RetirementCompleted({
      fromBlock: 'latest'
    });
    
    // Set up event handlers
    completedEvents.on('data', async (event) => {
      const { requestId, user, amountBase, srcChainId, proof } = event.returnValues;
      
      console.log("New RetirementCompleted event received:");
      console.log({
        requestId,
        user,
        amountBase: web3.utils.fromWei(amountBase, 'ether'),
        srcChainId,
        proof: proof.substring(0, 50) + '...' // Truncate proof for logging
      });
      
      // Send XMTP message to user
      const proofLink = `https://offsetzap.com/proof/${requestId}`;
      const message = `Great news! Your carbon offset request #${requestId} has been completed successfully. View your proof of retirement here: ${proofLink}`;
      await sendXmtpMessage(xmtp, user, message);
    });
    
    completedEvents.on('connected', (subscriptionId) => {
      console.log(`Connected to the blockchain - Listening for RetirementCompleted events (ID: ${subscriptionId})`);
    });
    
    completedEvents.on('error', (error) => {
      console.error("RetirementCompleted event error:", error);
    });
    
    // Set up listeners for administrative events
    console.log("Setting up administrative event subscriptions...");
    
    // EmergencyWithdrawn events
    const emergencyWithdrawnEvents = await contract.events.EmergencyWithdrawn({
      fromBlock: 'latest'
    });
    
    emergencyWithdrawnEvents.on('data', (event) => {
      const { token, to, amount } = event.returnValues;
      console.log("⚠️ EMERGENCY WITHDRAWAL EVENT:");
      console.log({
        token,
        to,
        amount: web3.utils.fromWei(amount, 'ether')
      });
    });
    
    // EndpointUpdated events
    const endpointUpdatedEvents = await contract.events.EndpointUpdated({
      fromBlock: 'latest'
    });
    
    endpointUpdatedEvents.on('data', (event) => {
      const { newEndpoint } = event.returnValues;
      console.log("🔄 ENDPOINT UPDATED EVENT:");
      console.log({
        newEndpoint
      });
    });
    
    // FeePercentUpdated events
    const feePercentUpdatedEvents = await contract.events.FeePercentUpdated({
      fromBlock: 'latest'
    });
    
    feePercentUpdatedEvents.on('data', (event) => {
      const { newFeeBps } = event.returnValues;
      console.log("💰 FEE PERCENT UPDATED EVENT:");
      console.log({
        newFeeBps: `${newFeeBps/100}%`
      });
    });
    
    // FeesWithdrawn events
    const feesWithdrawnEvents = await contract.events.FeesWithdrawn({
      fromBlock: 'latest'
    });
    
    feesWithdrawnEvents.on('data', (event) => {
      const { to, amount } = event.returnValues;
      console.log("💸 FEES WITHDRAWN EVENT:");
      console.log({
        to,
        amount: web3.utils.fromWei(amount, 'ether')
      });
    });
    
    // OwnershipTransferred events
    const ownershipTransferredEvents = await contract.events.OwnershipTransferred({
      fromBlock: 'latest'
    });
    
    ownershipTransferredEvents.on('data', (event) => {
      const { previousOwner, newOwner } = event.returnValues;
      console.log("👑 OWNERSHIP TRANSFERRED EVENT:");
      console.log({
        previousOwner,
        newOwner
      });
    });
    
    // Monitor for failed transactions to detect contract errors
    console.log("Setting up transaction monitoring for contract errors...");
    
    // Create a subscription to new blocks
    const blockSubscription = await web3.eth.subscribe('newBlockHeaders');
    
    // Process each new block to look for transactions to our contract
    blockSubscription.on('data', async (blockHeader) => {
      try {
        // Get the full block data
        const block = await web3.eth.getBlock(blockHeader.number, true);
        
        if (block && block.transactions) {
          // Filter transactions to our contract
          const contractTxs = block.transactions.filter(tx => 
            tx.to && tx.to.toLowerCase() === contractAddress.toLowerCase());
          
          // Process each transaction to the contract
          for (const tx of contractTxs) {
            const receipt = await web3.eth.getTransactionReceipt(tx.hash);
            
            // Check if transaction failed
            if (receipt.status === false) {
              console.log("❌ FAILED TRANSACTION DETECTED:");
              console.log({
                txHash: tx.hash,
                from: tx.from,
                value: web3.utils.fromWei(tx.value, 'ether'),
                gasUsed: receipt.gasUsed
              });
              
              try {
                // Try to get the revert reason
                const reason = await getRevertReason(tx.hash);
                console.log("Revert reason:", reason);
              } catch (error) {
                console.log("Could not determine exact revert reason");
              }
            }
          }
        }
      } catch (error) {
        console.error("Error processing block:", error);
      }
    });
    
    // Handle subscription errors
    blockSubscription.on('error', (error) => {
      console.error("Block subscription error:", error);
    });
    
    // Log successful subscription
    console.log(`Connected to block subscription (ID: ${blockSubscription.id})`);
    
    console.log("All event listeners and transaction monitoring initialized and running");
  } catch (error) {
    console.error("Error setting up event listeners:", error);
    throw error;
  }
}

// Start the event listener
startEventListener().catch(error => {
  console.error("Failed to start event listener:", error);
});

// Keep the process running
process.on('SIGINT', () => {
  console.log('Stopping event listener...');
  process.exit(0);
});
