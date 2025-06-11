// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VotingStorage
 * @dev A contract for storing votes for various campaigns on Hedera
 */
contract VotingStorage {
    // Struct to represent a vote
    struct Vote {
        string campaignId;      // Unique identifier for the campaign
        uint8 voteOption;      // The vote: 1 = in favor, 0 = against
        string email;          // Optional email of the voter (empty string if not provided)
        address voterAddress;  // Optional address of the voter (address(0) if not provided)
        string additionalData; // Optional JSON string for any additional data (empty string if not provided)
    }

    // Mapping from campaignId to array of votes
    mapping(string => Vote[]) private campaignVotes;
    
    // Array to keep track of all campaign IDs
    string[] private campaignIds;
    
    // Mapping to check if a campaign exists
    mapping(string => bool) private campaignExists;
    
    // Events
    event VoteCast(string indexed campaignId, address indexed voter, uint8 voteOption);
    event CampaignCreated(string indexed campaignId);

    /**
     * @dev Cast a vote for a specific campaign
     * @param _campaignId Unique identifier for the campaign
     * @param _voteOption The vote option (1 = in favor, 0 = against)
     * @param _email Optional email of the voter (can be empty string)
     * @param _voterAddress Optional address of the voter (can be address(0))
     * @param _additionalData Optional additional data in JSON format (can be empty string)
     */
    function castVote(
        string memory _campaignId,
        uint8 _voteOption,
        string memory _email,
        address _voterAddress,
        string memory _additionalData
    ) public {
        // Validate vote option (must be 0 or 1)
        require(_voteOption <= 1, "Vote option must be 0 or 1");
        
        // Use msg.sender if no voter address provided
        address voter = _voterAddress == address(0) ? msg.sender : _voterAddress;
        
        // Create a new vote
        Vote memory newVote = Vote({
            campaignId: _campaignId,
            voteOption: _voteOption,
            email: _email,
            voterAddress: voter,
            additionalData: _additionalData
        });
        
        // Add the vote to the campaign
        campaignVotes[_campaignId].push(newVote);
        
        // If this is a new campaign, add it to the list of campaigns
        if (!campaignExists[_campaignId]) {
            campaignIds.push(_campaignId);
            campaignExists[_campaignId] = true;
            emit CampaignCreated(_campaignId);
        }
        
        // Emit an event for the vote
        emit VoteCast(_campaignId, msg.sender, _voteOption);
    }

    /**
     * @dev Get all campaign IDs
     * @return Array of campaign IDs
     */
    function getAllCampaignIds() public view returns (string[] memory) {
        return campaignIds;
    }

    /**
     * @dev Get the number of votes for a specific campaign
     * @param _campaignId The campaign ID to query
     * @return The number of votes for the campaign
     */
    function getVoteCount(string memory _campaignId) public view returns (uint256) {
        return campaignVotes[_campaignId].length;
    }

    /**
     * @dev Get votes for a specific campaign with pagination
     * @param _campaignId The campaign ID to query
     * @param _offset Starting index for pagination
     * @param _limit Maximum number of votes to return
     * @return voteOptions Array of vote options (1 = in favor, 0 = against)
     * @return voters Array of voter addresses (may contain address(0) if not provided)
     * @return emails Array of voter emails (empty strings for those not provided)
     * @return additionalData Array of additional data (empty strings for those not provided)
     */
    function getVotesForCampaign(
        string memory _campaignId,
        uint256 _offset,
        uint256 _limit
    ) public view returns (
        uint8[] memory voteOptions,
        address[] memory voters,
        string[] memory emails,
        string[] memory additionalData
    ) {
        // Get the total number of votes for this campaign
        uint256 totalVotes = campaignVotes[_campaignId].length;
        
        // Validate offset
        if (_offset >= totalVotes) {
            // Return empty arrays if offset is out of bounds
            voteOptions = new uint8[](0);
            voters = new address[](0);
            emails = new string[](0);
            additionalData = new string[](0);
            return (voteOptions, voters, emails, additionalData);
        }
        
        // Calculate how many items to return
        uint256 itemsToReturn = _limit;
        if (_offset + _limit > totalVotes) {
            itemsToReturn = totalVotes - _offset;
        }
        
        // Initialize return arrays
        voteOptions = new uint8[](itemsToReturn);
        voters = new address[](itemsToReturn);
        emails = new string[](itemsToReturn);
        additionalData = new string[](itemsToReturn);
        
        // Populate return arrays
        for (uint256 i = 0; i < itemsToReturn; i++) {
            Vote memory vote = campaignVotes[_campaignId][_offset + i];
            voteOptions[i] = vote.voteOption;
            voters[i] = vote.voterAddress;
            emails[i] = vote.email;
            additionalData[i] = vote.additionalData;
        }
        
        return (voteOptions, voters, emails, additionalData);
    }

    /*
     * @dev Get campaign summary with vote counts
     * @return Campaign IDs and their vote counts
     */
    function getCampaignSummary() public view returns (
        string[] memory ids,
        uint256[] memory voteCounts
    ) {
        uint256 numCampaigns = campaignIds.length;
        
        ids = new string[](numCampaigns);
        voteCounts = new uint256[](numCampaigns);
        
        for (uint256 i = 0; i < numCampaigns; i++) {
            string memory campaignId = campaignIds[i];
            ids[i] = campaignId;
            voteCounts[i] = campaignVotes[campaignId].length;
        }
        
        return (ids, voteCounts);
    }

    /**
     * @dev Get vote counts for a specific campaign
     * @param _campaignId The campaign ID to check
     * @return inFavor Number of votes in favor (1)
     * @return against Number of votes against (0)
     */
    function getVoteCounts(string memory _campaignId) public view returns (uint256 inFavor, uint256 against) {
        Vote[] memory votes = campaignVotes[_campaignId];
        for (uint256 i = 0; i < votes.length; i++) {
            if (votes[i].voteOption == 1) {
                inFavor++;
            } else {
                against++;
            }
        }
        return (inFavor, against);
    }
}
