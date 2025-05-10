
// src/app/utils/web3.ts
import { useState, useEffect } from 'react';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils';

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS; // Replace with your contract address
const CONTRACT_ABI: AbiItem[] = [ /* Your Contract ABI here */];

export const useWeb3 = () => {
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [contract, setContract] = useState<any>(null);

  useEffect(() => {
    if (window.ethereum) {
      const web3Instance = new Web3(window.ethereum);
      setWeb3(web3Instance);

      window.ethereum.enable().then((accounts: string[]) => {
        setAccount(accounts[0]);
      });

      const contractInstance = new web3Instance.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
      setContract(contractInstance);
    } else {
      console.log('No Web3 provider found');
    }
  }, []);

  return { web3, account, contract };
};

