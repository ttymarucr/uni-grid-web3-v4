import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { config } from '$lib/wagmi/client';
import type { Address } from 'viem';
import type { PoolKey } from './gridHook';

function cfg() {
  return config;
}

// ── ABI fragments ──

const SWAP_ROUTER_ABI = [
  {
    type: 'function',
    name: 'swap',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountSpecified', type: 'int256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'delta', type: 'int256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'poolManager',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

// ── sqrtPriceLimitX96 constants (used when no limit desired) ──

// Min/max sqrt price for Uniswap v4 (TickMath.MIN_SQRT_PRICE + 1, MAX_SQRT_PRICE - 1)
const MIN_SQRT_PRICE_LIMIT = 4295128740n;
const MAX_SQRT_PRICE_LIMIT = 1461446703485210103287273052203988822378723970341n;

export interface SwapParams {
  zeroForOne: boolean;
  amountSpecified: bigint; // negative = exact input, positive = exact output
  sqrtPriceLimitX96?: bigint;
}

/**
 * Execute a single-pool swap through the SwapRouter contract.
 *
 * @param routerAddress  Deployed SwapRouter address on the current chain.
 * @param key            PoolKey for the target pool (includes hook address).
 * @param params         Swap parameters (direction, amount, optional price limit).
 * @param value          Native ETH to send (for swaps involving ETH as input).
 */
export async function executeSwap(
  routerAddress: Address,
  key: PoolKey,
  params: SwapParams,
  value: bigint = 0n,
) {
  const sqrtPriceLimitX96 =
    params.sqrtPriceLimitX96 ?? (params.zeroForOne ? MIN_SQRT_PRICE_LIMIT : MAX_SQRT_PRICE_LIMIT);

  const hash = await writeContract(cfg(), {
    address: routerAddress,
    abi: SWAP_ROUTER_ABI,
    functionName: 'swap',
    args: [
      key,
      {
        zeroForOne: params.zeroForOne,
        amountSpecified: params.amountSpecified,
        sqrtPriceLimitX96,
      },
      '0x', // empty hookData
    ],
    value,
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

/**
 * Estimate swap output using the current sqrt price (constant-product approximation).
 * This is a rough off-chain estimate — actual output depends on tick-level liquidity.
 */
export function estimateSwapOutput(
  amountIn: bigint,
  sqrtPriceX96: bigint,
  zeroForOne: boolean,
  feeBps: number,
  decimals0: number,
  decimals1: number,
): bigint {
  if (amountIn === 0n || sqrtPriceX96 === 0n) return 0n;

  const Q96 = 1n << 96n;
  // price = (sqrtPriceX96 / 2^96)^2 = sqrtPriceX96^2 / 2^192
  // token1/token0 price
  const feeMultiplier = 10000n - BigInt(Math.floor(feeBps));
  const amountAfterFee = (amountIn * feeMultiplier) / 10000n;

  if (zeroForOne) {
    // Selling token0 for token1
    // output ≈ amountIn * price = amountIn * sqrtPrice^2 / 2^192
    const num = amountAfterFee * sqrtPriceX96 * sqrtPriceX96;
    return num >> 192n;
  } else {
    // Selling token1 for token0
    // output ≈ amountIn / price = amountIn * 2^192 / sqrtPrice^2
    if (sqrtPriceX96 === 0n) return 0n;
    const num = amountAfterFee << 192n;
    return num / (sqrtPriceX96 * sqrtPriceX96);
  }
}

/**
 * Compute the fee in basis points from the pool's fee field.
 * Uniswap v4 stores fee as hundredths of a bip (e.g. 3000 = 0.30%).
 */
export function poolFeeToBps(fee: number): number {
  return fee / 100;
}
