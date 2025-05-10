import { useState, useEffect } from 'react';
import { createCoinbaseWalletSDK } from '@coinbase/wallet-sdk';
import Web3 from 'web3';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || ''; // Replace with your contract address

const CONTRACT_ABI = [
  {
    "constant": true,
    "inputs": [],
    "name": "myFunction",
    "outputs": [{ "name": "", "type": "uint256" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
  // Add other ABI entries as necessary
];

export const useWeb3 = () => {
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [contract, setContract] = useState<any>(null);

  useEffect(() => {
    const initWeb3 = async () => {
      // Initialize Coinbase Wallet SDK
      const coinbaseWallet = createCoinbaseWalletSDK({
        appName: 'OffsetZap', // Your app name
        appLogoUrl: 'https://yourapp.com/logo.png', // Your app logo
      });

      // Get the provider from the SDK
      const provider = coinbaseWallet.getProvider();

      // Check if provider is available
      if (provider) {
        const web3Instance = new Web3(provider);
        setWeb3(web3Instance);

        // Request the user's accounts
        const accounts = await provider.request({
          method: 'eth_requestAccounts'
        }) as string[]; // Explicitly cast to string[] type

        setAccount(accounts[0]);

        // Set the contract instance
        const contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
        setContract(contractInstance);
      } else {
        console.log('No Web3 provider found');
      }
    };

    initWeb3();
  }, []);

  return { web3, account, contract };
};
