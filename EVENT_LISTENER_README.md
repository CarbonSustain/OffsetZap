# OffsetZap Event Listener with XMTP Integration

This component listens for events from the BaseCarbonBridge contract and sends notifications to users via XMTP when carbon offset events occur.

## How It Works

1. The event listener connects to the Base Sepolia network using a WebSocket connection
2. It listens for two key events from the BaseCarbonBridge contract:
   - `RetirementInitiated`: When a user initiates a carbon offset
   - `RetirementCompleted`: When a carbon offset is successfully completed
3. When these events are detected, it sends a notification message to the user's wallet via XMTP

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- web3 (for blockchain interaction)
- @xmtp/xmtp-js (for messaging)
- ethers (required by XMTP)
- dotenv (for environment variables)

### 2. Configure Environment Variables

Edit the `.env` file to add:
- `BASE_SEPOLIA_WS_URL`: WebSocket URL for Base Sepolia (required for event listening)
- `NOTIFICATION_PRIVATE_KEY`: Private key of the wallet that will send XMTP messages

### 3. Run the Event Listener

```bash
node eventListener.js
```

The event listener will start and continuously monitor for events from the BaseCarbonBridge contract.

## XMTP Integration Details

The event listener uses XMTP to send messages directly to users' wallets when carbon offset events occur:

1. When a `RetirementInitiated` event is detected:
   - Sends a message confirming the initiation of the carbon offset
   - Includes details like request ID, amount, and carbon type

2. When a `RetirementCompleted` event is detected:
   - Sends a message confirming successful completion
   - Includes a link to view the proof of retirement

