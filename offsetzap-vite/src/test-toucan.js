/**
 * Test script for Toucan retirement with viem
 */
import { retireToucanUSDC } from './toucan.js';

// Test with a small amount
(async () => {
  try {
    // Try with a small amount of BCT first
    console.log("\n=== Attempting retirement with a small amount of BCT ===");
    const result = await retireToucanUSDC({ 
      amount: "0.1", 
      poolSymbol: "BCT",
      // Use your own private key or from .env
      privateKey: process.env.PRIVATE_KEY || "b5ffa99a5c7bb98702cf2361762604ec4444e44c918bfcb087c12147edbad470"
    });
    console.log("Success!", result);
  } catch (err) {
    console.error("Error in BCT retirement:", err.message);
    
    try {
      // Try NCT as fallback
      console.log("\n=== Trying with NCT instead ===");
      const result = await retireToucanUSDC({ 
        amount: "0.1", 
        poolSymbol: "NCT",
        // Use your own private key or from .env
        privateKey: process.env.PRIVATE_KEY || "b5ffa99a5c7bb98702cf2361762604ec4444e44c918bfcb087c12147edbad470"
      });
      console.log("Success with NCT!", result);
    } catch (fallbackErr) {
      console.error("Fallback also failed:", fallbackErr.message);
    }
  }
})();
