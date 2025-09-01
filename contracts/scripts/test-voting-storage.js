// Script to test the deployed VotingStorage contract
const { ethers } = require("hardhat");
const { ZeroAddress } = ethers;
const fs = require("fs");
const path = require("path");

// Import the deployment information
const deploymentPath = path.join(__dirname, "VotingStorageDeployment.json");
const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));

async function main() {
  console.log("Testing VotingStorage contract at:", deploymentData.address);
  
  // Get signer for transactions
  const [owner] = await ethers.getSigners();

  // const privateKey = process.env.PRIVATE_KEY;
  // const owner = new ethers.Wallet(privateKey, ethers.provider);
  
  // Create contract instance
  const votingStorage = new ethers.Contract(
    deploymentData.address,
    deploymentData.abi,
    owner
  );
  
  // Define test campaigns
  const campaigns = [
    {
      id: "climate-action-2025",
      description: "Support for increased climate action funding in 2025"
    },
    {
      id: "renewable-energy-initiative",
      description: "Transition to 100% renewable energy sources by 2030"
    },
    {
      id: "carbon-offset-program",
      description: "Implementation of mandatory carbon offset program for businesses"
    }
  ];
  
  // Define test votes
  const votes = [
    {
      campaignId: "climate-action-2025",
      voteOption: 1, // in favor
      email: "alice@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 28, location: "New York", reason: "Environmental concerns" }), //optional
      signer: owner
    },
    {
      campaignId: "climate-action-2025",
      voteOption: 1, // in favor
      email: "bob@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 35, location: "California", reason: "Future generations" }), //optional
      signer: owner
    },
    {
      campaignId: "climate-action-2025",
      voteOption: 0, // against
      email: "charlie@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 42, location: "Texas", reason: "Economic concerns" }), //optional
      signer: owner
    },
    {
      campaignId: "renewable-energy-initiative",
      voteOption: 1, // in favor
      email: "diana@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 31, location: "Washington", reason: "Sustainability" }), //optional
      signer: owner
    },
    {
      campaignId: "renewable-energy-initiative",
      voteOption: 0, // against
      email: "edward@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 45, location: "Florida", reason: "Implementation costs" }), //optional
      signer: owner
    },
    {
      campaignId: "carbon-offset-program",
      voteOption: 1, // in favor
      email: "fiona@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 29, location: "Oregon", reason: "Corporate responsibility" }), //optional
      signer: owner
    },
    {
      campaignId: "carbon-offset-program",
      voteOption: 1, // in favor
      email: "george@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 33, location: "Colorado", reason: "Climate impact" }), //optional
      signer: owner
    },
    {
      campaignId: "carbon-offset-program",
      voteOption: 0, // against
      email: "hannah@example.com", //optional
      voterAddress: ZeroAddress, // use sender's address optional
      additionalData: JSON.stringify({ age: 38, location: "Michigan", reason: "Small business impact" }), //optional
      signer: owner
    }
  ];
  
  // Cast votes
  console.log("\n--- Casting Votes ---");
  for (const vote of votes) {
    try {
      console.log(`Casting vote for campaign "${vote.campaignId}" from ${vote.email}...`);
      
      const tx = await votingStorage.castVote(
        vote.campaignId,
        vote.voteOption,
        vote.email,
        vote.voterAddress,
        vote.additionalData
      );
      
      await tx.wait();
      console.log(`Vote cast successfully! TX: ${tx.hash}`);
    } catch (error) {
      console.error(`Error casting vote: ${error.message}`);
    }
  }
  
  // Get all campaign IDs
  console.log("\n--- Retrieving Campaign Data ---");
  const campaignIds = await votingStorage.getAllCampaignIds();
  console.log(`Found ${campaignIds.length} campaigns: ${campaignIds.join(", ")}`);
  
  // Get campaign summary
  const [ids, voteCounts] = await votingStorage.getCampaignSummary();
  
  // Display results in a table
  console.log("\n--- Campaign Vote Summary ---");
  console.log("┌─────────────────────────────────┬───────────────┬───────────┬───────────┐");
  console.log("│ Campaign ID                     │ Total Votes   │ In Favor  │ Against   │");
  console.log("├─────────────────────────────────┼───────────────┼───────────┼───────────┤");
  
  for (let i = 0; i < ids.length; i++) {
    const campaignId = ids[i];
    const totalVotes = voteCounts[i].toString();
    
    // Get detailed vote counts
    const [inFavor, against] = await votingStorage.getVoteCounts(campaignId);
    
    console.log(`│ ${campaignId.padEnd(31)} │ ${totalVotes.padEnd(13)} │ ${inFavor.toString().padEnd(9)} │ ${against.toString().padEnd(9)} │`);
  }
  
  console.log("└─────────────────────────────────┴───────────────┴───────────┴───────────┘");
  
  // Get detailed votes for each campaign
  for (const campaignId of campaignIds) {
    console.log(`\n--- Detailed Votes for "${campaignId}" ---`);
    
    // Get votes with pagination (up to 10 votes)
    const votes = await votingStorage.getVotesForCampaign(campaignId, 0, 10);
    
    console.log("┌───────────────────┬──────────┬─────────────────────────────────────────┐");
    console.log("│ Email             │ Vote     │ Additional Data                         │");
    console.log("├───────────────────┼──────────┼─────────────────────────────────────────┤");
    
    for (let i = 0; i < votes.voteOptions.length; i++) {
      const email = votes.emails[i];
      const voteOption = parseInt(votes.voteOptions[i]) === 1 ? "In Favor" : "Against";
      
      // Parse and extract reason from additional data
      let reason = "";
      try {
        const additionalData = JSON.parse(votes.additionalData[i]);
        reason = additionalData.reason || "";
      } catch (e) {
        reason = votes.additionalData[i];
      }
      
      console.log(`│ ${email.padEnd(17)} │ ${voteOption.padEnd(8)} │ ${reason.padEnd(39)} │`);
    }
    
    console.log("└───────────────────┴──────────┴─────────────────────────────────────────┘");
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


  //run with this command; npx hardhat run contracts/scripts/test-voting-storage.js --network hederaTestnet