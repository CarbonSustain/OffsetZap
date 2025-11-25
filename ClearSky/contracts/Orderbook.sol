// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
OrderBook.sol

Features:
- On-chain orders (create/cancel/fill)
- Signed orders (EIP-712) for off-chain orderbook + on-chain settlement
- Pull-proceeds pattern
- Fee (bps) and feeCollector
- Attempts to pay ERC-2981 royalties (falls back to proceeds)
- Atomic settlement: calls seriesVault.transferAndUnwrap(...) in same tx
- ReentrancyGuard, Pausable, Ownable for basic control
*/

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface ISeriesVault {
    /// Atomically transfers bundle underlying assets to `to` and burns the series token (or marks redeemed).
    function transferAndUnwrap(
        uint256 seriesId,
        address from,
        address to
    ) external;

    /// Updates bundle metadata when Series NFT is transferred (e.g., via Orderbook).
    function updateBundleOnTransfer(int64 serial, address newOwner) external;
}

contract OrderBook is Ownable, ReentrancyGuard, Pausable, EIP712 {
    using ECDSA for bytes32;
    using Address for address payable;

    uint256 private _orderIdCounter;

    // Fee in basis points (100 bps = 1%)
    uint16 public feeBps;
    address public feeCollector;

    // The Series NFT contract and the vault contract
    IERC721 public immutable seriesToken;
    ISeriesVault public immutable seriesVault;

    // Proceeds (pull pattern)
    mapping(address => uint256) public proceeds;

    // Orders storage (on-chain orders)
    struct Order {
        uint256 orderId;
        address seller;
        uint256 seriesId;
        uint256 price; // wei
        uint256 expiryTs; // unix timestamp
        bool active;
    }

    mapping(uint256 => Order) public orders;

    // EIP-712 typed order (for signed orders)
    bytes32 private constant ORDER_TYPEHASH =
        keccak256(
            "SignOrder(address seller,uint256 seriesId,uint256 price,uint256 expiry,uint256 nonce)"
        );

    // Nonces for signers (to avoid replay for signed orders)
    mapping(address => uint256) public nonces;

    // Events
    event OrderCreated(
        uint256 indexed orderId,
        address indexed seller,
        uint256 indexed seriesId,
        uint256 price,
        uint256 expiry
    );
    event OrderCancelled(uint256 indexed orderId);
    event OrderFilled(
        uint256 indexed orderId,
        address indexed buyer,
        uint256 price
    );
    event ProceedsWithdrawn(address indexed who, uint256 amount);
    event FeeParamsUpdated(address indexed collector, uint16 bps);

    constructor(
        address _seriesToken,
        address _seriesVault,
        address _feeCollector,
        uint16 _feeBps
    ) Ownable(msg.sender) EIP712("OrderBook", "1") {
        require(
            _seriesToken != address(0) && _seriesVault != address(0),
            "zero address"
        );
        seriesToken = IERC721(_seriesToken);
        seriesVault = ISeriesVault(_seriesVault);
        feeCollector = _feeCollector;
        feeBps = _feeBps;
        _orderIdCounter = 1; // start ids at 1
    }

    // ---------- Admin ----------
    function setFeeParams(address _collector, uint16 _bps) external onlyOwner {
        require(_collector != address(0), "zero fee collector");
        require(_bps <= 10000, "bps>10000");
        feeCollector = _collector;
        feeBps = _bps;
        emit FeeParamsUpdated(_collector, _bps);
    }

    function pause() external onlyOwner {
        _pause();
    }
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------- On-chain order lifecycle ----------
    function createOrder(
        uint256 seriesId,
        uint256 price,
        uint256 expiryTs
    ) external whenNotPaused returns (uint256) {
        // seller must be the current owner
        address seller = msg.sender;
        require(seriesToken.ownerOf(seriesId) == seller, "not owner");
        require(price > 0, "price=0");

        uint256 id = _orderIdCounter;
        _orderIdCounter++;

        orders[id] = Order({
            orderId: id,
            seller: seller,
            seriesId: seriesId,
            price: price,
            expiryTs: expiryTs,
            active: true
        });

        emit OrderCreated(id, seller, seriesId, price, expiryTs);
        return id;
    }

    function cancelOrder(uint256 orderId) external whenNotPaused {
        Order storage o = orders[orderId];
        require(o.active, "inactive");
        require(
            o.seller == msg.sender || msg.sender == owner(),
            "not seller/admin"
        );
        o.active = false;
        emit OrderCancelled(orderId);
    }

    // Buyer pays native currency here (HBAR) and receives the Series NFT
    function fillOrder(
        uint256 orderId
    ) external payable nonReentrant whenNotPaused {
        Order storage o = orders[orderId];
        require(o.active == true, "inactive"); // Order must be active (true)
        require(block.timestamp <= o.expiryTs || o.expiryTs == 0, "expired");
        require(msg.value == o.price, "wrong payment");

        address seller = o.seller;
        uint256 seriesId = o.seriesId;
        // Re-validate seller still owner (prevent stale listings)
        require(seriesToken.ownerOf(seriesId) == seller, "seller not owner");

        // Mark inactive early (checks-effects-interactions)
        o.active = false;

        // Send HBAR payment directly to seller (no fees or royalties for now)
        payable(seller).transfer(o.price);

        // Transfer Series NFT from seller to buyer using allowance
        // Seller has already approved this contract to transfer the NFT
        seriesToken.transferFrom(seller, msg.sender, seriesId);

        // Update bundle metadata in SeriesVault: set userAddress to buyer and onMarket to false
        // Convert uint256 seriesId to int64 serial
        seriesVault.updateBundleOnTransfer(int64(int256(seriesId)), msg.sender);

        emit OrderFilled(orderId, msg.sender, o.price);
    }

    // ---------- Internal helper for fee/royalty calculation ----------
    function _calculateAndCreditProceeds(
        uint256 price,
        uint256 seriesId,
        address seller
    ) internal {
        uint256 fee = (price * feeBps) / 10000;
        uint256 remaining = price - fee;

        // TODO: Royalty implementation - disabled for now
        // uint256 royaltyAmount = 0;
        // address royaltyReceiver = address(0);
        // try
        //     IERC2981(address(seriesToken)).royaltyInfo(seriesId, price)
        // returns (address receiver, uint256 amount) {
        //     if (receiver != address(0) && amount > 0) {
        //         royaltyReceiver = receiver;
        //         royaltyAmount = amount;
        //         if (royaltyAmount > remaining) royaltyAmount = remaining;
        //         remaining -= royaltyAmount;
        //     }
        // } catch {}

        if (fee > 0) {
            proceeds[feeCollector] += fee;
        }

        // TODO: Royalty payment - disabled for now
        // if (royaltyAmount > 0) {
        //     (bool ok, ) = payable(royaltyReceiver).call{value: royaltyAmount}(
        //         ""
        //     );
        //     if (!ok) proceeds[royaltyReceiver] += royaltyAmount;
        // }

        proceeds[seller] += remaining;
    }

    // ---------- Signed order fill (EIP-712) ----------
    // Allows off-chain orderbook: seller signs an order, buyer calls fillSignedOrder with signature and pays.
    function fillSignedOrder(
        address seller,
        uint256 seriesId,
        uint256 price,
        uint256 expiryTs,
        uint256 signerNonce,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        require(msg.value == price, "wrong payment");
        // verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                ORDER_TYPEHASH,
                seller,
                seriesId,
                price,
                expiryTs,
                signerNonce
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, signature);
        require(recovered == seller, "invalid signature");

        // nonce must match
        require(signerNonce == nonces[seller], "bad nonce");
        // increment nonce to prevent replay
        nonces[seller] = nonces[seller] + 1;

        // Validate conditions and settlement logic (mirrors fillOrder)
        require(block.timestamp <= expiryTs || expiryTs == 0, "expired");
        require(seriesToken.ownerOf(seriesId) == seller, "seller not owner");

        // Calculate and credit proceeds (fee/royalty logic)
        _calculateAndCreditProceeds(price, seriesId, seller);

        // Finally call the vault to transfer underlying assets to buyer and burn NFT
        seriesVault.transferAndUnwrap(seriesId, seller, msg.sender);

        // emit a synthetic order id 0 for signed orders (or you can generate one)
        emit OrderFilled(0, msg.sender, price);
    }

    // ---------- Proceeds withdrawal ----------
    function withdrawProceeds() external nonReentrant {
        uint256 amount = proceeds[msg.sender];
        require(amount > 0, "no proceeds");
        proceeds[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "withdraw failed");
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    // ---------- Views ----------
    function getOrder(uint256 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    // Fallback / receive should not accept funds except via fillOrder; but allow in case someone sends mistakenly
    receive() external payable {
        proceeds[owner()] += msg.value;
    }
    fallback() external payable {
        proceeds[owner()] += msg.value;
    }
}
