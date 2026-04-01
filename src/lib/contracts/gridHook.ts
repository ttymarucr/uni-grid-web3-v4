import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { config } from '$lib/wagmi/client';
import gridHookAbi from './abi/GridHook.json';
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

export interface PoolState {
  initialized: boolean;
  currentTick: number;
  swapCount: number;
}

export interface UserGridState {
  deployed: boolean;
  gridCenterTick: number;
}

export interface GridOrder {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}

const abi = gridHookAbi as readonly any[];

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

export async function getPlannedWeights(hookAddress: Address, key: PoolKey, user: Address): Promise<bigint[]> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'getPlannedWeights',
    args: [key, user],
  });
  return (result as any[]).map((w: any) => BigInt(w));
}

export async function previewWeights(
  hookAddress: Address,
  gridLength: number,
  distributionType: number
): Promise<bigint[]> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'previewWeights',
    args: [BigInt(gridLength), distributionType],
  });
  return (result as any[]).map((w: any) => BigInt(w));
}

export async function computeGridOrders(
  hookAddress: Address,
  centerTick: number,
  gridSpacing: number,
  tickSpacing: number,
  maxOrders: number,
  weights: bigint[],
  totalLiquidity: bigint
): Promise<GridOrder[]> {
  const result = await readContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'computeGridOrders',
    args: [centerTick, gridSpacing, tickSpacing, maxOrders, weights, totalLiquidity],
  });
  return (result as any[]).map((o: any) => ({
    tickLower: Number(o.tickLower),
    tickUpper: Number(o.tickUpper),
    liquidity: BigInt(o.liquidity),
  }));
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

export async function deployGrid(hookAddress: Address, key: PoolKey, totalLiquidity: bigint, maxDelta0: bigint, maxDelta1: bigint, deadline: bigint) {
  const hash = await writeContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'deployGrid',
    args: [key, totalLiquidity, maxDelta0, maxDelta1, deadline],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function rebalance(hookAddress: Address, key: PoolKey, user: Address, deadline: bigint) {
  const hash = await writeContract(cfg(), {
    address: hookAddress,
    abi,
    functionName: 'rebalance',
    args: [key, user, deadline],
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
