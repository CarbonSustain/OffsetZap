// OffsetZap – Frontend + Backend Demo (Simplified MVP)

// This code includes:
// - React frontend with Connect Wallet + Set Spend Limit + Offset Now buttons
// - Backend-like utility for triggering onchain transactions via Sub Account (simulated for now)

// ------------------- FRONTEND -------------------
"use client";
import { useState } from "react";
import { ConnectWallet, useWallet } from "@coinbase/onchain-kit";

export default function OffsetZapApp() {
  const wallet = useWallet();
  const [limitSet, setLimitSet] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  const setSpendLimit = async () => {
    // Simulate Sub Account Spend Limit setup (normally via Coinbase Smart Wallet SDK)
    setLimitSet(true);
    alert("Spend limit of 0.05 ETH/week set on Sub Account!");
  };

  const triggerOffset = async () => {
    setTxStatus("Executing...");

    // Simulate onchain tx execution via delegated Sub Account (normally this is done server-side)
    setTimeout(() => {
      setTxStatus("✅ 0.005 ETH offset transaction complete!");
    }, 2000);
  };

  return (
    <div className="p-4 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">🌱 OffsetZap (Base Sepolia)</h1>

      {!wallet.connected ? (
        <ConnectWallet />
      ) : (
        <>
          <p className="mb-2">Wallet connected: {wallet.address}</p>

          {!limitSet && (
            <button className="bg-green-500 text-white px-4 py-2 rounded mb-3" onClick={setSpendLimit}>
              Set Spend Limit (0.05 ETH)
            </button>
          )}

          <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={triggerOffset} disabled={!limitSet}>
            Offset Now (0.005 ETH)
          </button>

          {txStatus && <p className="mt-3 text-green-700">{txStatus}</p>}
        </>
      )}
    </div>
  );
}

// ------------------- BACKEND NOTES -------------------
// In a full app, you'd use the Coinbase Smart Wallet SDK + Base Sepolia to:
// - Set up Sub Account delegation
// - Define Spend Limits via SDK
// - Execute carbon offset smart contract (e.g., buy & retire $BCT)
// - Log all emissions in a backend DB for reporting

// Optional:
// - Track offsets to a Farcaster handle
// - Send SBT confirming offset completed
