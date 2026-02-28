import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("Mini Uniswap Integration Test", function () {
  let factory: any,
    router: any,
    tokenA: any,
    tokenB: any,
    weth: any,
    owner: any,
    addr1: any,
    addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("TestToken");

    tokenA = await Token.deploy(
      "TokenA",
      "TKA",
      ethers.parseEther("1000000")
    );
    await tokenA.waitForDeployment();

    tokenB = await Token.deploy(
      "TokenB",
      "TKB",
      ethers.parseEther("1000000")
    );
    await tokenB.waitForDeployment();

    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    const WETH = await ethers.getContractFactory("WETH9");
    weth = await WETH.deploy();
    await weth.waitForDeployment();

    const Router = await ethers.getContractFactory("UniswapV2Router");
    router = await Router.deploy(factory.target, weth.target);
    await router.waitForDeployment();

    // Transfer tokens to addr1 for testing
    await tokenA.transfer(addr1.address, ethers.parseEther("100000"));
    await tokenB.transfer(addr1.address, ethers.parseEther("100000")); 
  });

  describe("Factory", function () {
    it("Should create a pair", async function () {
      const tx = await factory.createPair(tokenA.target, tokenB.target);
      await tx.wait();

      const pairAddress = await factory.getPair(tokenA.target, tokenB.target);
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should return same pair for both token orders", async function () {
      await factory.createPair(tokenA.target, tokenB.target);

      const pair1 = await factory.getPair(tokenA.target, tokenB.target);
      const pair2 = await factory.getPair(tokenB.target, tokenA.target);

      expect(pair1).to.equal(pair2);
    });

    it("Should reject creating duplicate pair", async function () {
      await factory.createPair(tokenA.target, tokenB.target);

      await expect(
        factory.createPair(tokenA.target, tokenB.target)
      ).to.be.revertedWith("Pair Exists");
    });

    it("Should reject pair with identical tokens", async function () {
      await expect(
        factory.createPair(tokenA.target, tokenA.target)
      ).to.be.revertedWith("Identical tokens");
    });

    it("Should reject pair with zero address", async function () {
      await expect(
        factory.createPair(ethers.ZeroAddress, tokenB.target)
      ).to.be.revertedWith("Zero Address");
    });

    it("Should track all pairs", async function () {
      await factory.createPair(tokenA.target, tokenB.target);
      expect(await factory.allPairsLength()).to.equal(1);

      // Deploy another token for a second pair
      const Token = await ethers.getContractFactory("TestToken");
      const tokenC = await Token.deploy(
        "TokenC",
        "TKC",
        ethers.parseEther("1000000")
      );
      await tokenC.waitForDeployment();

      await factory.createPair(tokenA.target, tokenC.target);
      expect(await factory.allPairsLength()).to.equal(2);
    });
  });

  describe("Liquidity", function () {
    let pairAddress: string;

    beforeEach(async function () {
      await factory.createPair(tokenA.target, tokenB.target);
      pairAddress = await factory.getPair(tokenA.target, tokenB.target);

      // Approve tokens for owner
      await tokenA.approve(router.target, ethers.parseEther("10000"));
      await tokenB.approve(router.target, ethers.parseEther("10000"));
    });

    it("Should add liquidity successfully", async function () {
      const amount = ethers.parseEther("100");

      const tx = await router.addLiquidity(
        tokenA.target,
        tokenB.target,
        amount,
        amount,
        owner.address
      );
      await tx.wait();

      const Pair = await ethers.getContractFactory("UniswapV2Pair");
      const pair = Pair.attach(pairAddress);

      const reserves = await pair.getReserves();
      expect(reserves[0]).to.equal(amount);
      expect(reserves[1]).to.equal(amount);
    });

    it("Should mint LP tokens to provider", async function () {
      const amount = ethers.parseEther("100");

      const Pair = await ethers.getContractFactory("UniswapV2Pair");
      const pair = Pair.attach(pairAddress);

      await router.addLiquidity(
        tokenA.target,
        tokenB.target,
        amount,
        amount,
        owner.address
      );

      const lpBalance = await pair.balanceOf(owner.address);
      expect(lpBalance).to.be.gt(0);
    });

    it("Should update reserves correctly", async function () {
      const Pair = await ethers.getContractFactory("UniswapV2Pair");
      const pair = Pair.attach(pairAddress);

      // First liquidity provision
      await router.addLiquidity(
        tokenA.target,
        tokenB.target,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        owner.address
      );

      const reserves1 = await pair.getReserves();
      expect(reserves1[0]).to.equal(ethers.parseEther("100"));

      // Second liquidity provision
      await router.addLiquidity(
        tokenA.target,
        tokenB.target,
        ethers.parseEther("50"),
        ethers.parseEther("50"),
        owner.address
      );

      const reserves2 = await pair.getReserves();
      expect(reserves2[0]).to.equal(ethers.parseEther("150"));
      expect(reserves2[1]).to.equal(ethers.parseEther("150"));
    });

    it("Should remove liquidity successfully", async function () {
      const Pair = await ethers.getContractFactory("UniswapV2Pair");
      const pair = Pair.attach(pairAddress);

      // Add liquidity
      await router.addLiquidity(
        tokenA.target,
        tokenB.target,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        owner.address
      );

      const lpBalance = await pair.balanceOf(owner.address);
      const initialBalanceA = await tokenA.balanceOf(owner.address);

      // Transfer LP tokens to router and call burn
      await pair.transfer(router.target, lpBalance);
      
      await router.removeLiquidity(
        tokenA.target,
        tokenB.target,
        owner.address
      );

      const finalBalanceA = await tokenA.balanceOf(owner.address);
      expect(finalBalanceA).to.be.gt(initialBalanceA);
    });

    it("Should revert when adding liquidity to non-existent pair", async function () {
      const Token = await ethers.getContractFactory("TestToken");
      const tokenC = await Token.deploy(
        "TokenC",
        "TKC",
        ethers.parseEther("1000000")
      );
      await tokenC.waitForDeployment();

      await expect(
        router.addLiquidity(
          tokenA.target,
          tokenC.target,
          ethers.parseEther("100"),
          ethers.parseEther("100"),
          owner.address
        )
      ).to.be.revertedWith("Pair not exist");
    });
  });

  describe("Swaps", function () {
    let pairAddress: string;

    beforeEach(async function () {
      await factory.createPair(tokenA.target, tokenB.target);
      pairAddress = await factory.getPair(tokenA.target, tokenB.target);

      // Add initial liquidity (100:100)
      await tokenA.approve(router.target, ethers.parseEther("10000"));
      await tokenB.approve(router.target, ethers.parseEther("10000"));

      await router.addLiquidity(
        tokenA.target,
        tokenB.target,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        owner.address
      );
    });

    it("Should swap tokens successfully", async function () {
      const swapAmount = ethers.parseEther("10");
      const initialBalanceB = await tokenB.balanceOf(owner.address);

      // Approve router for swap
      await tokenA.approve(router.target, swapAmount);

      const tx = await router.swapExactTokensForTokens(
        swapAmount,
        0,
        [tokenA.target, tokenB.target],
        owner.address
      );
      await tx.wait();

      const finalBalanceB = await tokenB.balanceOf(owner.address);
      expect(finalBalanceB).to.be.gt(initialBalanceB);
    });

    it("Should calculate correct output amount", async function () {
      const Pair = await ethers.getContractFactory("UniswapV2Pair");
      const pair = Pair.attach(pairAddress);

      const swapAmount = ethers.parseEther("10");
      const initialBalanceB = await tokenB.balanceOf(owner.address);

      // Get reserves from the pair (tokens are sorted)
      const reserves = await pair.getReserves();
      
      // Determine which reserves to use based on token ordering
      const reserveIn = tokenA.target < tokenB.target ? reserves[0] : reserves[1];
      const reserveOut = tokenA.target < tokenB.target ? reserves[1] : reserves[0];

      // Get expected output using the formula
      const expectedOutput = await router.getAmountOut(
        swapAmount,
        reserveIn,
        reserveOut
      );

      await tokenA.approve(router.target, swapAmount);
      await router.swapExactTokensForTokens(
        swapAmount,
        0,
        [tokenA.target, tokenB.target],
        owner.address
      );

      const finalBalanceB = await tokenB.balanceOf(owner.address);
      const actualOutput = finalBalanceB - initialBalanceB;

      expect(actualOutput).to.equal(expectedOutput);
    });

    it("Should revert on insufficient output amount", async function () {
      const swapAmount = ethers.parseEther("10");

      await tokenA.approve(router.target, swapAmount);

      // Require output of 100 tokens, but swap should give much less
      await expect(
        router.swapExactTokensForTokens(
          swapAmount,
          ethers.parseEther("100"),
          [tokenA.target, tokenB.target],
          owner.address
        )
      ).to.be.revertedWith("Insufficient output");
    });

    it("Should maintain constant product formula (K)", async function () {
      const Pair = await ethers.getContractFactory("UniswapV2Pair");
      const pair = Pair.attach(pairAddress);

      const reserves1 = await pair.getReserves();
      const k1 = reserves1[0] * reserves1[1];

      const swapAmount = ethers.parseEther("10");
      await tokenA.approve(router.target, swapAmount);
      await router.swapExactTokensForTokens(
        swapAmount,
        0,
        [tokenA.target, tokenB.target],
        owner.address
      );

      const reserves2 = await pair.getReserves();
      const k2 = reserves2[0] * reserves2[1];

      // k2 should be >= k1 due to fee
      expect(k2).to.be.gte(k1);
    });

    it("Should swap with addr1 when using approved tokens", async function () {
      await tokenA.connect(addr1).approve(router.target, ethers.parseEther("10"));

      const initialBalanceB = await tokenB.balanceOf(addr1.address);

      await router
        .connect(addr1)
        .swapExactTokensForTokens(
          ethers.parseEther("10"),
          0,
          [tokenA.target, tokenB.target],
          addr1.address
        );

      const finalBalanceB = await tokenB.balanceOf(addr1.address);
      expect(finalBalanceB).to.be.gt(initialBalanceB);
    });

    it("Should revert when swapping with non-existent pair", async function () {
      const Token = await ethers.getContractFactory("TestToken");
      const tokenC = await Token.deploy(
        "TokenC",
        "TKC",
        ethers.parseEther("1000000")
      );
      await tokenC.waitForDeployment();

      await tokenA.approve(router.target, ethers.parseEther("10"));

      await expect(
        router.swapExactTokensForTokens(
          ethers.parseEther("10"),
          0,
          [tokenA.target, tokenC.target],
          owner.address
        )
      ).to.be.revertedWith("Pair not exist");
    });

    it("Should revert on multi-hop swaps", async function () {
      await tokenA.approve(router.target, ethers.parseEther("10"));

      await expect(
        router.swapExactTokensForTokens(
          ethers.parseEther("10"),
          0,
          [tokenA.target, tokenB.target, weth.target],
          owner.address
        )
      ).to.be.revertedWith("Single hop only");
    });
  });

  describe("ETH Swaps", function () {
    let pairAddress: string;

    beforeEach(async function () {
      // Create WETH -> TokenA pair
      await factory.createPair(weth.target, tokenA.target);
      pairAddress = await factory.getPair(weth.target, tokenA.target);

      // Add initial liquidity
      await tokenA.approve(router.target, ethers.parseEther("10000"));
      await weth.approve(router.target, ethers.parseEther("10000"));

      // Wrap ETH
      await weth.deposit({ value: ethers.parseEther("100") });

      await router.addLiquidity(
        weth.target,
        tokenA.target,
        ethers.parseEther("100"),
        ethers.parseEther("100"),
        owner.address
      );
    });

    it("Should swap ETH for TokenA", async function () {
      const ethAmount = ethers.parseEther("10");
      // Get balance before swap (should be 0 since owner hasn't received any TokenA)
      const balanceBeforeSwap = await tokenA.balanceOf(owner.address);

      await router.swapExactETHForTokens(
        0,
        [weth.target, tokenA.target],
        owner.address,
        { value: ethAmount }
      );

      const balanceAfterSwap = await tokenA.balanceOf(owner.address);
      // Should have received some TokenA from the swap
      expect(balanceAfterSwap).to.be.gt(balanceBeforeSwap);
    });

    it("Should revert on swap ETH without WETH in path", async function () {
      const ethAmount = ethers.parseEther("10");

      await expect(
        router.swapExactETHForTokens(
          0,
          [tokenA.target, tokenB.target],
          owner.address,
          { value: ethAmount }
        )
      ).to.be.revertedWith("Path must start with WETH");
    });

    it("Should swap TokenA for ETH", async function () {
      const Pair = await ethers.getContractFactory("UniswapV2Pair");
      const pairWethTokenA = Pair.attach(pairAddress);

      // Get reserves (tokens are sorted)
      const reserves = await pairWethTokenA.getReserves();
      const isWethFirst = weth.target < tokenA.target;
      const reserveWeth = isWethFirst ? reserves[0] : reserves[1];
      const reserveTokenA = isWethFirst ? reserves[1] : reserves[0];
      const desiredEthOut = ethers.parseEther("2");

      const requiredInput = await router.getAmountIn(
        desiredEthOut,
        reserveTokenA,
        reserveWeth
      );

      const initialBalanceETH = await ethers.provider.getBalance(owner.address);

      await tokenA.approve(router.target, requiredInput);

      const tx = await router.swapTokensForExactETH(
        desiredEthOut,
        requiredInput,
        [tokenA.target, weth.target],
        owner.address
      );
      const receipt = await tx.wait();
      const gasUsed = (BigInt(receipt?.gasUsed) || BigInt(0)) * (receipt?.gasPrice || BigInt(0));

      const finalBalanceETH = await ethers.provider.getBalance(owner.address);
      // ETH balance should increase (after accounting for gas)
      expect(finalBalanceETH).to.be.gte(initialBalanceETH - gasUsed);
    });

    it("Should revert on swap for ETH without WETH in path", async function () {
      await tokenA.approve(router.target, ethers.parseEther("10"));

      await expect(
        router.swapTokensForExactETH(
          ethers.parseEther("5"),
          ethers.parseEther("10"),
          [tokenA.target, tokenB.target],
          owner.address
        )
      ).to.be.revertedWith("Path must end with WETH");
    });
  });

  describe("Math Utilities", function () {
    it("Should calculate correct amount out", async function () {
      const amountIn = ethers.parseEther("10");
      const reserveIn = ethers.parseEther("100");
      const reserveOut = ethers.parseEther("100");

      // Formula: (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
      const expectedOutput = await router.getAmountOut(
        amountIn,
        reserveIn,
        reserveOut
      );

      expect(expectedOutput).to.be.gt(0);
      expect(expectedOutput).to.be.lt(amountIn); // Output should be less due to fee
    });

    it("Should calculate correct amount in", async function () {
      const amountOut = ethers.parseEther("9");
      const reserveIn = ethers.parseEther("100");
      const reserveOut = ethers.parseEther("100");

      const requiredInput = await router.getAmountIn(
        amountOut,
        reserveIn,
        reserveOut
      );

      expect(requiredInput).to.be.gt(amountOut); // Input should be more than output
    });

    it("Should be inverse operations", async function () {
      const amountIn = ethers.parseEther("10");
      const reserveIn = ethers.parseEther("100");
      const reserveOut = ethers.parseEther("100");

      const amountOut = await router.getAmountOut(
        amountIn,
        reserveIn,
        reserveOut
      );

      const amountInRecovered = await router.getAmountIn(
        amountOut,
        reserveIn,
        reserveOut
      );

      // Should be very close (within 1 wei due to rounding)
      expect(amountInRecovered).to.be.lte(amountIn + BigInt(1));
    });

    it("Should revert on zero amount in", async function () {
      const reserveIn = ethers.parseEther("100");
      const reserveOut = ethers.parseEther("100");

      await expect(
        router.getAmountOut(0, reserveIn, reserveOut)
      ).to.be.revertedWith("Amount in zero");
    });

    it("Should revert on zero reserves", async function () {
      const amountIn = ethers.parseEther("10");

      await expect(
        router.getAmountOut(amountIn, 0, ethers.parseEther("100"))
      ).to.be.revertedWith("Insufficient liquidity");
    });
  });
});