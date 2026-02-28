// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./CoreswapFactory.sol";
import "./CoreswapPair.sol";
import "./interfaces/IWETH.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract UniswapV2Router {
    using SafeERC20 for IERC20;

    address public factory;
    address public WETH;

    constructor(address _factory, address _WETH) {
        require(_factory != address(0), "Factory zero address");
        require(_WETH != address(0), "WETH zero address");
        factory = _factory;
        WETH = _WETH;
    }

    // Liquidity
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        address to
    ) external returns (uint256 liquidity) {
        address pair = UniswapV2Factory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "Pair not exist");

        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountADesired);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountBDesired);

        liquidity = UniswapV2Pair(pair).mint(to);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        address to
    ) external returns (uint256 amountA, uint256 amountB) {
        address pair = UniswapV2Factory(factory).getPair(tokenA, tokenB);
        require(pair != address(0), "Pair not exist");

        (amountA, amountB) = UniswapV2Pair(pair).burn(to);
    }

    // Swaps
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external {
        require(path.length == 2, "Single hop only");

        address input = path[0];
        address output = path[1];

        address pair = UniswapV2Factory(factory).getPair(input, output);
        require(pair != address(0), "Pair not exist");

        IERC20(input).safeTransferFrom(msg.sender, pair, amountIn);

        (uint112 reserve0, uint112 reserve1, ) = UniswapV2Pair(pair)
            .getReserves();

        uint256 amountOut;

        // Tokens are sorted, so token0 < token1
        if (input < output) {
            amountOut = getAmountOut(amountIn, reserve0, reserve1);
            require(amountOut >= amountOutMin, "Insufficient output");
            UniswapV2Pair(pair).swap(0, amountOut, to);
        } else {
            amountOut = getAmountOut(amountIn, reserve1, reserve0);
            require(amountOut >= amountOutMin, "Insufficient output");
            UniswapV2Pair(pair).swap(amountOut, 0, to);
        }
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to
    ) external payable {
        require(path.length == 2, "Single hop only");
        require(path[0] == WETH, "Path must start with WETH");

        require(msg.value > 0, "No ETH sent");

        address tokenOut = path[1];
        address pair = UniswapV2Factory(factory).getPair(WETH, tokenOut);
        require(pair != address(0), "Pair not exist");

        // Wrap ETH
        IWETH(WETH).deposit{value: msg.value}();
        IERC20(WETH).safeTransfer(pair, msg.value);

        (uint112 reserve0, uint112 reserve1, ) = UniswapV2Pair(pair)
            .getReserves();

        uint256 amountOut;

        // Tokens are sorted, so token0 < token1
        if (WETH < tokenOut) {
            amountOut = getAmountOut(msg.value, reserve0, reserve1);
            require(amountOut >= amountOutMin, "Insufficient output");
            UniswapV2Pair(pair).swap(0, amountOut, to);
        } else {
            amountOut = getAmountOut(msg.value, reserve1, reserve0);
            require(amountOut >= amountOutMin, "Insufficient output");
            UniswapV2Pair(pair).swap(amountOut, 0, to);
        }
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to
    ) external {
        require(path.length == 2, "Single hop only");
        require(path[1] == WETH, "Path must end with WETH");

        address tokenIn = path[0];
        address pair = UniswapV2Factory(factory).getPair(tokenIn, WETH);
        require(pair != address(0), "Pair not exist");

        (uint112 reserve0, uint112 reserve1, ) = UniswapV2Pair(pair)
            .getReserves();

        uint256 amountIn;

        // Tokens are sorted, so token0 < token1
        if (tokenIn < WETH) {
            amountIn = getAmountIn(amountOut, reserve0, reserve1);
        } else {
            amountIn = getAmountIn(amountOut, reserve1, reserve0);
        }

        require(amountIn <= amountInMax, "Excessive input amount");

        IERC20(tokenIn).safeTransferFrom(msg.sender, pair, amountIn);

        if (tokenIn < WETH) {
            UniswapV2Pair(pair).swap(0, amountOut, address(this));
        } else {
            UniswapV2Pair(pair).swap(amountOut, 0, address(this));
        }

        // Unwrap WETH -> ETH
        IWETH(WETH).withdraw(amountOut);
        payable(to).transfer(amountOut);
    }

    // MATH HELPERS
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        require(amountIn > 0, "Amount in zero");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;

        return numerator / denominator;
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure returns (uint256) {
        require(amountOut > 0, "Amount out zero");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");

        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;

        return (numerator / denominator) + 1;
    }

    receive() external payable {}
}
