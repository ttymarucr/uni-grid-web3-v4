import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { config } from '$lib/wagmi/client';
import { GRIDHOOK_ADDRESS } from './config';
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
}

export interface PoolRuntimeState {
  initialized: boolean;
  liquidityOperations: number;
  swapCount: number;
  lastLowerTick: number;
  lastUpperTick: number;
  lastSwapAmountSpecified: bigint;
  currentTick: number;
  gridCenterTick: number;
  gridDeployed: boolean;
}

export interface GridOrder {
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
}

const abi = gridHookAbi as readonly any[];

// ── Read functions ──

export async function getPoolConfig(key: PoolKey): Promise<GridConfig> {
  const result = await readContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'getPoolConfig',
    args: [key],
  });
  const r = result as any;
  return {
    gridSpacing: Number(r.gridSpacing),
    maxOrders: Number(r.maxOrders),
    rebalanceThresholdBps: Number(r.rebalanceThresholdBps),
    distributionType: Number(r.distributionType),
    autoRebalance: Boolean(r.autoRebalance),
  };
}

export async function getPoolState(key: PoolKey): Promise<PoolRuntimeState> {
  const result = await readContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'getPoolState',
    args: [key],
  });
  const r = result as any;
  return {
    initialized: Boolean(r.initialized),
    liquidityOperations: Number(r.liquidityOperations),
    swapCount: Number(r.swapCount),
    lastLowerTick: Number(r.lastLowerTick),
    lastUpperTick: Number(r.lastUpperTick),
    lastSwapAmountSpecified: BigInt(r.lastSwapAmountSpecified),
    currentTick: Number(r.currentTick),
    gridCenterTick: Number(r.gridCenterTick),
    gridDeployed: Boolean(r.gridDeployed),
  };
}

export async function getGridOrders(key: PoolKey): Promise<GridOrder[]> {
  const result = await readContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'getGridOrders',
    args: [key],
  });
  return (result as any[]).map((o: any) => ({
    tickLower: Number(o.tickLower),
    tickUpper: Number(o.tickUpper),
    liquidity: BigInt(o.liquidity),
  }));
}

export async function getPlannedWeights(key: PoolKey): Promise<bigint[]> {
  const result = await readContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'getPlannedWeights',
    args: [key],
  });
  return (result as any[]).map((w: any) => BigInt(w));
}

export async function previewWeights(
  gridLength: number,
  distributionType: number
): Promise<bigint[]> {
  const result = await readContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'previewWeights',
    args: [BigInt(gridLength), distributionType],
  });
  return (result as any[]).map((w: any) => BigInt(w));
}

export async function computeGridOrders(
  centerTick: number,
  gridSpacing: number,
  tickSpacing: number,
  maxOrders: number,
  weights: bigint[],
  totalLiquidity: bigint
): Promise<GridOrder[]> {
  const result = await readContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
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

export async function getOwner(): Promise<Address> {
  return (await readContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'owner',
  })) as Address;
}

// ── Write functions ──

export async function setPoolConfig(key: PoolKey, config: GridConfig) {
  const hash = await writeContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'setPoolConfig',
    args: [key, config],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function deployGrid(key: PoolKey, totalLiquidity: bigint) {
  const hash = await writeContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'deployGrid',
    args: [key, totalLiquidity],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function rebalance(key: PoolKey) {
  const hash = await writeContract(cfg(), {
    address: GRIDHOOK_ADDRESS,
    abi,
    functionName: 'rebalance',
    args: [key],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}
