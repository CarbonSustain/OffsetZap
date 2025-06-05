import { createAcrossClient } from "@across-protocol/app-sdk";
import { base, polygon } from "viem/chains";
import { Address, parseEther, parseUnits } from "viem";
import { type Chain} from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";

const supportedChains =[
  {
    chainId: base.id,
    viemChain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  },
  {
    chainId: polygon.id,
    viemChain: polygon,
    usdcAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  },
]

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
  "0xb5ffa99a5c7bb98702cf2361762604ec4444e44c918bfcb087c12147edbad470",
  base,
  "https://base-mainnet.infura.io/v3/591c10e615c04ad5a783c9d6b44f0853",
);


async function main() {
  const client = createAcrossClient({
    integratorId: "0xdead", 
    chains: [base, polygon],
  });

  // Create a message for the retirement parameters
  const messageData = {
    beneficiary: "0xdead" as Address, // Example beneficiary address
    beneficiaryName: "OffsetZap User",
    poolToken: "0x2F800Db0fdb5223b3C3f354886d907A671414A7F" // BCT token
  };
  
  // Convert the message data to JSON string and then to hex
  const jsonMessage = JSON.stringify(messageData);
  console.log("Message JSON:", jsonMessage);
  
  // Convert to hex format for the message field
  const messageHex = '0x' + Array.from(new TextEncoder().encode(jsonMessage))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  console.log("Message hex:", messageHex);
  
  const route = {
    originChainId: supportedChains[0].chainId,
    destinationChainId: supportedChains[1].chainId,
    inputToken: supportedChains[0].usdcAddress as Address,
    outputToken: supportedChains[1].usdcAddress as Address,
    recipient: "0xAa84Ef9CB72641E14A0453757fB908c7c950C2f2",
    message: messageHex // Add the encoded message that will trigger handleAcrossTransfer
  }
  console.log('route', route);

  const quote = await client.getQuote({
    route,
    inputAmount: parseUnits("0.9", 6), // Use a much smaller amount
  });
  console.log('quote', quote);


  await client.executeQuote({
    walletClient: wallet,
    deposit: quote.deposit, // returned by `getQuote`
    onProgress: (progress) => {
      if (progress.step === "approve" && progress.status === "txSuccess") {
        // if approving an ERC20, you have access to the approval receipt
        const { txReceipt } = progress;
        console.log('approval receipt', txReceipt.transactionHash);
      }
      if (progress.step === "deposit" && progress.status === "txSuccess") {
        // once deposit is successful you have access to depositId and the deposit receipt
        const { depositId, txReceipt } = progress;
        console.log('deposit receipt', txReceipt.transactionHash);
      }
      if (progress.step === "fill" && progress.status === "txSuccess") {
        // if the fill is successful, you have access the following data
        const { fillTxTimestamp, txReceipt, actionSuccess } = progress;
        console.log('fill receipt', txReceipt.transactionHash);
        // actionSuccess is a boolean flag, telling us if your cross chain messages were successful
      }
    },
  });
}

main();
