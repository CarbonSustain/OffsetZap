import dotenv from "dotenv";
import { ethers } from "ethers";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root (two levels up from this file)
const envPath = path.join(__dirname, "../../.env");
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn(`⚠️  Warning: Could not load .env file from ${envPath}`);
  console.warn(`   Error: ${envResult.error.message}`);
  console.warn(`   Make sure the .env file exists in the project root.`);
} else {
  console.log(`✅ Loaded .env file from: ${envPath}`);
}

// Load deployment data from JSON
function getDeploymentData() {
  const deploymentPath = path.join(
    __dirname,
    "../../clearsky-cdr-deployment.json"
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

  // Determine network from environment or default to testnet
  const network = process.env.NETWORK || "testnet";
  const networkData = deployment[network];

  if (!networkData) {
    throw new Error(`Deployment data not found for network: ${network}`);
  }

  if (!networkData.hbarOffset || !networkData.hbarOffset.address) {
    throw new Error(`Contract address not found for network: ${network}`);
  }

  // Get RPC URL from environment variables based on network
  const rpcUrl =
    network === "testnet"
      ? process.env.HEDERA_TESTNET_RPC_URL
      : process.env.HEDERA_MAINNET_RPC_URL;

  if (!rpcUrl) {
    throw new Error(
      `RPC URL not set in environment. Set ${
        network === "testnet"
          ? "HEDERA_TESTNET_RPC_URL"
          : "HEDERA_MAINNET_RPC_URL"
      } in your .env file.`
    );
  }

  return {
    contractAddress: networkData.hbarOffset.address,
    rpcUrl: rpcUrl,
    network: network,
  };
}

// Load factory deployment data
function getFactoryDeploymentData() {
  const factoryDeploymentPath = path.join(
    __dirname,
    "../../clearsky-factory-deployment.json"
  );
  if (!fs.existsSync(factoryDeploymentPath)) {
    throw new Error(
      `Factory deployment file not found: ${factoryDeploymentPath}`
    );
  }
  const deployment = JSON.parse(fs.readFileSync(factoryDeploymentPath, "utf8"));

  // Determine network from environment or default to testnet
  const network = process.env.NETWORK || "testnet";

  // Factory deployment JSON structure may vary, try to get factory address
  let factoryAddress;
  if (deployment.factory && deployment.factory.contractAddress) {
    factoryAddress = deployment.factory.contractAddress;
  } else if (deployment[network] && deployment[network].factory) {
    factoryAddress =
      deployment[network].factory.address ||
      deployment[network].factory.contractAddress;
  } else {
    throw new Error(
      `Factory address not found in deployment file for network: ${network}`
    );
  }

  return {
    factoryAddress: factoryAddress,
    network: network,
  };
}

const deploymentData = getDeploymentData();
const HEDERA_RPC_URL = deploymentData.rpcUrl;
const CONTRACT_ADDRESS = deploymentData.contractAddress;
const CARBONMARK_API_KEY = process.env.CARBONMARK_API_KEY;
const CARBONMARK_BASE = "https://v17.api.carbonmark.com";
const CARBONMARK_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${CARBONMARK_API_KEY}`,
};

const OFFSET_ABI = [
  "event OffsetRequested(address indexed user, uint256 hbarAmount, string metadata, address poolAddress, uint256 requestId)",
];

async function getHbarUsdPrice() {
  // TODO: Replace with a real price feed or API call
  return 0.08; // $0.08 per HBAR (placeholder)
}

async function getCarbonPrice(projectId) {
  const url = `${CARBONMARK_BASE}/prices?projectIds=${encodeURIComponent(
    projectId
  )}`;
  const res = await fetch(url, { headers: CARBONMARK_HEADERS });
  if (!res.ok)
    throw new Error(`Price fetch failed: ${res.status} ${await res.text()}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0)
    throw new Error(`No price for project ${projectId}`);
  return arr[0]; // Use first/cheapest option
}

async function createQuote(asset_price_source_id, tonnes) {
  const res = await fetch(`${CARBONMARK_BASE}/quotes`, {
    method: "POST",
    headers: CARBONMARK_HEADERS,
    body: JSON.stringify({
      asset_price_source_id,
      quantity_tonnes: tonnes,
    }),
  });
  if (!res.ok)
    throw new Error(`Quote failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createOrder(
  quoteUuid,
  beneficiaryName,
  beneficiaryAddress,
  message
) {
  const res = await fetch(`${CARBONMARK_BASE}/orders`, {
    method: "POST",
    headers: CARBONMARK_HEADERS,
    body: JSON.stringify({
      quote_uuid: quoteUuid,
      beneficiary_name: beneficiaryName,
      beneficiary_address: beneficiaryAddress,
      retirement_message: message,
      consumption_metadata: null, // Set to null (required by Carbonmark API)
    }),
  });
  if (!res.ok)
    throw new Error(`Order failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function checkOrderStatus(orderId, quoteUuid) {
  const url = `${CARBONMARK_BASE}/orders?ids=${orderId}&quote_uuid=${quoteUuid}`;
  const res = await fetch(url, { headers: CARBONMARK_HEADERS });
  if (!res.ok)
    throw new Error(
      `Order status check failed: ${res.status} ${await res.text()}`
    );
  const orders = await res.json();
  return Array.isArray(orders) && orders.length > 0 ? orders[0] : null;
}

async function waitForOrderCompletion(orderId, quoteUuid, maxAttempts = 60) {
  console.log(`⏳ Waiting for order ${orderId} to complete...`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds between checks

    const order = await checkOrderStatus(orderId, quoteUuid);
    if (!order) {
      console.log(
        `   Attempt ${attempt}/${maxAttempts}: Order not found yet...`
      );
      continue;
    }

    console.log(
      `   Attempt ${attempt}/${maxAttempts}: Status = ${order.status}`
    );

    if (order.status === "COMPLETED") {
      console.log(`✅ Order completed!`);
      if (order.view_retirement_url) {
        console.log(`🔗 View Retirement: ${order.view_retirement_url}`);
      }
      if (order.polygonscan_url) {
        console.log(`🔗 PolygonScan: ${order.polygonscan_url}`);
      }
      return order;
    }

    if (order.status === "FAILED" || order.status === "CANCELLED") {
      throw new Error(`Order ${order.status.toLowerCase()}: ${orderId}`);
    }
  }

  throw new Error(`Order did not complete within ${maxAttempts * 2} seconds`);
}

async function main() {
  console.log(`🌐 Network: ${deploymentData.network}`);
  console.log(`🔗 RPC URL: ${HEDERA_RPC_URL}`);
  console.log(`📦 Contract Address: ${CONTRACT_ADDRESS}`);
  console.log(`🔑 Carbonmark API Key: ${CARBONMARK_API_KEY || "NOT SET"}`);

  const provider = new ethers.JsonRpcProvider(HEDERA_RPC_URL, undefined, {
    // Disable ENS for Hedera networks
    ensAddress: null,
    nameResolver: null,
  });

  // Verify connection
  try {
    const network = await provider.getNetwork();
    console.log(`✅ Connected to network (Chain ID: ${network.chainId})`);
  } catch (error) {
    console.error(`❌ Failed to connect to RPC: ${HEDERA_RPC_URL}`);
    console.error(`Error: ${error.message}`);
    throw error;
  }

  const contract = new ethers.Contract(CONTRACT_ADDRESS, OFFSET_ABI, provider);
  console.log(
    `👂 Polling for offset requests on contract: ${CONTRACT_ADDRESS}`
  );

  // Track processed events to avoid duplicates
  const processedEvents = new Set();
  let lastProcessedBlock = await provider.getBlockNumber();

  // Queue for processing requests sequentially
  const requestQueue = [];
  let isProcessing = false;

  // Get event topic from contract interface
  const eventTopic = contract.interface.getEvent("OffsetRequested").topicHash;

  async function handleOffsetRequest(
    user,
    hbarAmount,
    metadata,
    poolAddress,
    reqId,
    txHash
  ) {
    try {
      console.log("\n=== New Offset Request ===");
      console.log("User:", user);

      const tiny = BigInt(hbarAmount.toString());
      const hbar = Number(tiny) / 1e8;
      console.log(`HBAR Amount: ${hbar} HBAR (${tiny.toString()} tinybars)`);

      console.log("Metadata:", metadata);
      console.log("Pool Address:", poolAddress);
      console.log("Request ID:", reqId.toString());
      console.log("Transaction Hash:", txHash);
      const price = await getHbarUsdPrice();
      const usd = hbar * price;
      console.log("USD value:", usd);

      const meta = JSON.parse(metadata ?? "{}");
      const project = meta.projectId || "VCS-191"; // default or frontend-provided
      const beneficiaryName = meta.beneficiary_name || user;
      const beneficiaryAddress = meta.beneficiary_address;
      if (!beneficiaryAddress) {
        throw new Error("beneficiary_address required in metadata");
      }

      const priceInfo = await getCarbonPrice(project);
      console.log("Price info:", priceInfo);

      const tonnes = Math.floor((usd / priceInfo.purchasePrice) * 1000) / 1000;
      if (tonnes <= 0) {
        console.warn("Not enough funds to buy even 0.001 tCO2. Skipping.");
        return;
      }
      console.log("Tonnes:", tonnes);

      const quote = await createQuote(priceInfo.sourceId, tonnes);
      console.log("Quote:", quote);

      const order = await createOrder(
        quote.uuid,
        beneficiaryName,
        beneficiaryAddress,
        `HBAR offset for user ${user}, request ${reqId}`
      );
      console.log("Order created:", order);

      // Extract order ID from the response
      // The order response structure may vary, check for common fields
      const orderId =
        order.id ||
        order.order_id ||
        (order.quote && order.quote.credential_id) ||
        null;

      if (orderId) {
        console.log(`📋 Order ID: ${orderId}`);
        // Wait for order completion
        try {
          const completedOrder = await waitForOrderCompletion(
            orderId,
            quote.uuid
          );
          console.log("✅ Retirement completed successfully!");

          // Update pool retirement URL if available
          if (
            completedOrder &&
            completedOrder.view_retirement_url &&
            poolAddress
          ) {
            await updatePoolRetirementUrl(
              poolAddress,
              completedOrder.view_retirement_url
            );
          }
        } catch (err) {
          console.error("Error waiting for order completion:", err);
        }
      } else {
        console.warn(
          "⚠️  Could not extract order ID from response, skipping status check"
        );
        console.warn("   Order response keys:", Object.keys(order));
      }
    } catch (err) {
      console.error("Error handling offset request:", err);
    }
  }

  // Function to update pool retirement URL in factory
  async function updatePoolRetirementUrl(poolAddress, retirementUrl) {
    try {
      console.log(`\n🔗 Updating retirement URL for pool ${poolAddress}...`);

      // Get factory deployment data
      const factoryData = getFactoryDeploymentData();
      const factoryAddress = factoryData.factoryAddress;

      // Load factory contract ABI
      const factoryArtifactPath = path.join(
        __dirname,
        "../../artifacts/contracts/ClearSkyFactory.sol/ClearSkyFactory.json"
      );

      if (!fs.existsSync(factoryArtifactPath)) {
        throw new Error(
          "Factory contract artifacts not found. Run 'npx hardhat compile' first."
        );
      }

      const factoryArtifact = JSON.parse(
        fs.readFileSync(factoryArtifactPath, "utf8")
      );
      const { abi: factoryABI } = factoryArtifact;

      // Get private key from .env
      const privateKey = process.env.PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("Missing PRIVATE_KEY in .env file");
      }

      // Create wallet and contract instance
      const wallet = new ethers.Wallet(privateKey, provider);
      const factoryContract = new ethers.Contract(
        factoryAddress,
        factoryABI,
        wallet
      );

      console.log(
        `📝 Calling setPoolRetirementUrl(${poolAddress}, ${retirementUrl})...`
      );

      // Call setPoolRetirementUrl
      const tx = await factoryContract.setPoolRetirementUrl(
        poolAddress,
        retirementUrl,
        {
          gasLimit: 1_000_000,
        }
      );

      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      console.log(`⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      console.log(`✅ Retirement URL updated in block: ${receipt.blockNumber}`);
      console.log(`🔗 Transaction Hash: ${tx.hash}`);
    } catch (err) {
      console.error("❌ Error updating pool retirement URL:", err);
      // Don't throw - this is not critical for the offset process
    }
  }

  // Process queue sequentially
  async function processQueue() {
    if (isProcessing || requestQueue.length === 0) {
      return;
    }

    isProcessing = true;
    const request = requestQueue.shift();

    try {
      await handleOffsetRequest(
        request.user,
        request.hbarAmount,
        request.metadata,
        request.poolAddress,
        request.reqId,
        request.txHash
      );
    } catch (err) {
      console.error("Error processing request from queue:", err);
    } finally {
      isProcessing = false;
      // Process next item in queue
      if (requestQueue.length > 0) {
        setImmediate(processQueue);
      }
    }
  }

  // Poll for new events
  async function pollForEvents() {
    try {
      const currentBlock = await provider.getBlockNumber();

      // Only query if there are new blocks
      if (currentBlock > lastProcessedBlock) {
        // Query events from the last processed block to current block
        const fromBlock = lastProcessedBlock + 1;
        const toBlock = currentBlock;

        console.log(`🔍 Checking blocks ${fromBlock} to ${toBlock}...`);

        const filter = {
          address: CONTRACT_ADDRESS,
          topics: [eventTopic],
          fromBlock: fromBlock,
          toBlock: toBlock,
        };

        const logs = await provider.getLogs(filter);

        for (const log of logs) {
          // Create a unique key for this event
          const eventKey = `${log.transactionHash}-${log.logIndex}`;

          if (processedEvents.has(eventKey)) {
            continue; // Skip already processed events
          }

          // Decode the event
          const decodedLog = contract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });

          if (decodedLog && decodedLog.name === "OffsetRequested") {
            const [user, hbarAmount, metadata, poolAddress, reqId] =
              decodedLog.args;

            // Add to queue instead of processing immediately
            requestQueue.push({
              user,
              hbarAmount,
              metadata,
              poolAddress,
              reqId,
              txHash: log.transactionHash,
            });
            processedEvents.add(eventKey);

            // Trigger queue processing if not already processing
            if (!isProcessing) {
              setImmediate(processQueue);
            }
          }
        }

        lastProcessedBlock = currentBlock;
      }
    } catch (err) {
      console.error("Error polling for events:", err);
    }
  }

  // Start polling every 5 seconds
  console.log("🔄 Starting event polling (every 5 seconds)...");
  setInterval(pollForEvents, 5000);

  // Poll immediately
  await pollForEvents();
}

main().catch(console.error);
