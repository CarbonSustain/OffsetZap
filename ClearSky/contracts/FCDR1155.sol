// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FCDR1155
/// @notice Shared ERC-1155 registry for LP-specific FCDR classes.
///         Factory is the sole minter/burner for simplicity and safety.
contract FCDR1155 is ERC1155, Ownable {
    // LP contract => ERC-1155 class id
    mapping(address => uint256) public lpTokenId;
    uint256 public nextId;

    // Metadata for each FCDR token
    struct FCDRMetadata {
        uint256 hbarAmount; // HBAR amount withdrawn
        uint256 timestamp; // Date and time of withdrawal
        address ownerAddress; // Owner wallet address where HBAR was sent
        address poolAddress; // Pool address from which HBAR was withdrawn
        uint256 fcdrId; // Unique FCDR token ID
    }

    // Storage for FCDR metadata
    mapping(uint256 => FCDRMetadata) public fcdrMetadata;
    mapping(address => uint256[]) public ownerFCDRs; // Maps owner address to their FCDR IDs
    uint256 public totalFCDRs;

    event LPRegistered(address indexed lp, uint256 tokenId);
    event FCDRMinted(
        address indexed owner,
        uint256 indexed fcdrId,
        uint256 hbarAmount,
        uint256 timestamp
    );

    constructor(string memory uri_) ERC1155(uri_) Ownable(msg.sender) {}

    /// Register an LP and allocate a tokenId (factory-only)
    function registerLP(address lp) external onlyOwner returns (uint256) {
        require(lp != address(0), "lp 0");
        require(lpTokenId[lp] == 0, "exists");
        nextId++;
        lpTokenId[lp] = nextId;
        emit LPRegistered(lp, nextId);
        return nextId;
    }

    /// Mint to recipient for the given LP's class (factory-only)
    function mintTo(
        address to,
        address lp,
        uint256 amount,
        bytes calldata data
    ) external onlyOwner {
        uint256 id = lpTokenId[lp];
        require(id != 0, "unregistered lp");
        _mint(to, id, amount, data);
    }

    /// Mint FCDR with metadata (factory-only)
    function mintFCDRWithMetadata(
        address to,
        address lp,
        uint256 hbarAmount,
        bytes calldata data
    ) external onlyOwner returns (uint256) {
        uint256 id = lpTokenId[lp];
        require(id != 0, "unregistered lp");

        // Mint 1 FCDR token
        _mint(to, id, 1, data);

        // Store FCDR metadata
        fcdrMetadata[totalFCDRs] = FCDRMetadata({
            hbarAmount: hbarAmount,
            timestamp: block.timestamp,
            ownerAddress: to,
            poolAddress: lp,
            fcdrId: totalFCDRs
        });

        // Track FCDR for owner
        ownerFCDRs[to].push(totalFCDRs);

        emit FCDRMinted(to, totalFCDRs, hbarAmount, block.timestamp);

        uint256 currentFcdrId = totalFCDRs;
        totalFCDRs++;

        return currentFcdrId;
    }

    /// Burn from account for the given LP's class (factory-only)
    function burnFrom(
        address from,
        address lp,
        uint256 amount
    ) external onlyOwner {
        uint256 id = lpTokenId[lp];
        require(id != 0, "unregistered lp");
        _burn(from, id, amount);
    }

    /// Get FCDR metadata
    function getFCDRMetadata(
        uint256 fcdrId
    ) external view returns (FCDRMetadata memory) {
        require(fcdrId < totalFCDRs, "Invalid FCDR ID");
        return fcdrMetadata[fcdrId];
    }

    /// Get owner's FCDR IDs
    function getOwnerFCDRs(
        address owner
    ) external view returns (uint256[] memory) {
        return ownerFCDRs[owner];
    }

    /// Get total FCDR count
    function getTotalFCDRs() external view returns (uint256) {
        return totalFCDRs;
    }

    /// Check if LP is registered
    function isLPRegistered(address lp) external view returns (bool) {
        return lpTokenId[lp] != 0;
    }

    /// Get token ID for LP
    function getLPTokenId(address lp) external view returns (uint256) {
        return lpTokenId[lp];
    }
}
