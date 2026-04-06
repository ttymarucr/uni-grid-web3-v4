import type { Address } from 'viem';
import { getPresetsForChain, type PoolPreset } from '$lib/contracts/poolPresets';
import {
  getGridConfig,
  getPoolState,
  getUserState,
  getGridOrders,
  type PoolKey,
  type GridConfig,
  type PoolState,
  type UserGridState,
} from '$lib/contracts/gridHook';

export interface DeployedPosition {
  preset: PoolPreset;
  poolState: PoolState;
  userState: UserGridState;
  gridConfig: GridConfig;
  orderCount: number;
  activeOrders: number;
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

        const [ps, cfg, orders] = await Promise.all([
          getPoolState(hookAddress, key),
          getGridConfig(hookAddress, key, user),
          getGridOrders(hookAddress, key, user),
        ]);

        found.push({
          preset,
          poolState: ps,
          userState: us,
          gridConfig: cfg,
          orderCount: orders.length,
          activeOrders: orders.filter((o) => o.liquidity > 0n).length,
        });
      } catch {
        // Skip pools that fail (not initialized, missing data, etc.)
      }
    }),
  );

  return found;
}
