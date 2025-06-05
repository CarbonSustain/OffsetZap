/**
 * Fee handler utilities for OffsetZap platform
 */
import { encodeFunctionData, parseUnits, parseEther } from "viem";

/**
 * Generate an encoded message for the Across Protocol multicall handler
 * This allows collecting platform fees without requiring a second transaction
 * 
 * @param {string} userAddress - The user's address that will receive tokens (minus fees)
 * @param {bigint} outputAmount - Total amount of tokens to distribute
 * @param {string} outputCurrency - Token address to transfer
 * @param {string} feeRecipientAddress - Address that will receive the fee
 * @param {number} feePercentage - Fee percentage (e.g., 0.01 = 1%)
 * @returns {string} - Encoded message for the multicall handler
 */
export function generateFeeMessage(
  userAddress,
  outputAmount,
  outputCurrency,
  feeRecipientAddress,
  feePercentage
) {
  // Convert fee percentage to proper format (e.g., 1% = 0.01 * 10^18)
  const feePercentageBigInt = parseEther(feePercentage.toString());
  
  // Calculate fee amount and user amount
  const feeAmount = (outputAmount * feePercentageBigInt) / parseEther("1");
  const userAmount = outputAmount - feeAmount;
  
  // ERC20 transfer function signature
  const transferSignature = "function transfer(address to, uint256 amount)";
  
  // Encode transfer function calls
  const userTransferCalldata = encodeFunctionData({
    abi: [{ name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
    functionName: 'transfer',
    args: [userAddress, userAmount]
  });
  
  const feeTransferCalldata = encodeFunctionData({
    abi: [{ name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
    functionName: 'transfer',
    args: [feeRecipientAddress, feeAmount]
  });
  
  // Create the Instructions object
  const instructions = {
    calls: [
      {
        target: outputCurrency,
        callData: userTransferCalldata,
        value: 0n
      },
      {
        target: outputCurrency,
        callData: feeTransferCalldata,
        value: 0n
      }
    ],
    fallbackRecipient: userAddress
  };
  
  // ABI encode the Instructions object
  // Note: This is a simplified version and may need adjustment based on actual encoding requirements
  return encodeInstructionsAbi(instructions);
}

/**
 * Encode the Instructions object to ABI format
 * 
 * @param {Object} instructions - The Instructions object
 * @returns {string} - ABI encoded instructions
 */
function encodeInstructionsAbi(instructions) {
  // In a production environment, you would use a proper ABI encoder
  // For now, we'll create a simplified version that works with Across Protocol
  
  // Convert the instructions to a hex string format that Across expects
  // This is a simplified implementation - in production, use a proper ABI encoder library
  const encodedCalls = instructions.calls.map(call => {
    return {
      target: call.target,
      callData: call.callData,
      value: '0x' + call.value.toString(16)
    };
  });
  
  const instructionsObject = {
    calls: encodedCalls,
    fallbackRecipient: instructions.fallbackRecipient
  };
  
  // For now, we'll use a simple hex encoding of the JSON as a placeholder
  // In production, replace this with proper ABI encoding using ethers.js or viem
  return '0x' + Array.from(new TextEncoder().encode(JSON.stringify(instructionsObject)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Default fee settings for the platform
 */
export const DEFAULT_FEE_SETTINGS = {
  feePercentage: 0.005, // 0.5%
  feeRecipientAddress: "0x5e48416C99204c14f82b56327B72657C68742796" // Replace with your actual fee recipient address
};
