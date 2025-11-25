import { ethers } from "ethers";
import axios from "axios";
import {
  AccountId,
  Client,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  PrivateKey,
} from "@hashgraph/sdk";
// ---------- CONFIG ----------
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || "testnet";
const HEDERA_MIRROR_URL =
  HEDERA_NETWORK === "mainnet"
    ? "https://mainnet-public.mirrornode.hedera.com"
    : "https://testnet.mirrornode.hedera.com";
const HEDERA_CONTRACT_ID = process.env.HEDERA_CONTRACT_ID || "0.0.0"; // HederaCarbonRetirer contract ID
const POLYGON_RPC = process.env.POLYGON_RPC;
const RELAYER_PRIVATE_KEY_POLYGON = process.env.RELAYER_PK_POLYGON;
const RELAYER_PRIVATE_KEY_HEDERA = process.env.RELAYER_PK_HEDERA; // for confirming on Hedera
const RELAYER_ACCOUNT_ID_HEDERA = process.env.RELAYER_ACCOUNT_ID_HEDERA!;
const POLYGON_EXECUTOR_ADDRESS =(process.env.POLYGON_EXECUTOR_ADDRESS || "").toLowerCase();
const POLYGON_USDC_ADDRESS =
  (process.env.POLYGON_USDC_ADDRESS ||
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174") // default Polygon USDC.e
    .toLowerCase();

const POLYGON_EXECUTOR_ABI = [
  "function executeRetirement(uint256,address,uint8,uint256,string,string) external",
  "event PolygonRetirementExecuted(uint256 indexed hederaRequestId,address indexed polygonReceiver,uint8 pool,uint256 usdcSpent,uint256 tonsRetired,string beneficiary,string message)",
];
const HEDERA_CONTRACT_ABI = [
  "event RetirementRequested(uint256 indexed requestId,address indexed hederaUser,address indexed polygonReceiver,uint256 hbarPaid,uint256 usdcAmount,uint256 minTons,string beneficiary,string message)",
  "function confirmRetirement(uint256 requestId,string polygonTxHash,uint256 retiredTons,string detailsURI)",
];
const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
];
// ---------- Ethers setup for Polygon ----------
const polygonProvider = new ethers.JsonRpcProvider(POLYGON_RPC);
const polygonWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY_POLYGON, polygonProvider);
const polygonExecutor = new ethers.Contract(
  POLYGON_EXECUTOR_ADDRESS,
  POLYGON_EXECUTOR_ABI,
  polygonWallet
);
const polygonUsdc = new ethers.Contract(
  POLYGON_USDC_ADDRESS,
  USDC_ABI,
  polygonWallet
);
const polygonExecutorInterface = new ethers.Interface(POLYGON_EXECUTOR_ABI);
const hederaContractInterface = new ethers.Interface(HEDERA_CONTRACT_ABI);
const retirementRequestedTopic = hederaContractInterface.getEventTopic(
  "RetirementRequested"
);
const polygonRetirementTopic = polygonExecutorInterface.getEventTopic(
  "PolygonRetirementExecuted"
);

// ---------- Hedera SDK client ----------
const hederaClient =
  HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
hederaClient.setOperator(
  AccountId.fromString(RELAYER_ACCOUNT_ID_HEDERA),
  PrivateKey.fromString(RELAYER_PRIVATE_KEY_HEDERA)
);
const hederaContractId = ContractId.fromString(HEDERA_CONTRACT_ID);
// ---------- Hedera helpers (mirror + contract) ----------
// Very rough polling example for Hedera logs
const processedRequestIds = new Set<string>();
let lastConsensusTime: string | null = null;

async function fetchRecentRetirementRequestedEvents() {
  const params = new URLSearchParams({
    order: "desc",
    limit: "25",
  });
  if (lastConsensusTime) {
    params.append("timestamp", `gt:${lastConsensusTime}`);
  }

  const res = await axios.get(
    `${HEDERA_MIRROR_URL}/api/v1/contracts/${HEDERA_CONTRACT_ID}/results/logs?${params.toString()}`
  );

  const events: Array<{
    requestId: bigint;
    polygonReceiver: string;
    usdcAmount: bigint;
    beneficiary: string;
    message: string;
    poolType: number;
    consensusTimestamp: string;
  }> = [];

  for (const log of res.data.logs ?? []) {
    if (!log.topic0 || log.topic0 !== retirementRequestedTopic) {
      continue;
    }

    const decoded = hederaContractInterface.decodeEventLog(
      "RetirementRequested",
      log.data,
      [log.topic0, log.topic1, log.topic2, log.topic3]
    );

    const requestId = decoded.requestId as bigint;
    const requestKey = requestId.toString();
    if (processedRequestIds.has(requestKey)) {
      continue;
    }

    events.push({
      requestId,
      polygonReceiver: (decoded.polygonReceiver as string).toLowerCase(),
      usdcAmount: decoded.usdcAmount as bigint,
      beneficiary: decoded.beneficiary as string,
      message: decoded.message as string,
      poolType: 0, // default BCT, extend request payload if you support specifying pool
      consensusTimestamp: log.consensus_timestamp,
    });
  }

  if (events.length > 0) {
    lastConsensusTime = events[events.length - 1].consensusTimestamp;
  }

  return events.reverse(); // oldest first
}

async function confirmOnHedera(
  requestId: bigint,
  polygonTxHash: string,
  retiredTons: bigint,
  detailsURI: string
) {
  const tx = await new ContractExecuteTransaction()
    .setContractId(hederaContractId)
    .setGas(1_500_000)
    .setFunction(
      "confirmRetirement",
      new ContractFunctionParameters()
        .addUint256(requestId)
        .addString(polygonTxHash)
        .addUint256(retiredTons)
        .addString(detailsURI)
    )
    .execute(hederaClient);

  await tx.getReceipt(hederaClient);
}
// ---------- Hashport / bridging flow placeholder ----------
async function ensureUsdcBridgedToPolygon(
  usdcAmount: bigint,
  polygonReceiver: string
) {
  if (polygonReceiver.toLowerCase() !== polygonWallet.address.toLowerCase()) {
    throw new Error("Bridge destination must be relayer wallet");
  }

  const maxRetries = 12;
  const delayMs = 10_000;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const balance: bigint = await polygonUsdc.balanceOf(polygonWallet.address);
    if (balance >= usdcAmount) {
      return;
    }
    console.log(
      `Waiting for bridged USDC... have ${balance}, need ${usdcAmount} (attempt ${
        attempt + 1
      }/${maxRetries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Timed out waiting for bridged USDC");
}

async function ensureExecutorAllowance(minimumAmount: bigint) {
  const allowance: bigint = await polygonUsdc.allowance(
    polygonWallet.address,
    POLYGON_EXECUTOR_ADDRESS
  );
  if (allowance >= minimumAmount) {
    return;
  }
  console.log("Approving USDC allowance for Polygon executor...");
  const tx = await polygonUsdc.approve(
    POLYGON_EXECUTOR_ADDRESS,
    ethers.MaxUint256
  );
  await tx.wait();
}
// ---------- Main loop ----------
async function processNewRequests() {
  const events = await fetchRecentRetirementRequestedEvents();
  for (const ev of events) {
    const {
      requestId,
      polygonReceiver,
      usdcAmount,
      beneficiary,
      message,
      poolType // you'd need to encode which pool (BCT/NCT) somehow; can reuse minTons or add param
    } = ev;
    console.log(`Processing Hedera request ${requestId}...`);
    // 1. Make sure we have USDC on Polygon (bridged from Hedera)
    await ensureUsdcBridgedToPolygon(usdcAmount, polygonWallet.address);
    await ensureExecutorAllowance(usdcAmount);
    // 2. Execute retirement
    const tx = await polygonExecutor.executeRetirement(
      requestId,
      polygonReceiver,
      poolType,      // 0 = BCT, 1 = NCT
      usdcAmount,
      beneficiary,
      message
    );
    const receipt = await tx.wait();
    const polygonTxHash = receipt.hash;
    let retiredTons = 0n;
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === POLYGON_EXECUTOR_ADDRESS &&
        log.topics[0] === polygonRetirementTopic
      ) {
        const decoded = polygonExecutorInterface.decodeEventLog(
          "PolygonRetirementExecuted",
          log.data,
          log.topics
        );
        retiredTons = decoded.tonsRetired as bigint;
        break;
      }
    }
    const detailsURI = `https://polygonscan.com/tx/${polygonTxHash}`;
    // 3. Confirm on Hedera
    await confirmOnHedera(
      BigInt(requestId),
      polygonTxHash,
      retiredTons,
      detailsURI
    );
    console.log(`Completed retirement for request ${requestId}, Polygon tx: ${polygonTxHash}`);
    processedRequestIds.add(requestId.toString());
  }
}

// Schedule polling loop
async function mainLoop() {
  try {
    await processNewRequests();
  } catch (err) {
    console.error("Relayer loop failure:", err);
  } finally {
    setTimeout(mainLoop, 15_000);
  }
}

mainLoop().catch((err) => {
  console.error("Fatal relayer error:", err);
  process.exit(1);
});