import type { Address } from 'viem';
import { executeTransaction } from '$lib/contracts/txWrapper';
import {
  rebalance as writeRebalance,
  closeGrid as writeCloseGrid,
  setRebalanceKeeper as writeSetKeeper,
  getDeadline,
  type PoolKey,
} from '$lib/contracts/gridHook';

export async function runRebalance(
  hookAddress: Address,
  poolKey: PoolKey,
  user: Address,
  deadlineMinutes: number,
): Promise<void> {
  await executeTransaction('Rebalance', () =>
    writeRebalance(hookAddress, poolKey, user, getDeadline(deadlineMinutes)),
  );
}

export async function runCloseGrid(
  hookAddress: Address,
  poolKey: PoolKey,
  deadlineMinutes: number,
): Promise<void> {
  await executeTransaction('Close Grid', () =>
    writeCloseGrid(hookAddress, poolKey, getDeadline(deadlineMinutes)),
  );
}

export async function runSetKeeper(
  hookAddress: Address,
  keeperAddress: Address,
  keeperAuthorized: boolean,
): Promise<void> {
  await executeTransaction(keeperAuthorized ? 'Authorize Keeper' : 'Revoke Keeper', () =>
    writeSetKeeper(hookAddress, keeperAddress, keeperAuthorized),
  );
}
