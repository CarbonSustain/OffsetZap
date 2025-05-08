'use client'
 
import { parseEther } from 'viem'
import { useAccount, useConnect, useDisconnect, useSendTransaction, useSignMessage } from 'wagmi'
 
function App() {
  const account = useAccount()
  const { connectors, connect, status, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { sendTransactionAsync, data } = useSendTransaction()
  const { signMessage, data: signData } = useSignMessage()
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
    </>
  )
}
 
export default App