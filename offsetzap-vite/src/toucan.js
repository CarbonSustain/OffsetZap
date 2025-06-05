/**
 * Toucan SDK integration for OffsetZap, Polygon, USDC -> NCT/BCT retirement
 * Using viem for better gas control on Polygon
 */
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import dotenv from "dotenv";
dotenv.config();

// const ToucanClient = ToucanModule.default;

// Polygon USDC address (native, not bridged)
// export const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
export const POLYGON_USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
export const POOL_TOKENS = {
  NCT: "0xD838290e877E0188a4A44700463419ED96c16107",
  BCT: "0x2F800Db0fdb5223b3C3f354886d907A671414A7F"
};

// Contract addresses
const OFFSET_HELPER_ADDRESS = "0x7cB7C0484d4F2324F51d81E2368823c20AEf8072";

// ABIs
const ERC20_ABI = [
  {
    "inputs": [
      { "name": "spender", "type": "address" },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

const OFFSET_HELPER_ABI = [
  {
    "inputs": [
      { "name": "_fromToken", "type": "address" },
      { "name": "_poolToken", "type": "address" },
      { "name": "_amountToSwap", "type": "uint256" }
    ],
    "name": "autoOffsetExactInToken",
    "outputs": [
      { "name": "tco2s", "type": "address[]" },
      { "name": "amounts", "type": "uint256[]" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

/**
 * Retire carbon using Toucan OffsetHelper contract directly with viem
 * @param {object} opts
 * @param {string} opts.amount - Amount of USDC (in USDC units, e.g. "1.5" for 1.5 USDC)
 * @param {string} [opts.poolSymbol] - "NCT" or "BCT" (default: "NCT")
 * @param {string} [opts.beneficiary] - Beneficiary address (optional)
 * @param {string} [opts.providerUrl] - Polygon RPC URL (default: Infura)
 * @param {string} [opts.privateKey] - Private key for signer (default: from env)
 * @returns {Promise<object>} Transaction receipt and info
 */
export async function retireToucanUSDC({
  amount,
  poolSymbol = "NCT",
  beneficiary,
  providerUrl = "https://polygon-mainnet.infura.io/v3/591c10e615c04ad5a783c9d6b44f0853",
  privateKey = "b5ffa99a5c7bb98702cf2361762604ec4444e44c918bfcb087c12147edbad470"
}) {
  if (!privateKey) throw new Error("Missing private key");
  if (!amount) throw new Error("Amount is required (in USDC, e.g. '1.5')");
  if (!POOL_TOKENS[poolSymbol]) throw new Error("Invalid pool token symbol: " + poolSymbol);

  // Setup viem clients
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(providerUrl)
  });
  
  // Create wallet account from private key
  const privateKeyHex = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(privateKeyHex);
  
  const walletClient = createWalletClient({
    chain: polygon,
    transport: http(providerUrl),
    account
  });

  try {
    // Get wallet address
    const address = walletClient.account.address;
    console.log(`[Toucan] Wallet address: ${address}`);
    const beneficiaryAddr = beneficiary || address;
    
    // Parse amount to wei (USDC has 6 decimals)
    const amountBigInt = parseUnits(amount, 6);
    
    console.log(`[Toucan] Retiring with ${amount} USDC to ${poolSymbol} for beneficiary ${beneficiaryAddr}`);
    
    // Check USDC balance
    const balance = await publicClient.readContract({
      address: POLYGON_USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address]
    });
    
    console.log(`[Toucan] USDC Balance: ${formatUnits(balance, 6)} USDC`);
    
    if (balance < amountBigInt) {
      throw new Error(`Insufficient USDC balance. Have ${formatUnits(balance, 6)}, need ${amount}`);
    }
    
    // Step 1: Approve USDC spending
    console.log(`[Toucan] Approving USDC spending for OffsetHelper...`);
    
    // Get current gas prices with a premium for Polygon
    const { maxFeePerGas, maxPriorityFeePerGas } = await publicClient.estimateFeesPerGas({
      type: 'eip1559',
      // Add 50% to the priority fee to ensure transaction goes through
      maxPriorityFeePerGasMultiplier: 1.5
    });
    
    // Calculate gas fees properly - priority fee must be less than max fee
    const priorityFee = maxPriorityFeePerGas * 2n; // Double priority fee
    const maxFee = maxFeePerGas * 3n; // Triple max fee
    
    console.log(`[Toucan] Using gas settings: maxFeePerGas=${formatUnits(maxFee, 9)} gwei, maxPriorityFeePerGas=${formatUnits(priorityFee, 9)} gwei`);
    
    // Approve with high gas settings
    const approveHash = await walletClient.writeContract({
      address: POLYGON_USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [OFFSET_HELPER_ADDRESS, amountBigInt],
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: priorityFee,
      gas: 100000n // Manual gas limit
    });
    
    console.log(`[Toucan] Approval tx submitted: ${approveHash}`);
    
    // Wait for approval confirmation
    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`[Toucan] USDC approval confirmed with status: ${approveReceipt.status}`);
    
    // Step 2: Call offset function with high gas settings
    console.log(`[Toucan] Calling autoOffsetExactInToken with high gas settings...`);
    
    // Calculate gas fees for the retirement transaction - even higher than approval
    const retirePriorityFee = maxPriorityFeePerGas * 2n; // Double priority fee
    const retireMaxFee = maxFeePerGas * 4n; // Quadruple max fee to ensure it's higher than priority fee
    
    console.log(`[Toucan] Using retirement gas settings: maxFeePerGas=${formatUnits(retireMaxFee, 9)} gwei, maxPriorityFeePerGas=${formatUnits(retirePriorityFee, 9)} gwei`);
    
    const offsetHash = await walletClient.writeContract({
      address: OFFSET_HELPER_ADDRESS,
      abi: OFFSET_HELPER_ABI,
      functionName: 'autoOffsetExactInToken',
      args: [POLYGON_USDC, POOL_TOKENS[poolSymbol], amountBigInt],
      maxFeePerGas: retireMaxFee,
      maxPriorityFeePerGas: retirePriorityFee,
      gas: 500000n // High manual gas limit for complex operations
    });
    
    console.log(`[Toucan] Retirement tx submitted: ${offsetHash}`);
    
    // Wait for retirement confirmation
    const offsetReceipt = await publicClient.waitForTransactionReceipt({ hash: offsetHash });
    console.log(`[Toucan] Retirement tx confirmed with status: ${offsetReceipt.status}`);
    
    return {
      status: "success",
      hash: offsetHash,
      receipt: offsetReceipt,
      pool: poolSymbol,
      amount: amountBigInt.toString(),
      beneficiary: beneficiaryAddr
    };
  } catch (err) {
    console.error("[Toucan] Retirement failed:", err);
    throw err;
  }
}

// Example usage - uncomment to test
// (async () => {
//   try {
//     // Try with a small amount of BCT first
//     console.log("\n=== Attempting retirement with a small amount of BCT ===");
//     await retireToucanUSDC({ amount: "0.01", poolSymbol: "BCT" });
//   } catch (err) {
//     console.error("Error in main:", err.message);
//     
//     try {
//       // Try NCT as fallback
//       console.log("\n=== Trying with NCT instead ===");
//       await retireToucanUSDC({ amount: "0.01", poolSymbol: "NCT" });
//     } catch (fallbackErr) {
//       console.error("Fallback also failed:", fallbackErr.message);
//     }
//   }
// })();
