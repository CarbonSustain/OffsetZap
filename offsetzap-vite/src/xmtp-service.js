/**
 * XMTP Messaging Service for OffsetZap
 * 
 * This service provides a backend API for sending XMTP messages to users
 * as part of the carbon retirement workflow.
 */

import express from 'express';
import cors from 'cors';
import { Client } from '@xmtp/xmtp-js';
import { Wallet } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.XMTP_SERVICE_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Global XMTP client
let xmtpClient = null;
let offsetTeamClient = null;

/**
 * Initialize the XMTP client with a notification wallet
 */
async function initializeXmtp() {
  try {
    // if (!process.env.NOTIFICATION_PRIVATE_KEY) {
    //   console.log("No notification wallet private key found. XMTP messages will not work.");
    //   return null;
    // }
    
    const wallet = new Wallet(process.env.NOTIFICATION_PRIVATE_KEY || '9c757d9a2c536fa5591a048d49fe31a982ce6bc44e2dc16ad4012caebe4f7ebe');
    const xmtp = await Client.create(wallet, { env: 'production' });
    
    console.log("XMTP client initialized successfully with inbox ID:", xmtp.address);
    console.log("Notification wallet address:", wallet.address);
    
    return xmtp;
  } catch (error) {
    console.error("Failed to initialize XMTP client:", error);
    return null;
  }
}

async function initializeXmtpOffsetTeam() {
  try {
    // if (!process.env.NOTIFICATION_PRIVATE_KEY) {
    //   console.log("No notification wallet private key found. XMTP messages will not work.");
    //   return null;
    // }
    
    const wallet = new Wallet(process.env.PRIVATE_KEY_OFFSET_TEAM || '0xafb5dae7e9e9624e2ddeb5bdac6a6293ddf24eeb07f9f6e372c85a8cd323e437');
    const xmtp = await Client.create(wallet, { env: 'production' });
    
    console.log("XMTP client initialized successfully with inbox ID:", xmtp.address);
    console.log("Offset team wallet address:", wallet.address);
    
    return xmtp;
  } catch (error) {
    console.error("Failed to initialize XMTP client:", error);
    return null;
  }
}



/**
 * Send an XMTP message to a recipient
 */
async function sendMessage(recipientAddress, message) {
  if (!xmtpClient) {
    console.log("XMTP client not initialized. Trying to initialize...");
    xmtpClient = await initializeXmtp();
    offsetTeamClient = await initializeXmtpOffsetTeam();
    
    if (!xmtpClient) {
      return { 
        success: false, 
        error: "Failed to initialize XMTP client" 
      };
    }
  }
  
  try {
    // Check if the recipient can receive XMTP messages
    const canMessage = await Client.canMessage(recipientAddress);
    const canMessage2 = await Client.canMessage(xmtpClient.address);
    const canMessage3 = await Client.canMessage("0xa8A5a8fC9336B0036c7a08606790c26b5bB65d00");
    
    // console.log(`Recipient ${recipientAddress} can receive XMTP messages: ${canMessage}`);
    console.log(`XMTP client ${xmtpClient.address} can receive XMTP messages: ${canMessage2}`);
    // console.log(`Offset team "0xa8A5a8fC9336B0036c7a08606790c26b5bB65d00" can receive XMTP messages: ${canMessage3}`);
    
    if (!canMessage) {
      console.log(`Recipient ${recipientAddress} cannot receive XMTP messages`);
      // Create or load conversation
      const conversation = await offsetTeamClient.conversations.newConversation(xmtpClient.address);
      console.log(`Conversation created for ${xmtpClient.address} with our XMTP client ${offsetTeamClient.address}`);
    
      // Send the message
      await conversation.send(message);
      console.log(`Message sent to ${xmtpClient.address} successfully`);
      
      return { 
        success: true,
        recipient: xmtpClient.address,
        timestamp: new Date().toISOString()
    }};
  } catch (error) {
    console.error(`Failed to send message to ${xmtpClient.address}:`, error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Routes

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'xmtp-messaging' });
});

/**
 * Send a direct message to a user
 */
app.post('/api/send', async (req, res) => {
  const { recipientAddress, message } = req.body;
  
  if (!recipientAddress || !message) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields: recipientAddress and message" 
    });
  }
  
  try {
    const result = await sendMessage(recipientAddress, message);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error in send endpoint:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

/**
 * Send a carbon retirement notification message
 */
app.post('/api/notify/retirement', async (req, res) => {
  const { 
    recipientAddress, 
    requestId, 
    amount, 
    tokenSymbol,
    status, 
    transactionHash 
  } = req.body;
  
  if (!recipientAddress || !requestId || !amount || !status) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields" 
    });
  }
  
  let message = "";
  const explorerUrl = transactionHash ? 
    `https://basescan.org/tx/${transactionHash}` : "";
  
  switch (status) {
    case 'initiated':
      message = `Your carbon offset request #${requestId} for ${amount} ${tokenSymbol || 'ETH'} has been initiated. We'll notify you when it's completed.`;
      break;
    case 'completed':
      message = `Great news! Your carbon offset request #${requestId} has been completed successfully. View your certificate at https://offsetzap.com/proof/${requestId}`;
      break;
    case 'failed':
      message = `We encountered an issue with your carbon offset request #${requestId}. Please contact support for assistance.`;
      break;
    default:
      message = `Update on your carbon offset request #${requestId}: status is now ${status}.`;
  }
  
  if (explorerUrl) {
    message += `\n\nView transaction: ${explorerUrl}`;
  }
  
  try {
    const result = await sendMessage(recipientAddress, message);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error("Error in retirement notification endpoint:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error" 
    });
  }
});

/**
 * Register a user with XMTP using server-side proxy
 * This allows users to register with XMTP who might not be able to do it directly in the browser
 */
app.post('/api/register', async (req, res) => {
  const { userAddress, signature } = req.body;
  
  if (!userAddress || !signature) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields: userAddress and signature" 
    });
  }
  
  // This would require a more complex implementation to handle user registration
  // It would involve the user signing a message client-side and then sending that
  // signature to this endpoint for verification and registration
  
  res.status(501).json({ 
    success: false, 
    error: "User registration endpoint not fully implemented" 
  });
});

// Initialize server
async function startServer() {
  // Initialize XMTP client on server start
  xmtpClient = await initializeXmtp();
  offsetTeamClient = await initializeXmtpOffsetTeam();
  
  app.listen(PORT, () => {
    console.log(`XMTP Messaging Service running on port ${PORT}`);
  });
}

// Start the server
startServer().catch(console.error);

// Export for testing or programmatic usage
export { app, startServer };
