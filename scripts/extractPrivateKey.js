// scripts/extractPrivateKey.js
require("dotenv").config();
const { Mnemonic } = require("ethers");
const { HDNodeWallet } = require("ethers/wallet");

const mnemonic = process.env.MNEMONIC;

if (!mnemonic || mnemonic.split(" ").length < 12) {
  console.error("❌ MNEMONIC environment variable is missing or invalid");
  process.exit(1);
}

try {
  const phrase = Mnemonic.fromPhrase(mnemonic);
  const wallet = HDNodeWallet.fromMnemonic(phrase);

  console.log("✅ Wallet Address:", wallet.address);
  console.log("🔑 Private Key:", wallet.privateKey);
} catch (err) {
  console.error("❌ Error extracting private key:", err.message);
  process.exit(1);
}
