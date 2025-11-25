Notes / integration tips

User as caller: The depositAndMint path uses transferToken(token, from, to, amount) with from = msg.sender. On Hedera, that will succeed because the outer transaction is signed by the user. (No separate allowance step needed.)

Amounts → int64: HTS precompile takes int64. Enforce a safe max (e.g., 9e18 won’t fit) at your UI/service layer or add checks in-contract.

Associations: The vault lazily associates the incoming CSLP token IDs. Your UI can also expose a preflight “Associate All” if you prefer.

Series NFT metadata: you can encode an IPFS/Arweave JSON pointing to bundle previews. The on-chain mapping is still the canonical source.

Decimals: CSLP tokens have decimals=6 in your script. The vault just moves raw amounts; your UI should format accordingly.

Owner-only associate: I set associateTokens() owner-gated to avoid griefing the vault with massive token lists. The lazy association inside depositAndMint covers normal use.