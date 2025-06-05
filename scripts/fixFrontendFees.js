// Add this function to your frontend app.js to estimate LayerZero fees before submitting the transaction

async function estimateLayerZeroFees(provider, baseBridgeAddress, lzEndpointAddress, params) {
  try {
    // Create minimal ABI for LayerZero endpoint
    const lzEndpointAbi = [
      "function estimateFees(uint16 _dstChainId, address _userApplication, bytes calldata _payload, bool _payInZRO, bytes calldata _adapterParams) view returns (uint nativeFee, uint zroFee)"
    ];
    
    // Create minimal ABI for BaseCarbonBridge
    const baseBridgeAbi = [
      "function feeBps() view returns (uint16)"
    ];
    
    // Create contract instances
    const lzEndpoint = new ethers.Contract(lzEndpointAddress, lzEndpointAbi, provider);
    const baseBridge = new ethers.Contract(baseBridgeAddress, baseBridgeAbi, provider);
    
    // Extract parameters
    const { amountWei, destinationChain, carbonType, beneficiary, destinationAddress } = params;
    
    // Create a mock requestId for fee estimation
    const requestId = 1;
    
    // Create payload similar to what the contract will send
    const payload = ethers.utils.defaultAbiCoder.encode(
      ["uint256", "address", "uint256", "string", "address"],
      [
        requestId,
        beneficiary, // user address
        amountWei,   // amount in wei
        carbonType,  // carbon type (e.g., "klima_bct")
        beneficiary  // beneficiary address
      ]
    );
    
    // Create adapter params (version 1, gas limit 200,000)
    const adapterParams = ethers.utils.solidityPack(
      ["uint16", "uint256"],
      [1, 200000]
    );
    
    // Estimate fees
    const [nativeFee, zroFee] = await lzEndpoint.estimateFees(
      destinationChain,
      baseBridgeAddress,
      payload,
      false, // don't pay in ZRO
      adapterParams
    );
    
    // Get protocol fee
    const feeBps = await baseBridge.feeBps();
    const protocolFee = amountWei.mul(feeBps).div(10000);
    
    // Calculate total amount needed
    const totalRequired = ethers.BigNumber.from(amountWei).add(nativeFee);
    
    // Add 20% buffer to the LayerZero fee to account for gas price fluctuations
    const nativeFeeWithBuffer = nativeFee.mul(120).div(100);
    const totalWithBuffer = ethers.BigNumber.from(amountWei).add(nativeFeeWithBuffer);
    
    return {
      layerZeroFee: nativeFee,
      layerZeroFeeWithBuffer: nativeFeeWithBuffer,
      protocolFee: protocolFee,
      netAmount: amountWei.sub(protocolFee),
      totalRequired: totalRequired,
      totalWithBuffer: totalWithBuffer
    };
  } catch (error) {
    console.error("Error estimating LayerZero fees:", error);
    throw error;
  }
}

// Usage in your submitRetirement function:
/*
async function submitRetirement(params) {
  try {
    // Get current network fee data for gas estimation
    const feeData = await provider.getFeeData();
    console.log("Current network fee data:", {
      gasPrice: ethers.utils.formatUnits(feeData.gasPrice, "gwei") + " gwei",
      maxFeePerGas: feeData.maxFeePerGas ? ethers.utils.formatUnits(feeData.maxFeePerGas, "gwei") + " gwei" : "N/A",
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, "gwei") + " gwei" : "N/A"
    });
    
    // Estimate LayerZero fees
    const lzEndpointAddress = "0x6098e96a28E02f27B1e6BD381f870F1C8Bd169d3"; // LayerZero endpoint on Base Sepolia
    const baseBridgeAddress = "0x9316F9B4D24fB53deAca13B3D72CF5c1D151C45b"; // BaseCarbonBridge address
    
    const feeEstimation = await estimateLayerZeroFees(
      provider,
      baseBridgeAddress,
      lzEndpointAddress,
      params
    );
    
    console.log("Fee estimation:", {
      layerZeroFee: ethers.utils.formatEther(feeEstimation.layerZeroFee) + " ETH",
      layerZeroFeeWithBuffer: ethers.utils.formatEther(feeEstimation.layerZeroFeeWithBuffer) + " ETH",
      protocolFee: ethers.utils.formatEther(feeEstimation.protocolFee) + " ETH",
      netAmount: ethers.utils.formatEther(feeEstimation.netAmount) + " ETH",
      totalRequired: ethers.utils.formatEther(feeEstimation.totalRequired) + " ETH",
      totalWithBuffer: ethers.utils.formatEther(feeEstimation.totalWithBuffer) + " ETH"
    });
    
    // Use the total with buffer as the transaction value
    const txValue = feeEstimation.totalWithBuffer;
    
    // Create transaction object with the correct value
    const tx = await contract.initiateRetirement(
      params.useUSDC,
      params.amountWei,
      params.destinationChain,
      params.carbonType,
      params.beneficiary,
      params.destinationAddress,
      {
        value: txValue,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      }
    );
    
    console.log("Transaction sent:", tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);
    
    return receipt;
  } catch (error) {
    console.error("Error submitting retirement:", error);
    throw error;
  }
}
*/
