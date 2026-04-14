import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { config } from '$lib/wagmi/client';
import gridHookAbi_ from './abi/GridHook.json';
export const gridHookAbi = gridHookAbi_;
import type { Address } from 'viem';

function cfg() {
  return config;
}

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface GridConfig {
  gridSpacing: number;
  maxOrders: number;
  rebalanceThresholdBps: number;
  distributionType: number;
  autoRebalance: boolean;
  maxSlippageDelta0: bigint;
  maxSlippageDelta1: bigint;
}

export function isGridConfigEqual(a: GridConfig, b: GridConfig): boolean {
  return (
    a.gridSpacing === b.gridSpacing &&
    a.maxOrders === b.maxOrders &&
    a.rebalanceThresholdBps === b.rebalanceThresholdBps &&
    a.distributionType === b.distributionType &&
    a.autoRebalance === b.autoRebalance &&
    a.maxSlippageDelta0 === b.maxSlippageDelta0 &&
    a.maxSlippageDelta1 === b.maxSlippageDelta1
  );
}

export interface PoolState {
  initialized: boolean;
  currentTick: number;
  swapCount: number;
}

export interface UserGridState {
  deployed: boolean;
  gridCenterTick: number;
  lastActionTimestamp: number;
  rebalanceCount: number;
}

export interface GridOrder {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}

export interface OrderFees {
  fees0: bigint;
  fees1: bigint;
}

interface OrderFeeData {
  liquidity: bigint;
  feeGrowthInside0X128: bigint;
  feeGrowthInside1X128: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
}

const Q128 = 1n << 128n;

function computeFees(d: OrderFeeData): OrderFees {
  if (d.liquidity === 0n) return { fees0: 0n, fees1: 0n };
  return {
    fees0: ((d.feeGrowthInside0X128 - d.feeGrowthInside0LastX128) * d.liquidity) / Q128,
    fees1: ((d.feeGrowthInside1X128 - d.feeGrowthInside1LastX128) * d.liquidity) / Q128,
  };
}

const abi = gridHookAbi_ as readonly any[];

// ── Read functions ──

export async function getGridConfig(hookAddress: Address, key: PoolKey, user: Address): Promise<GridConfig> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getGridConfig',
    args: [key, user],
  });
  const r = result as any;
  return {
    gridSpacing: Number(r.gridSpacing),
    maxOrders: Number(r.maxOrders),
    rebalanceThresholdBps: Number(r.rebalanceThresholdBps),
    distributionType: Number(r.distributionType),
    autoRebalance: Boolean(r.autoRebalance),
    maxSlippageDelta0: BigInt(r.maxSlippageDelta0),
    maxSlippageDelta1: BigInt(r.maxSlippageDelta1),
  };
}

export async function getPoolState(hookAddress: Address, key: PoolKey): Promise<PoolState> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getPoolState',
    args: [key],
  });
  const r = result as any;
  return {
    initialized: Boolean(r.initialized),
    currentTick: Number(r.currentTick),
    swapCount: Number(r.swapCount),
  };
}

export async function getUserState(hookAddress: Address, key: PoolKey, user: Address): Promise<UserGridState> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getUserState',
    args: [key, user],
  });
  const r = result as any;
  return {
    deployed: Boolean(r.deployed),
    gridCenterTick: Number(r.gridCenterTick),
    lastActionTimestamp: Number(r.lastActionTimestamp),
    rebalanceCount: Number(r.rebalanceCount),
  };
}

export async function getGridOrders(hookAddress: Address, key: PoolKey, user: Address): Promise<GridOrder[]> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getGridOrders',
    args: [key, user],
  });
  return (result as any[]).map((o: any) => ({
    tickLower: Number(o.tickLower),
    tickUpper: Number(o.tickUpper),
    liquidity: BigInt(o.liquidity),
  }));
}

export async function getAccumulatedFees(hookAddress: Address, key: PoolKey, user: Address): Promise<OrderFees[]> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getAccumulatedFees',
    args: [key, user],
  });
  return (result as any[]).map((f: any) => computeFees({
    liquidity: BigInt(f.liquidity),
    feeGrowthInside0X128: BigInt(f.feeGrowthInside0X128),
    feeGrowthInside1X128: BigInt(f.feeGrowthInside1X128),
    feeGrowthInside0LastX128: BigInt(f.feeGrowthInside0LastX128),
    feeGrowthInside1LastX128: BigInt(f.feeGrowthInside1LastX128),
  }));
}

export async function getPlannedWeights(hookAddress: Address, key: PoolKey, user: Address): Promise<bigint[]> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getPlannedWeights',
    args: [key, user],
  });
  return (result as any[]).map((w: any) => BigInt(w));
}

// ── Pure computation functions (ported from Solidity) ──

const TOTAL_BPS = 10_000n;
const MIN_TICK = -887272;
const MAX_TICK = 887272;

export enum DistributionType {
  FLAT = 0,
  LINEAR = 1,
  REVERSE_LINEAR = 2,
  FIBONACCI = 3,
  SIGMOID = 4,
  LOGARITHMIC = 5,
}

function lnScaled(x: bigint): bigint {
  let log2Int = 0n;
  let v = x;
  for (const shift of [128n, 64n, 32n, 16n, 8n, 4n, 2n, 1n]) {
    const half = v >> shift;
    if (half > 0n) {
      log2Int |= shift;
      v = half;
    }
  }
  const power = 1n << log2Int;
  const frac = ((x - power) * 10_000n) / power;
  const log2Scaled = log2Int * 10_000n + frac;
  return (log2Scaled * 6931n) / 10_000n;
}

export function previewWeights(gridLength: number, distributionType: number): bigint[] {
  const n = BigInt(gridLength);
  if (n === 0n || n > 1000n) throw new Error('InvalidGridLength');
  const weights = new Array<bigint>(gridLength).fill(0n);

  if (distributionType === DistributionType.FLAT) {
    const eq = TOTAL_BPS / n;
    for (let i = 0; i < gridLength; i++) weights[i] = eq;
    return weights;
  }

  if (distributionType === DistributionType.LINEAR) {
    const denom = (n * (n + 1n)) / 2n;
    for (let i = 0; i < gridLength; i++) weights[i] = ((BigInt(i) + 1n) * TOTAL_BPS) / denom;
    return weights;
  }

  if (distributionType === DistributionType.REVERSE_LINEAR) {
    const denom = (n * (n + 1n)) / 2n;
    for (let i = 0; i < gridLength; i++) weights[i] = ((n - BigInt(i)) * TOTAL_BPS) / denom;
    return weights;
  }

  if (distributionType === DistributionType.SIGMOID) {
    const SCALE = 1_000_000n;
    const steepness = 10n;
    const halfSteepnessScaled = (steepness * SCALE) / 2n;
    const divisor = n > 1n ? n - 1n : 1n;
    const HALF = SCALE / 2n;
    const THRESHOLD = (5n * SCALE) / 2n;
    const FIVE_SCALE = 5n * SCALE;
    let total = 0n;

    for (let i = 0; i < gridLength; i++) {
      let x: bigint;
      if (n === 1n) {
        x = 0n;
      } else {
        x = (steepness * SCALE * BigInt(i)) / divisor - halfSteepnessScaled;
      }
      let value: bigint;
      if (x < -THRESHOLD) {
        value = 1n;
      } else if (x > THRESHOLD) {
        value = SCALE;
      } else {
        const result = HALF + (x * SCALE) / FIVE_SCALE;
        value = result > 0n ? result : 1n;
      }
      weights[i] = value;
      total += value;
    }
    for (let i = 0; i < gridLength; i++) weights[i] = (weights[i] * TOTAL_BPS) / total;
    return weights;
  }

  if (distributionType === DistributionType.LOGARITHMIC) {
    let total = 0n;
    for (let i = 0; i < gridLength; i++) {
      const value = lnScaled(BigInt(i) + 2n);
      weights[i] = value;
      total += value;
    }
    for (let i = 0; i < gridLength; i++) weights[i] = (weights[i] * TOTAL_BPS) / total;
    return weights;
  }

  // Fibonacci (default)
  if (gridLength === 1) {
    weights[0] = TOTAL_BPS;
    return weights;
  }
  let total = 2n;
  weights[0] = 1n;
  weights[1] = 1n;
  let prev = 1n;
  let curr = 1n;
  for (let i = 2; i < gridLength; i++) {
    const next = prev + curr;
    weights[i] = next;
    total += next;
    prev = curr;
    curr = next;
  }
  for (let i = 0; i < gridLength; i++) weights[i] = (weights[i] * TOTAL_BPS) / total;
  return weights;
}

export function alignTick(tick: number, tickSpacing: number): number {
  let compressed = Math.trunc(tick / tickSpacing);
  if (tick < 0 && tick % tickSpacing !== 0) compressed--;
  return compressed * tickSpacing;
}

export function computeGridOrders(
  centerTick: number,
  gridSpacing: number,
  tickSpacing: number,
  maxOrders: number,
  weights: bigint[],
  totalLiquidity: bigint,
): GridOrder[] {
  const orders: GridOrder[] = [];
  const halfOrders = Math.trunc(maxOrders / 2);
  const bottomTick = alignTick(centerTick - halfOrders * gridSpacing, tickSpacing);
  const topTick = bottomTick + maxOrders * gridSpacing;

  if (bottomTick < MIN_TICK || topTick > MAX_TICK) {
    throw new Error('TickRangeOutOfBounds');
  }

  let distributed = 0n;
  for (let i = 0; i < maxOrders; i++) {
    const tickLower = bottomTick + i * gridSpacing;
    const tickUpper = tickLower + gridSpacing;
    let liquidity: bigint;
    if (i === maxOrders - 1) {
      liquidity = totalLiquidity - distributed;
    } else {
      liquidity = (totalLiquidity * weights[i]) / 10_000n;
      distributed += liquidity;
    }
    orders.push({ tickLower, tickUpper, liquidity });
  }
  return orders;
}

export async function isRebalanceKeeper(hookAddress: Address, user: Address, keeper: Address): Promise<boolean> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'isRebalanceKeeper',
    args: [user, keeper],
  });
  return Boolean(result);
}

export async function getPoolManagerSlot0(
  hookAddress: Address,
  key: PoolKey,
): Promise<{ sqrtPriceX96: bigint; tick: number; protocolFee: number; lpFee: number }> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getPoolManagerSlot0',
    args: [key],
  });
  const r = result as any;
  return {
    sqrtPriceX96: BigInt(r[0] ?? r.sqrtPriceX96),
    tick: Number(r[1] ?? r.tick),
    protocolFee: Number(r[2] ?? r.protocolFee),
    lpFee: Number(r[3] ?? r.lpFee),
  };
}

// ── PoolManager interaction ──

export const POOL_MANAGER_INITIALIZE_ABI = [
  {
    type: 'function',
    name: 'initialize',
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
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    outputs: [{ name: 'tick', type: 'int24' }],
    stateMutability: 'nonpayable',
  },
] as const;

export async function getPoolManagerAddress(hookAddress: Address): Promise<Address> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'poolManager',
    args: [],
  });
  return result as Address;
}

export async function initializePool(poolManagerAddress: Address, key: PoolKey, sqrtPriceX96: bigint) {
  const hash = await writeContract(cfg(), {
    address: poolManagerAddress,
    abi: POOL_MANAGER_INITIALIZE_ABI,
    functionName: 'initialize',
    args: [key, sqrtPriceX96],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

// ── Write functions ──

export async function setGridConfig(hookAddress: Address, key: PoolKey, gridConfig: GridConfig) {
  const hash = await writeContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'setGridConfig',
    args: [key, gridConfig],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function deployGrid(
  hookAddress: Address,
  key: PoolKey,
  totalLiquidity: bigint,
  maxDelta0: bigint,
  maxDelta1: bigint,
  deadline: bigint,
  value: bigint = 0n,
) {
  const hash = await writeContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'deployGrid',
    args: [key, totalLiquidity, maxDelta0, maxDelta1, deadline],
    value,
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function rebalance(hookAddress: Address, key: PoolKey, user: Address, deadline: bigint, value: bigint = 0n) {
  const hash = await writeContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'rebalance',
    args: [key, user, deadline],
    value,
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function closeGrid(hookAddress: Address, key: PoolKey, deadline: bigint) {
  const hash = await writeContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'closeGrid',
    args: [key, deadline],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function setRebalanceKeeper(hookAddress: Address, keeper: Address, authorized: boolean) {
  const hash = await writeContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'setRebalanceKeeper',
    args: [keeper, authorized],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

// ── Helpers ──

export function getDeadline(minutesFromNow = 5): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutesFromNow * 60);
}
