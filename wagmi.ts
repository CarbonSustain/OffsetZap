import { coinbaseWallet } from "wagmi/connectors"
import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { baseSepolia, base } from "wagmi/chains";
import { parseEther, toHex } from "viem";

const APP_NAME = "OffsetZap";
const APP_LOGO_URL = "https://example.com/logo.png"; // optional
const ETH_JSONRPC_URL = "https://sepolia.base.org"; // or your custom RPC
const CHAIN_ID = 84532; // Base Sepolia

export function getConfig() {
    return createConfig({
        chains: [baseSepolia, base],
        connectors: [
            coinbaseWallet({
                appName: "My Sub Account Demo",
                preference: {
                    keysUrl: "https://keys-dev.coinbase.com/connect",
                    options: "smartWalletOnly",
                },
                subAccounts: {
                    enableAutoSubAccounts: true,
                    defaultSpendLimits: {
                        84532: [ // Base Sepolia Chain ID
                            {
                                token: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
                                allowance: toHex(parseEther('0.01')), // 0.01 ETH
                                period: 86400, // 24h
                            },
                        ],
                    },
                },
            }),
        ],
        storage: createStorage({
            storage: cookieStorage,
        }),
        ssr: true,
        transports: {
            [baseSepolia.id]: http(),
            [base.id]: http(),
        },
    });
}

declare module "wagmi" {
    interface Register {
        config: ReturnType<typeof getConfig>;
    }
}