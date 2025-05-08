"use client";

import { useEffect, useState } from "react";
import CoinbaseWalletSDK from "@coinbase/wallet-sdk";
import { ethers } from "ethers";

export default function SubAccountControls() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [provider, setProvider] = useState(null);
  const [limitSet, setLimitSet] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  const connectWallet = async () => {
    const APP_NAME = "OffsetZap";
    const APP_LOGO_URL = "https://example.com/logo.png"; // optional
    const ETH_JSONRPC_URL = "https://sepolia.base.org"; // or your custom RPC
    const CHAIN_ID = 84532; // Base Sepolia

    const wallet = new CoinbaseWalletSDK({
      appName: APP_NAME,
      appLogoUrl: APP_LOGO_URL,
      darkMode: true,
    });

    const ethereum = wallet.makeWeb3Provider(ETH_JSONRPC_URL, CHAIN_ID);
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    setWalletAddress(accounts[0]);

    const ethersProvider = new ethers.BrowserProvider(ethereum);
    setProvider(ethersProvider);
  };

  const setSpendLimit = () => {
    // Simulated behavior
    setLimitSet(true);
    alert("Spend limit of 0.05 ETH/week has been set.");
  };

  const triggerOffsetTx = async () => {
    if (!provider || !walletAddress) return;
    setTxStatus("Executing...");

    // Simulate transaction
    setTimeout(() => {
      setTxStatus("✅ 0.005 ETH offset transaction complete!");
    }, 2000);
  };

  return (
    <div className="p-4 max-w-md mx-auto text-center">
      <h2 className="text-xl font-bold mb-4">🔄 Sub Account Controls</h2>

      {!walletAddress ? (
        <button onClick={connectWallet} className="bg-black text-white px-4 py-2 rounded">
          Connect Coinbase Wallet
        </button>
      ) : (
        <>
          <p className="mb-2">Connected: {walletAddress}</p>

          {!limitSet && (
            <button onClick={setSpendLimit} className="bg-green-600 text-white px-4 py-2 rounded mb-3">
              Set Spend Limit
            </button>
          )}

          <button onClick={triggerOffsetTx} disabled={!limitSet} className="bg-blue-600 text-white px-4 py-2 rounded">
            Offset Now (0.005 ETH)
          </button>

          {txStatus && <p className="mt-3 text-green-700">{txStatus}</p>}
        </>
      )}
    </div>
  );
}
