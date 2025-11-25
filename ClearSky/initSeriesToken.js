import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  try {
    const network = process.env.NETWORK || "testnet";
    const rpcUrl =
      network === "mainnet"
        ? process.env.HEDERA_MAINNET_RPC_URL
        : process.env.HEDERA_TESTNET_RPC_URL;

    if (!rpcUrl) throw new Error("Missing Hedera RPC URL in .env");

    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      ensAddress: null,
      nameResolver: null,
    });

    const priv = process.env.PRIVATE_KEY;
    if (!priv) throw new Error("Missing PRIVATE_KEY in .env");
    const wallet = new ethers.Wallet(priv, provider);

    // Read deployment info to get SeriesVault address
    const deploymentPath = path.join(
      process.cwd(),
      "clearsky-factory-deployment.json"
    );
    if (!fs.existsSync(deploymentPath))
      throw new Error("clearsky-factory-deployment.json not found");
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const seriesVaultAddress = deployment?.seriesVault?.address;
    if (!seriesVaultAddress)
      throw new Error("SeriesVault address not found in deployment json");

    // Load SeriesVault ABI
    const seriesVaultArtifactPath =
      "./artifacts/contracts/SeriesVault.sol/SeriesVault.json";
    if (!fs.existsSync(seriesVaultArtifactPath))
      throw new Error("SeriesVault artifacts not found. Compile first.");
    const { abi } = JSON.parse(
      fs.readFileSync(seriesVaultArtifactPath, "utf8")
    );

    const seriesVault = new ethers.Contract(seriesVaultAddress, abi, wallet);

    // Params
    const name = process.env.SERIES_NAME || "ClearSky Series";
    const symbol = process.env.SERIES_SYMBOL || "CSER";
    const memo = process.env.SERIES_MEMO || "SeriesVault: Series NFT";
    const maxSupply = BigInt(process.env.SERIES_MAX_SUPPLY || "0");
    const valueHbar = process.env.SERIES_CREATION_FEE_HBAR || "5";

    console.log("🧩 Calling initCreateSeriesToken on SeriesVault...");
    console.log("  Vault:", seriesVaultAddress);
    console.log("  Deployer:", wallet.address);
    const tx = await seriesVault.initCreateSeriesToken(
      name,
      symbol,
      memo,
      maxSupply,
      {
        // Hedera EVM uses wei (1 HBAR = 10^18 wei), same as Ethereum
        value: ethers.parseEther(valueHbar),
        gasLimit: BigInt(process.env.SERIES_INIT_GAS || "20000000"),
      }
    );
    console.log("⏳ Waiting for tx...", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ initCreateSeriesToken mined in block", receipt.blockNumber);

    // Read token address from contract and resolve numeric token_id via mirror
    const evmTokenAddr = await seriesVault.seriesToken();
    console.log("🪙 Series token (EVM):", evmTokenAddr);

    const mirrorBase =
      process.env.REACT_APP_MIRROR_NODE_URL ||
      "https://testnet.mirrornode.hedera.com";
    try {
      const resp = await fetch(
        `${mirrorBase}/api/v1/tokens/${
          evmTokenAddr.startsWith("0x") ? evmTokenAddr : `0x${evmTokenAddr}`
        }`
      );
      if (resp.ok) {
        const json = await resp.json();
        if (json && (json.token_id || json.tokenId)) {
          console.log("🆔 Series token id:", json.token_id || json.tokenId);
        } else {
          console.log(
            "ℹ️ Mirror did not return token_id yet. Try again shortly."
          );
        }
      } else {
        console.log("ℹ️ Mirror lookup failed:", resp.status);
      }
    } catch (e) {
      console.log("ℹ️ Mirror lookup error:", e.message);
    }
  } catch (e) {
    console.error("❌ initSeriesToken failed:", e);
    process.exit(1);
  }
}

main();
