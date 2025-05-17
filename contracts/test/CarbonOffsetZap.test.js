const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CarbonOffsetZap", function () {
  let zap;
  let owner;
  let bridge;

  beforeEach(async function () {
    [owner, bridge, other] = await ethers.getSigners();

    const MockBridge = await ethers.getContractFactory("BasePolygonBridge");
    const mockBridge = await BasePolygonBridge.deploy();
    await mockBridge.deployed();

    const Zap = await ethers.getContractFactory("CarbonOffsetZap");
    zap = await Zap.deploy(mockBridge.address);
    await zap.deployed();
  });

  it("should emit data via bridge", async function () {
    const amount = ethers.utils.parseEther("1");
    const beneficiary = "beneficiary-address";

    await expect(zap.purchaseCarbonCredits(beneficiary, amount, { value: amount })).to.emit(zap, "PurchaseInitiated");
  });
});
