// Sub Account + Spend Limit Integration for Base Builder Quest 5
// Requires: Coinbase Smart Wallet SDK on Base Sepolia
"use client";
import { createSmartWalletClient } from "@coinbase/onchainkit";
import { useState } from "react";

export default function SubAccountControls() {
  const [status, setStatus] = useState("");

  const setupSubAccount = async () => {
    setStatus("Connecting...");

    const client = await createSmartWalletClient({
      chainId: 84532, // Base Sepolia
      appId: "carbon-sustain-offsetzap",
    });

    const parent = await client.getAddress();
    setStatus(`Parent Smart Wallet: ${parent}`);

    const subAcc = await client.createSubAccount({ label: "offsetzap-sub1" });
    setStatus(`Sub Account Created: ${subAcc.address}`);

    await client.setSpendLimit({
      subAccount: subAcc.address,
      tokenAddress: "0x0000000000000000000000000000000000000000", // ETH
      limit: "50000000000000000", // 0.05 ETH
    });

    setStatus("Spend limit set: 0.05 ETH");

    // Store subAccount address in your frontend state or backend DB
  };

  const executeOffsetTx = async () => {
    setStatus("Sending 0.005 ETH from Sub Account...");

    const client = await createSmartWalletClient({
      chainId: 84532,
      appId: "carbon-sustain-offsetzap",
    });

    const subAccounts = await client.getSubAccounts();
    const sub = subAccounts[0]; // First sub-account

    await client.executeTransaction({
      subAccount: sub.address,
      to: "0xYourOffsetZapContractAddress",
      value: "5000000000000000", // 0.005 ETH
    });

    setStatus("✅ Offset complete with no popup!");
  };

  return (
    <div className="p-4">
      <button onClick={setupSubAccount} className="bg-indigo-600 text-white px-4 py-2 rounded">
        Setup Sub Account
      </button>

      <button onClick={executeOffsetTx} className="bg-green-600 text-white px-4 py-2 rounded ml-2">
        Offset Now (0.005 ETH)
      </button>

      <p className="mt-3 text-sm text-gray-700">{status}</p>
    </div>
  );
}

// 🔗 Replace '0xYourOffsetZapContractAddress' with your deployed contract on Base Sepolia.
// 💡 Use Coinbase Smart Wallet testnet faucet to fund parent account.
// 🧠 This code is your core for "no popup" txs using Sub Accounts.
