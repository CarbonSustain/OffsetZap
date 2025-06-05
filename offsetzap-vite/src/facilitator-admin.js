/**
 * Facilitator Admin Utility
 * 
 * This standalone utility allows checking the USDC balance of the KlimaRetirementFacilitator contract
 * and withdrawing any tokens that may be stuck in the contract.
 * 
 * IMPORTANT: Only the contract owner can withdraw tokens.
 */

import { ethers } from 'ethers';

// Constants
const KLIMA_RETIREMENT_FACILITATOR = "0xc8A7eF66A708D1Bb4A447444687321CED6287F9c"; // Actual facilitator address
const POLYGON_USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const POLYGON_CHAIN_ID = 137;

// ABI fragments for the functions we need
const FACILITATOR_ABI = [
  "function owner() view returns (address)",
  "function withdrawTokens(address tokenAddress) external",
  "function withdrawEth() external"
];

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

/**
 * Initialize ethers provider and signer
 * @returns {Promise<{provider: ethers.providers.Web3Provider, signer: ethers.Signer}>}
 */
async function initializeProvider() {
  // Check if window.ethereum is available
  if (!window.ethereum) {
    throw new Error("MetaMask or another web3 provider is required");
  }

  // Request account access
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  
  // Create ethers provider and signer
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  
  // Check if we're on the correct network
  const network = await provider.getNetwork();
  if (network.chainId !== POLYGON_CHAIN_ID) {
    throw new Error(`Please switch to Polygon network (Chain ID: ${POLYGON_CHAIN_ID})`);
  }
  
  return { provider, signer };
}

/**
 * Check if the current user is the contract owner
 * @param {ethers.Signer} signer - The ethers signer
 * @returns {Promise<boolean>} - True if the current user is the owner
 */
async function isContractOwner(signer) {
  const facilitatorContract = new ethers.Contract(
    KLIMA_RETIREMENT_FACILITATOR,
    FACILITATOR_ABI,
    signer
  );
  
  const ownerAddress = await facilitatorContract.owner();
  const signerAddress = await signer.getAddress();
  
  return ownerAddress.toLowerCase() === signerAddress.toLowerCase();
}

/**
 * Check the token balance of the facilitator contract
 * @param {ethers.providers.Web3Provider} provider - The ethers provider
 * @param {string} tokenAddress - The token address to check
 * @returns {Promise<{balance: string, symbol: string, decimals: number}>} - The balance info
 */
export async function checkTokenBalance(provider, tokenAddress = POLYGON_USDC_ADDRESS) {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );
    
    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    const rawBalance = await tokenContract.balanceOf(KLIMA_RETIREMENT_FACILITATOR);
    const balance = ethers.utils.formatUnits(rawBalance, decimals);
    
    return {
      balance,
      symbol,
      decimals,
      rawBalance
    };
  } catch (error) {
    console.error("Failed to check token balance:", error);
    throw error;
  }
}

/**
 * Check the ETH balance of the facilitator contract
 * @param {ethers.providers.Web3Provider} provider - The ethers provider
 * @returns {Promise<string>} - The ETH balance
 */
export async function checkEthBalance(provider) {
  try {
    const balance = await provider.getBalance(KLIMA_RETIREMENT_FACILITATOR);
    return ethers.utils.formatEther(balance);
  } catch (error) {
    console.error("Failed to check ETH balance:", error);
    throw error;
  }
}

/**
 * Withdraw tokens from the facilitator contract
 * @param {ethers.Signer} signer - The ethers signer
 * @param {string} tokenAddress - The token address to withdraw
 * @returns {Promise<{hash: string, status: string}>} - The transaction result
 */
export async function withdrawTokens(signer, tokenAddress = POLYGON_USDC_ADDRESS) {
  try {
    // Check if the signer is the contract owner
    const isOwner = await isContractOwner(signer);
    if (!isOwner) {
      throw new Error("Only the contract owner can withdraw tokens");
    }
    
    // Create contract interface
    const facilitatorContract = new ethers.Contract(
      KLIMA_RETIREMENT_FACILITATOR,
      FACILITATOR_ABI,
      signer
    );
    
    // Call withdrawTokens function
    const tx = await facilitatorContract.withdrawTokens(tokenAddress);
    console.log("Withdraw tokens transaction sent:", tx);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Withdraw tokens transaction confirmed:", receipt);
    
    return {
      hash: receipt.transactionHash,
      status: receipt.status === 1 ? 'success' : 'failed'
    };
  } catch (error) {
    console.error("Failed to withdraw tokens:", error);
    throw error;
  }
}

/**
 * Withdraw ETH from the facilitator contract
 * @param {ethers.Signer} signer - The ethers signer
 * @returns {Promise<{hash: string, status: string}>} - The transaction result
 */
export async function withdrawEth(signer) {
  try {
    // Check if the signer is the contract owner
    const isOwner = await isContractOwner(signer);
    if (!isOwner) {
      throw new Error("Only the contract owner can withdraw ETH");
    }
    
    // Create contract interface
    const facilitatorContract = new ethers.Contract(
      KLIMA_RETIREMENT_FACILITATOR,
      FACILITATOR_ABI,
      signer
    );
    
    // Call withdrawEth function
    const tx = await facilitatorContract.withdrawEth();
    console.log("Withdraw ETH transaction sent:", tx);
    
    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Withdraw ETH transaction confirmed:", receipt);
    
    return {
      hash: receipt.transactionHash,
      status: receipt.status === 1 ? 'success' : 'failed'
    };
  } catch (error) {
    console.error("Failed to withdraw ETH:", error);
    throw error;
  }
}

// Example usage for browser console:
window.facilitatorAdmin = {
  initializeProvider,
  isContractOwner,
  checkTokenBalance,
  checkEthBalance,
  withdrawTokens,
  withdrawEth
};

// Export all functions
export {
  initializeProvider,
  isContractOwner
};
