import { createAcrossClient, AcrossClient } from "@across-protocol/app-sdk";
import { base, polygon } from "viem/chains";
import { Address, parseEther, parseUnits, encodeFunctionData, encodeAbiParameters } from "viem";
import { type Chain} from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";

const supportedChains = [
  {
    chainId: base.id,
    viemChain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`
  },
  {
    chainId: polygon.id,
    viemChain: polygon,
    usdcAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as `0x${string}`,
  },
];

// Facilitator contract on Polygon that will handle the retirement
const FACILITATOR_ADDRESS = "0x1358a1b9a4F6Cb95e7df2D5E7303C6c2f96D6516" as `0x${string}`;

// Across multicall handler on Polygon
const ACROSS_MULTICALL_HANDLER = "0x924a9f036260DdD5808007E1AA95f08eD08aA569" as `0x${string}`;

export function createUserWalletClient(
  privateKey: `0x${string}`,
  chain: Chain,
  rpcUrl: string,
) {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    chain,
    account,
    transport: http(rpcUrl),
  });
  return walletClient;
}

const wallet = createUserWalletClient(
  "0xb5ffa99a5c7bb98702cf2361762604ec4444e44c918bfcb087c12147edbad470", // wallet private key
  base,
  "https://base-mainnet.infura.io/v3/591c10e615c04ad5a783c9d6b44f0853",
);

async function main() {
  // Create Across client with integrator ID
  const client = createAcrossClient({
    integratorId: "0x4f66", // OffsetZap integrator ID (request a real one from Across team)
    chains: [base, polygon],
  });

  // Create retirement parameters
  // IMPORTANT: We need to use a proper EOA as beneficiary, not a contract address
  // This is because the KlimaDAO retirement process mints an NFT receipt to the beneficiary
  // and contracts need to implement ERC721Receiver to receive NFTs
  const retirementParams = {
    // Use wallet.account.address as beneficiary to ensure it's an EOA that can receive NFTs
    beneficiary: wallet.account.address as Address,
    beneficiaryName: "OffsetZap User",
    poolToken: "0x2F800Db0fdb5223b3C3f354886d907A671414A7F" // BCT token
  };
  
  // Convert retirement params to hex string
  const jsonMessage = JSON.stringify(retirementParams);
  console.log("Retirement params JSON:", jsonMessage);
  
  const retirementParamsHex = '0x' + Array.from(new TextEncoder().encode(jsonMessage))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  console.log("Retirement params hex:", retirementParamsHex);
  
  // Define the amount to use consistently across all calls
  const amount = parseUnits("0.9", 6);

  // Encode the approval call to allow the facilitator to spend USDC
  const approveCalldata = encodeFunctionData({
    abi: [{
      name: 'approve',
      type: 'function',
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable'
    }],
    functionName: 'approve',
    args: [
      FACILITATOR_ADDRESS, // Approve the facilitator to spend USDC
      amount // Same amount as our input amount
    ]
  });
  
  console.log('Approve calldata:', approveCalldata);

  // Encode the transfer call to send USDC directly to the facilitator
  const transferCalldata = encodeFunctionData({
    abi: [{
      name: 'transfer',
      type: 'function',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable'
    }],
    functionName: 'transfer',
    args: [
      FACILITATOR_ADDRESS, // Send USDC to the facilitator
      amount // Same amount as our input amount
    ]
  });
  
  console.log('Transfer calldata:', transferCalldata);

  // Encode the call to the facilitator's handleAcrossTransfer function
  const facilitatorCalldata = encodeFunctionData({
    abi: [{
      name: 'handleAcrossTransfer',
      type: 'function',
      inputs: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'message', type: 'bytes' }
      ],
      outputs: [],
      stateMutability: 'nonpayable'
    }],
    functionName: 'handleAcrossTransfer',
    args: [
      FACILITATOR_ADDRESS, // The recipient should be the facilitator itself
      amount, // Use the defined amount variable
      retirementParamsHex as `0x${string}` // Our retirement parameters with wallet address as beneficiary
    ]
  });
  
  console.log('Facilitator calldata:', facilitatorCalldata);
  
  // Format the message according to Across multicall handler format
  // This encodes an Instructions object that tells the handler what to execute
  const messageHex = encodeAbiParameters(
    [
      {
        name: 'instructions',
        type: 'tuple',
        components: [
          {
            name: 'calls',
            type: 'tuple[]',
            components: [
              { name: 'target', type: 'address' },
              { name: 'callData', type: 'bytes' },
              { name: 'value', type: 'uint256' }
            ]
          },
          { name: 'fallbackRecipient', type: 'address' }
        ]
      }
    ],
    [
      {
        calls: [
          {
            // First call: Transfer USDC directly to the facilitator
            target: supportedChains[1].usdcAddress, // USDC on Polygon
            callData: transferCalldata,
            value: 0n
          },
          {
            // Second call: Call the facilitator's handleAcrossTransfer function after it has the tokens
            target: FACILITATOR_ADDRESS,
            callData: facilitatorCalldata,
            value: 0n
          }
        ],
        fallbackRecipient: "0x352bd309f1b5595ca03d16008cd1404091cd5951" // fallback recipient in case the call fails (burn address)
      }
    ]
  );
  
  console.log('Encoded multicall message:', messageHex);
  
  // Prepare route using the multicall handler as recipient
  const route = {
    originChainId: supportedChains[0].chainId,
    destinationChainId: supportedChains[1].chainId,
    inputToken: supportedChains[0].usdcAddress as Address,
    outputToken: supportedChains[1].usdcAddress as Address,
    recipient: ACROSS_MULTICALL_HANDLER, // Use the multicall handler instead of our facilitator directly
    message: messageHex // Add the encoded instructions
  };
  
  console.log('Route:', route);

  // Get quote from Across
  const quote = await client.getQuote({
    route,
    inputAmount: parseUnits("0.9", 6), // Use a small amount for testing
  });
  
  console.log('Quote:', quote);

  // Extract the exact output amount that will be received on the destination chain
  const outputAmount = quote.deposit.outputAmount;
  console.log(`Output amount after fees: ${outputAmount}`);
  
  // Now that we have the exact output amount, update our calls to use this amount
  // Re-encode the transfer call with the exact output amount
  const updatedTransferCalldata = encodeFunctionData({
    abi: [{
      name: 'transfer',
      type: 'function',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ type: 'bool' }],
      stateMutability: 'nonpayable'
    }],
    functionName: 'transfer',
    args: [
      FACILITATOR_ADDRESS, // Send USDC to the facilitator
      outputAmount // Use the exact output amount from the quote
    ]
  });
  
  // Re-encode the facilitator call with the exact output amount
  const updatedFacilitatorCalldata = encodeFunctionData({
    abi: [{
      name: 'handleAcrossTransfer',
      type: 'function',
      inputs: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'message', type: 'bytes' }
      ],
      outputs: [],
      stateMutability: 'nonpayable'
    }],
    functionName: 'handleAcrossTransfer',
    args: [
      FACILITATOR_ADDRESS, // The recipient should be the facilitator itself
      outputAmount, // Use the exact output amount from the quote
      retirementParamsHex as `0x${string}` // Our retirement parameters with wallet address as beneficiary
    ]
  });
  
  // Update the route message with the updated call data
  const updatedMessageHex = encodeAbiParameters(
    [
      {
        name: 'instructions',
        type: 'tuple',
        components: [
          {
            name: 'calls',
            type: 'tuple[]',
            components: [
              { name: 'target', type: 'address' },
              { name: 'callData', type: 'bytes' },
              { name: 'value', type: 'uint256' }
            ]
          },
          { name: 'fallbackRecipient', type: 'address' }
        ]
      }
    ],
    [
      {
        calls: [
          {
            // First call: Transfer USDC directly to the facilitator with exact amount
            target: supportedChains[1].usdcAddress, // USDC on Polygon
            callData: updatedTransferCalldata,
            value: 0n
          },
          {
            // Second call: Call the facilitator's handleAcrossTransfer function with exact amount
            target: FACILITATOR_ADDRESS,
            callData: updatedFacilitatorCalldata,
            value: 0n
          }
        ],
        fallbackRecipient: "0x352bd309f1b5595ca03d16008cd1404091cd5951" // fallback recipient in case the call fails
      }
    ]
  );
  
  // Update the route with the new message
  route.message = updatedMessageHex;
  
  // IMPORTANT: We also need to update the quote's message directly
  // This ensures the Across SDK uses our updated message with the correct output amount
  quote.deposit.message = updatedMessageHex;
  
  console.log('Updated route with exact amounts:', route);
  
  // Execute the deposit
  const deposit = await client.executeQuote({
    walletClient: wallet,
    deposit: quote.deposit,
    onProgress: (progress) => {
      console.log(`Progress step: ${progress.step}, status: ${progress.status}`);
      
      if (progress.step === "approve" && progress.status === "txSuccess") {
        // if approving an ERC20, you have access to the approval receipt
        const { txReceipt } = progress;
        console.log('Approval receipt:', txReceipt.transactionHash);
      }
      
      if (progress.step === "deposit" && progress.status === "txSuccess") {
        // once deposit is successful you have access to depositId and the deposit receipt
        const { depositId, txReceipt } = progress;
        console.log('Deposit receipt:', txReceipt.transactionHash);
        console.log('Deposit ID:', depositId);
      }
      
      if (progress.step === "fill" && progress.status === "txSuccess") {
        // if the fill is successful, you have access to the following data
        const { fillTxTimestamp, txReceipt, actionSuccess } = progress;
        console.log('Fill receipt:', txReceipt.transactionHash);
        console.log('Action success:', actionSuccess);
        console.log('Fill timestamp:', fillTxTimestamp);
      }
    },
  });
}

main().catch(error => {
  console.error('Error in main:', error);
});