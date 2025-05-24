// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

/**
 * @title ISushiSwapRouter
 * @dev Interface for the SushiSwap Router contract
 */
interface ISushiSwapRouter {
    /**
     * @notice Swaps an exact amount of input tokens for as many output tokens as possible
     * @param amountIn The amount of input tokens to send
     * @param amountOutMin The minimum amount of output tokens that must be received
     * @param path An array of token addresses representing the swap path
     * @param to Recipient of the output tokens
     * @param deadline Unix timestamp after which the transaction will revert
     * @return amounts The input token amount and all subsequent output token amounts
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /**
     * @notice Swaps an exact amount of ETH for as many output tokens as possible
     * @param amountOutMin The minimum amount of output tokens that must be received
     * @param path An array of token addresses representing the swap path
     * @param to Recipient of the output tokens
     * @param deadline Unix timestamp after which the transaction will revert
     * @return amounts The input token amount and all subsequent output token amounts
     */
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    /**
     * @notice Swaps an exact amount of tokens for as much ETH as possible
     * @param amountIn The amount of input tokens to send
     * @param amountOutMin The minimum amount of output ETH that must be received
     * @param path An array of token addresses representing the swap path
     * @param to Recipient of the ETH
     * @param deadline Unix timestamp after which the transaction will revert
     * @return amounts The input token amount and all subsequent output token amounts
     */
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /**
     * @notice Returns the amount of output tokens that would be received for a given input amount
     * @param amountIn The amount of input tokens
     * @param path An array of token addresses representing the swap path
     * @return amounts The input token amount and all subsequent output token amounts
     */
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    /**
     * @notice Returns the amount of input tokens that would be required to receive a given output amount
     * @param amountOut The amount of output tokens
     * @param path An array of token addresses representing the swap path
     * @return amounts The input token amount and all subsequent output token amounts
     */
    function getAmountsIn(
        uint256 amountOut,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);

    /**
     * @notice Factory address
     * @return The address of the factory contract
     */
    function factory() external view returns (address);

    /**
     * @notice WETH address
     * @return The address of the WETH contract
     */
    function WETH() external view returns (address);
}


