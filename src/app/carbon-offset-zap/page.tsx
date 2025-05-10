'use client';  
import { useState } from 'react';
import { useWeb3 } from '../utils/web3'; // Import the custom hook

const CarbonOffsetZapPage = () => {
  const { web3, contract, account } = useWeb3();
  const [ethAmount, setEthAmount] = useState('');
  const [erc20Amount, setErc20Amount] = useState('');
  const [beneficiary, setBeneficiary] = useState('');

  const purchaseWithETH = async () => {
    if (web3 && contract && account) {
      try {
        const value = web3.utils.toWei(ethAmount, 'ether');
        await contract.methods.purchaseWithETH(beneficiary).send({ from: account, value });
        alert('Transaction successful');
      } catch (err) {
        console.error(err);
        alert('Transaction failed');
      }
    }
  };

  const purchaseWithERC20 = async () => {
    if (web3 && contract && account) {
      try {
        const amount = web3.utils.toWei(erc20Amount, 'ether');
        await contract.methods.purchaseWithERC20(beneficiary, amount).send({ from: account });
        alert('Transaction successful');
      } catch (err) {
        console.error(err);
        alert('Transaction failed');
      }
    }
  };

  return (
    <>
      <div>
        <h2>Carbon Offset Zap</h2>
        <h3>Purchase with ETH</h3>
        <input
          type="number"
          placeholder="Amount in ETH"
          value={ethAmount}
          onChange={(e) => setEthAmount(e.target.value)}
        />
        <input
          type="text"
          placeholder="Beneficiary Address"
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
        />
        <button onClick={purchaseWithETH}>Purchase with ETH</button>

        <h3>Purchase with ERC20</h3>
        <input
          type="number"
          placeholder="Amount in Token"
          value={erc20Amount}
          onChange={(e) => setErc20Amount(e.target.value)}
        />
        <input
          type="text"
          placeholder="Beneficiary Address"
          value={beneficiary}
          onChange={(e) => setBeneficiary(e.target.value)}
        />
        <button onClick={purchaseWithERC20}>Purchase with ERC20</button>
      </div>
    </>
  );
};

export default CarbonOffsetZapPage;

