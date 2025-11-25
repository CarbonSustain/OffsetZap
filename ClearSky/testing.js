const transactionId = "0.0.6671407@1760585540.829331038";
const mirrorTxId = transactionId.replace("@", "-").replace(/\.(?=\d+$)/, "-");

console.log(mirrorTxId);