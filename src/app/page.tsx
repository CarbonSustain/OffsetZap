'use client'

import { parseEther } from 'viem'
import { useAccount, useConnect, useDisconnect, useSendTransaction, useSignMessage } from 'wagmi'
import { useRouter } from 'next/navigation';  
import { useEffect } from 'react';

function App() {
  const account = useAccount()
  const router = useRouter() 
  useEffect(() => {
    //console.log(router.pathname); // Now that the component is mounted, you can safely use the router
  }, [router]);

  const { connectors, connect, status, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { sendTransactionAsync, data } = useSendTransaction()
  const { signMessage, data: signData } = useSignMessage()  // Function to navigate to the new page
  
  const navigateToCarbonOffsetZap = () => {
    router.push('/carbon-offset-zap');  // Path to your new page
  };
  
  return (
    <>
      <div>
        <h2>Account</h2>
 
        <div>
          Status: {account.status}
          <br />
          Sub Account Address: {JSON.stringify(account.addresses)}
          <br />
          ChainId: {account.chainId}
        </div>
 
        {account.status === 'connected' && (
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
        )}
      </div>
 
      <div>
        <h2>Connect</h2>
        {connectors
          .filter((connector) => connector.name === 'Coinbase Wallet')
          .map((connector) => (
            <button
              key={connector.uid}
              onClick={() => connect({ connector })}
              type="button"
            >
              Sign in with Smart Wallet
            </button>
          ))}
        <div>{status}</div>
        <div>{error?.message}</div>
        <div>Send Transaction</div>
        <button type="button" onClick={async () => sendTransactionAsync({
          to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
          value: parseEther('0.001'),
        })}>
          Send Transaction
        </button>
        <div>{data && "Transaction sent successfully! 🎉"}</div>
        <div>{data}</div>
 
        <div>Sign Message</div>
        <button
          type="button"
          onClick={() => signMessage({ message: 'Hello World' })}
        >
          Sign Message
        </button>
        <div>{signData}</div>
      </div>
      
      <div>
        <h2>Carbon Offset Zap</h2>
        <button onClick={navigateToCarbonOffsetZap}>Go to Carbon Offset Zap Page</button>
      </div>

    </>
  )
}
 
export default App