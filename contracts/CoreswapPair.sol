// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CoreswapERC20.sol";
import "./libraries/Math.sol";
import "./libraries/UQ112x112.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract UniswapV2Pair is UniswapV2ERC20, ReentrancyGuard {
    address public token0;
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public constant FEE_RATE = 3; // 0.3% fee
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(
        address indexed sender,
        uint256 amount0,
        uint256 amount1,
        address indexed to
    );
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    constructor(
        address _token0,
        address _token1
    ) UniswapV2ERC20("LP Token", "LP") {
        require(_token0 != _token1, "Identical tokens");
        require(_token0 != address(0) && _token1 != address(0), "Zero Address");
        token0 = _token0;
        token1 = _token1;
    }

    function getReserves()
        public
        view
        returns (
            uint112 _reserve0,
            uint112 _reserve1,
            uint32 _blockTimestampLast
        )
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function mint(
        address to
    ) external nonReentrant returns (uint256 liquidity) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));

        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;

        if (totalSupply() == 0) {
            _mintMinimumLiquidity(address(1));
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
        } else {
            liquidity = Math.min(
                (amount0 * totalSupply()) / reserve0,
                (amount1 * totalSupply()) / reserve1
            );
        }

        require(liquidity > 0, "Insufficient liquidity minted");
        _mint(to, liquidity);

        update(balance0, balance1);
    }

    function burn(
        address to
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        uint256 liquidity = balanceOf(msg.sender);
        require(liquidity > 0, "No Liquidity");

        amount0 = (liquidity * reserve0) / totalSupply();
        amount1 = (liquidity * reserve1) / totalSupply();

        _burn(msg.sender, liquidity);

        IERC20(token0).transfer(to, amount0);
        IERC20(token1).transfer(to, amount1);

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        update(balance0, balance1);

        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to
    ) external nonReentrant {
        require(amount0Out > 0 || amount1Out > 0, "Insufficient output amount");
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        require(
            amount0Out < _reserve0 && amount1Out < _reserve1,
            "Insufficient liquidity"
        );

        if (amount0Out > 0) IERC20(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20(token1).transfer(to, amount1Out);

        uint256 balance0After = IERC20(token0).balanceOf(address(this));
        uint256 balance1After = IERC20(token1).balanceOf(address(this));

        uint256 amount0In = balance0After > _reserve0 - amount0Out
            ? balance0After - (_reserve0 - amount0Out)
            : 0;
        uint256 amount1In = balance1After > _reserve1 - amount1Out
            ? balance1After - (_reserve1 - amount1Out)
            : 0;
        require(amount0In > 0 || amount1In > 0, "Insufficient input amount");

        // Apply fee: (balance * 1000) - (amountIn * 3)
        uint256 balance0Adjusted = (balance0After * 1000) -
            (amount0In * FEE_RATE);
        uint256 balance1Adjusted = (balance1After * 1000) -
            (amount1In * FEE_RATE);

        require(
            balance0Adjusted * balance1Adjusted >=
                uint256(_reserve0) * uint256(_reserve1) * 1e6,
            "K invariant"
        );

        update(balance0After, balance1After);

        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function update(uint256 balance0_, uint256 balance1_) private {
        require(
            balance0_ <= type(uint112).max && balance1_ <= type(uint112).max,
            "Overflow)"
        );

        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        uint32 timeElapsed = blockTimestamp - blockTimestampLast;

        if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
            // cumulative price update
            price0CumulativeLast +=
                uint256(UQ112x112.uqdiv(UQ112x112.encode(reserve1), reserve0)) *
                timeElapsed;

            price1CumulativeLast +=
                uint256(UQ112x112.uqdiv(UQ112x112.encode(reserve0), reserve1)) *
                timeElapsed;
        }

        reserve0 = uint112(balance0_);
        reserve1 = uint112(balance1_);
        blockTimestampLast = blockTimestamp;
    }
}
