import type { Address } from 'viem';
import { getPresetsForChain, type PoolPreset } from '$lib/contracts/poolPresets';
import {
  getGridConfig,
  getPoolState,
  getUserState,
  getGridOrders,
  getAccumulatedFees,
  type PoolKey,
  type GridConfig,
  type PoolState,
  type UserGridState,
} from '$lib/contracts/gridHook';
import { computeGridApr } from '$lib/stores/gridController';

export interface DeployedPosition {
  preset: PoolPreset;
  poolState: PoolState;
  userState: UserGridState;
  gridConfig: GridConfig;
  orderCount: number;
  activeOrders: number;
  apr: number | null;
}

export async function scanDeployedPositionsForUser(
  hookAddress: Address,
  user: Address,
  chainId: number,
): Promise<DeployedPosition[]> {
  const found: DeployedPosition[] = [];
  const chainPresets = getPresetsForChain(chainId);
  await Promise.all(
    chainPresets.map(async (preset) => {
      try {
        const key: PoolKey = {
          currency0: preset.currency0,
          currency1: preset.currency1,
          fee: preset.fee,
          tickSpacing: preset.tickSpacing,
          hooks: hookAddress,
        };
        const us = await getUserState(hookAddress, key, user);
        if (!us.deployed) return;

        const [ps, cfg, orders, fees] = await Promise.all([
          getPoolState(hookAddress, key),
          getGridConfig(hookAddress, key, user),
          getGridOrders(hookAddress, key, user),
          getAccumulatedFees(hookAddress, key, user),
        ]);

        const totalFees0 = fees.reduce((s, f) => s + f.fees0, 0n);
        const totalFees1 = fees.reduce((s, f) => s + f.fees1, 0n);
        const aprResult = computeGridApr({
          totalFees0,
          totalFees1,
          gridOrders: orders,
          currentTick: ps.currentTick,
          lastActionTimestamp: us.lastActionTimestamp,
          currency0Decimals: preset.currency0Decimals,
          currency1Decimals: preset.currency1Decimals,
        });

        found.push({
          preset,
          poolState: ps,
          userState: us,
          gridConfig: cfg,
          orderCount: orders.length,
          activeOrders: orders.filter((o) => o.liquidity > 0n).length,
          apr: aprResult?.apr ?? null,
        });
      } catch {
        // Skip pools that fail (not initialized, missing data, etc.)
      }
    }),
  );

  return found;
}
