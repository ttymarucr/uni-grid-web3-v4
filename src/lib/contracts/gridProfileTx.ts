import type { Address } from 'viem';
import { executeTransaction } from '$lib/contracts/txWrapper';
import {
  rebalance as writeRebalance,
  closeGrid as writeCloseGrid,
  setRebalanceKeeper as writeSetKeeper,
  getDeadline,
  type PoolKey,
} from '$lib/contracts/gridHook';
import {
  approveTokenForPermit2,
  getTokenAllowanceForPermit2,
  grantPermit2Allowance,
  getPermit2Allowance,
} from '$lib/contracts/permit2';
import { isNativeToken } from '$lib/contracts/poolPresets';

const MAX_UINT160 = (1n << 160n) - 1n;
const permit2Expiration = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

export async function ensurePermit2Allowances(params: {
  user: Address;
  hookAddress: Address;
  tokens: { addr: Address; label: string }[];
  onStep?: (msg: string) => void;
}): Promise<void> {
  const { user, hookAddress, tokens, onStep } = params;

  for (const tok of tokens) {
    if (isNativeToken(tok.addr)) continue;

    onStep?.(`Checking ${tok.label} allowance\u2026`);
    const erc20 = await getTokenAllowanceForPermit2(tok.addr, user);
    if (erc20 < MAX_UINT160 / 2n) {
      onStep?.(`Approving ${tok.label} for Permit2\u2026`);
      await executeTransaction(`Approve ${tok.label}`, () =>
        approveTokenForPermit2(tok.addr, MAX_UINT160),
      );
    }

    const p2 = await getPermit2Allowance(user, tok.addr, hookAddress);
    if (p2.amount < MAX_UINT160 / 2n) {
      onStep?.(`Granting ${tok.label} hook allowance\u2026`);
      await executeTransaction(`Grant ${tok.label} Allowance`, () =>
        grantPermit2Allowance(tok.addr, hookAddress, MAX_UINT160, permit2Expiration()),
      );
    }
  }
}

export async function runRebalance(params: {
  hookAddress: Address;
  poolKey: PoolKey;
  user: Address;
  deadlineMinutes: number;
  nativeValue?: bigint;
  approvalTokens?: { addr: Address; label: string }[];
  onStep?: (msg: string) => void;
}): Promise<void> {
  const { hookAddress, poolKey, user, deadlineMinutes, nativeValue = 0n, approvalTokens, onStep } = params;

  if (approvalTokens && approvalTokens.length > 0) {
    await ensurePermit2Allowances({ user, hookAddress, tokens: approvalTokens, onStep });
  }

  onStep?.('Rebalancing\u2026');
  await executeTransaction('Rebalance', () =>
    writeRebalance(hookAddress, poolKey, user, getDeadline(deadlineMinutes), nativeValue),
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
