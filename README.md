🌱 App Concept: OffsetZap – One-Click CO₂e Offsets Without Popups Problem: Offsetting carbon credits usually involves complex UI steps and wallet popups that interrupt flow — especially for frequent, small emissions actions (like sending a card, buying a lunch, or attending an event).

Solution: CarbonSustain builds OffsetZap, an onchain carbon offset app where users delegate a Smart Wallet Sub Account to CarbonSustain, with Spend Limits on Base Sepolia. Once configured, users can:

Automatically offset micro-emissions (e.g., 0.005 ETH = 5 kg CO₂e) Send gift cards via Evrlink that auto-offset without prompts Subscribe to "climate auto-pilot" for weekly emissions cleanup All without any further wallet popups or gas worries.

💸 How It Works (UX + Tech Stack)

1. Smart Wallet Setup User connects their Smart Wallet (via Coinbase Wallet SDK) They delegate a Sub Account to CarbonSustain on Base Sepolia A Spend Limit is set (e.g., 0.05 ETH/week)
2. Onchain Offset Triggers Every time the user: Sends a Farcaster offset card Logs a trip or food footprint Hits a recurring offset timer The Sub Account executes the tx to purchase and retire tokenized offsets (e.g., via KlimaDAO, Toucan)
3. No Wallet Popup All transactions are executed via delegated auth + spend limit = zero-interruption offsets.

🧠 Tech Stack

- Smart Wallet & Sub Accounts (Base Sepolia)
- Spend Limits (Coinbase Dev Platform)
- React/Next.js frontend
- CarbonSustain offset engine

🌱 OffsetZap – Carbon Offset dApp on Base Sepolia OffsetZap enables users to send carbon offset transactions using Coinbase Smart Wallet Sub Accounts with spend limits — no popups required. Built for Base Builder Quest 5.

🔧 Local Development Setup

1. Clone the repo git clone https://github.com/your-username/offsetzap-app.git cd offsetzap-app
2. Install dependencies npm install
3. Environment variables Create a .env file in the root with: REACT_APP_CONTRACT_ADDRESS=0xYourDeployedContractAddress REACT_APP_APP_ID=carbon-sustain-offsetzap REACT_APP_CHAIN_ID=84532
4. Run the frontend locally npm run dev 🔨 Smart Contract Deployment (Hardhat)
5. Configure .env for deployment PRIVATE_KEY=0xyour_deployer_private_key BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your-key
6. Compile and deploy npx hardhat compile npx hardhat run scripts/deploy.js --network base_sepolia Copy the deployed contract address to your .env.
