2+# ClearSky Liquidity Pool

A decentralized liquidity pool built on Hedera that accepts both USDC and HBAR, minting LP tokens representing ownership in the pool.

## 🚀 Features

- **Dual Asset Support**: Accepts both USDC and HBAR
- **HTS LP Tokens**: Native Hedera Token Service LP tokens
- **Automated Market Making**: Constant product formula for price discovery
- **Fee Collection**: 0.3% fee on liquidity operations
- **Security Features**: Reentrancy protection, pausable, emergency controls
- **Cross-Chain Ready**: Built for Hedera's high-performance network

## 📁 Project Structure

```
clearsky/
├── contracts/
│   └── ClearSkyLiquidityPool.sol    # Main liquidity pool contract
├── createClearSkyLPToken.js         # Create HTS LP token on Hedera
├── deployPool.js                    # Deploy liquidity pool contract
├── testLiquidityPool.js             # Test pool functionality
├── hardhat.config.js                # Hardhat configuration
├── package.json                     # Dependencies and scripts
├── env.example                      # Environment variables template
└── README.md                        # This file
```

## 🛠️ Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

```bash
# Hedera Network Configuration
NETWORK=testnet

# Hedera RPC URLs
HEDERA_TESTNET_RPC_URL=https://testnet.hashio.io/api
HEDERA_MAINNET_RPC_URL=https://mainnet.hashio.io/api

# Your Hedera Account
OPERATOR_ID=0.0.1234
OPERATOR_KEY=your_der_encoded_private_key

# Your Ethereum-style Private Key
PRIVATE_KEY=0x1234567890abcdef...

# USDC Token Address on Hedera
USDC_TOKEN_ADDRESS=0x...
```

## 🚀 Usage

### Step 1: Create LP Token

First, create the HTS LP token on Hedera:

```bash
npm start
```

This will:
- Create a new HTS token called "ClearSky LP Token" (CSLP)
- Generate cryptographic keys for token control
- Save token information to `clearsky-lp-token.json`

### Step 2: Compile Contracts

Compile the Solidity contracts:

```bash
npx hardhat compile
```

### Step 3: Deploy Pool Contract

Deploy the liquidity pool contract:

```bash
npm run deploy
```

This will:
- Deploy the pool contract to Hedera
- Save deployment information to `clearsky-pool-deployment.json`
- Display the pool contract address

### Step 4: Transfer Token Control

Transfer LP token control to the pool contract:

```javascript
import { transferTokenControl } from './createClearSkyLPToken.js';

// Load token info
const tokenInfo = JSON.parse(fs.readFileSync('clearsky-lp-token.json', 'utf8'));
const deploymentInfo = JSON.parse(fs.readFileSync('clearsky-pool-deployment.json', 'utf8'));

// Transfer control
await transferTokenControl(
  tokenInfo.tokenId,
  tokenInfo.supplyKey,
  tokenInfo.adminKey,
  deploymentInfo.poolAddress
);
```

### Step 5: Test the Pool

Test the pool functionality:

```bash
npm test
```

## 🔧 Configuration

### Pool Parameters

- **Fee**: 0.3% (30 basis points)
- **Minimum Liquidity**: 0.001 HBAR
- **LP Token Decimals**: 6
- **Token Symbol**: CSLP

### Network Support

- **Hedera Testnet**: Chain ID 296
- **Hedera Mainnet**: Chain ID 295
- **Local Development**: Chain ID 1337

## 📊 How It Works

### Adding Liquidity

1. User sends USDC and HBAR to the pool
2. Pool calculates LP tokens based on current ratio
3. LP tokens are minted to the user
4. Pool state is updated

### Removing Liquidity

1. User burns LP tokens
2. Pool calculates proportional USDC and HBAR
3. Tokens are transferred back to user
4. Pool state is updated

### Price Calculation

Uses the constant product formula:
```
LP Tokens = sqrt(USDC × HBAR)
```

## 🔒 Security Features

- **Reentrancy Protection**: Prevents reentrancy attacks
- **Access Control**: Only owner can pause/unpause and collect fees
- **Slippage Protection**: Users can set minimum amounts
- **Emergency Controls**: Owner can pause pool and withdraw funds
- **Input Validation**: Comprehensive parameter validation

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Test Specific Functions

```javascript
import { testClearSkyPool, testAddLiquidity } from './testLiquidityPool.js';

// Test basic pool functionality
await testClearSkyPool();

// Test adding liquidity (requires setup)
await testAddLiquidity();
```

## 📈 Monitoring

### Pool State

- Total USDC in pool
- Total HBAR in pool
- Total LP tokens minted
- Current pool ratios

### User Positions

- LP token balance
- USDC share
- HBAR share
- Pool ownership percentage

## 🚨 Emergency Procedures

### Pause Pool

```javascript
await poolContract.pause();
```

### Unpause Pool

```javascript
await poolContract.unpause();
```

### Emergency Withdraw

```javascript
await poolContract.emergencyWithdraw();
```

## 🔄 Integration

### Frontend Integration

```javascript
// Connect to pool
const poolContract = new ethers.Contract(poolAddress, abi, signer);

// Add liquidity
const tx = await poolContract.addLiquidity(usdcAmount, minLPTokens, { value: hbarAmount });

// Remove liquidity
const tx = await poolContract.removeLiquidity(lpTokens, minUSDC, minHBAR);
```

### API Integration

```javascript
// Get pool state
const totalUSDC = await poolContract.totalUSDC();
const totalHBAR = await poolContract.totalHBAR();
const totalLPTokens = await poolContract.totalLPTokens();

// Get user share
const [usdcShare, hbarShare, lpBalance] = await poolContract.getUserShare(userAddress);
```

## 📚 Additional Resources

- [Hedera Documentation](https://docs.hedera.com/)
- [Hedera Token Service](https://docs.hedera.com/hedera/core-concepts/tokens)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Hardhat Documentation](https://hardhat.org/docs)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in this repository
- Join our Discord community
- Check the documentation

---

**Built with ❤️ for the ClearSky community** 