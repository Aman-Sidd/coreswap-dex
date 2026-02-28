// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UniswapV2ERC20 is ERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    address public factory;

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {
        factory = msg.sender;
    }

    /// @notice Mint LP tokens, only callable by pair contract
    function mint(address to, uint256 amount) external {
        require(msg.sender == factory, "Only factory/pair can mint");
        _mint(to, amount);
    }

    /// @notice Burn LP tokens, only callable by pair contract
    function burn(address from, uint256 amount) external {
        require(msg.sender == factory, "Only factory/pair can burn");
        _burn(from, amount);
    }

    /// @notice Permanently lock minimum liquidity at first mint
    function _mintMinimumLiquidity(address to) internal {
        _mint(to, MINIMUM_LIQUIDITY);
    }
}
