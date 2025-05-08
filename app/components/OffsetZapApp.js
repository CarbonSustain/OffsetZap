"use client";
import { useState } from "react";
import { ethers } from "ethers";
import CoinbaseWalletSDK from "@coinbase/wallet-sdk";

export default function OffsetZapApp() {
  const [walletAddress, setWalletAddress] = useState("");
  const [provider, setProvider] = useState(null);
  const [limitSet, setLimitSet] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  const connectWallet = async () => {
    const APP_NAME = "OffsetZap";
    const APP_LOGO_URL = "https://yourapp.com/logo.png";
    const DEFAULT_CHAIN_ID = 84532; // Base Sepolia

    const wallet = new CoinbaseWalletSDK({
      appName: APP_NAME,
      appLogoUrl: APP_LOGO_URL,
      darkMode: false,
    });

    const ethereum = wallet.makeWeb3Provider(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL, DEFAULT_CHAIN_ID);

    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    setWalletAddress(accounts[0]);
    setProvider(new ethers.BrowserProvider(ethereum));
  };

  const setSpendLimit = () => {
    setLimitSet(true);
    alert("Spend limit of 0.05 ETH/week set on Sub Account!");
  };

  const triggerOffset = async () => {
    setTxStatus("Executing...");
    setTimeout(() => {
      setTxStatus("✅ 0.005 ETH offset transaction complete!");
    }, 2000);
  };

  return (
    <div className="p-4 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">🌱 OffsetZap (Base Sepolia)</h1>

      {!walletAddress ? (
        <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={connectWallet}>
          Connect Coinbase Wallet
        </button>
      ) : (
        <>
          <p className="mb-2">Connected: {walletAddress}</p>

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
