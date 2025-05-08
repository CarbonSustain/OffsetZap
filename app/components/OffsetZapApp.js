// app/components/OffsetZapApp.js
"use client";

import { useConnect, useAccount } from "wagmi";
import { walletConnect } from "@wagmi/connectors";

export default function OffsetZapApp() {
  const { connect } = useConnect();
  const { address, isConnected } = useAccount();

  return (
    <div className="p-4">
      {isConnected ? (
        <p>Connected: {address}</p>
      ) : (
        <button
          onClick={() =>
            connect({
              connector: walletConnect({ options: { projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID } }),
            })
          }
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Connect Coinbase Wallet
        </button>
      )}
    </div>
  );
}
