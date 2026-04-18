import type { waitForTransactionReceipt } from '@wagmi/core';
import { getConnection, switchChain, sendCalls, getCallsStatus, getCapabilities } from '@wagmi/core';
import { config } from '$lib/wagmi/client';
import { supportedChains } from '$lib/wagmi/config';
import { isSupported } from '$lib/contracts/config';
import { addToast, updateToast } from '$lib/stores/toasts';
import type { Address, Hash } from 'viem';

const DEFAULT_CHAIN_ID = supportedChains[0].id;

/**
 * Ensures the wallet is on a supported chain.
 *
 * - If `expectedChainId` is given, switches to that exact chain.
 * - Otherwise, keeps the current chain when it is supported.
 * - Falls back to the first supported chain when the current chain is unsupported.
 */
export async function ensureChain(expectedChainId?: number): Promise<void> {
  const connection = getConnection(config);
  const current = connection?.chainId;

  if (expectedChainId != null) {
    if (current === expectedChainId) return;
    await switchChain(config, { chainId: expectedChainId });
    return;
  }

  // No explicit chain requested — stay on current if it's supported
  if (current != null && isSupported(current)) return;
  await switchChain(config, { chainId: DEFAULT_CHAIN_ID });
}

export interface TxResult {
  hash: Hash;
  wait: () => ReturnType<typeof waitForTransactionReceipt>;
}

/**
 * Wraps a write contract call with toast lifecycle:
 * pending → success / error
 */
export async function executeTransaction(
  label: string,
  writeFn: () => Promise<TxResult>
): Promise<void> {
  await ensureChain();
  const toastId = addToast('pending', `${label}: sending transaction…`);

  try {
    const { hash, wait } = await writeFn();
    updateToast(toastId, {
      message: `${label}: waiting for confirmation…`,
      txHash: hash,
    });

    const receipt = await wait();

    if (receipt.status === 'success') {
      updateToast(toastId, {
        type: 'success',
        message: `${label}: confirmed!`,
        txHash: hash,
      });
    } else {
      updateToast(toastId, {
        type: 'error',
        message: `${label}: transaction reverted`,
        txHash: hash,
      });
    }
  } catch (err: any) {
    const msg = parseError(err);
    updateToast(toastId, {
      type: 'error',
      message: `${label}: ${msg}`,
    });
    throw err;
  }
}

export function parseError(err: any): string {
  if (err?.name === 'UserRejectedRequestError' || err?.code === 4001) {
    return 'transaction rejected by user';
  }
  if (err?.message?.includes('insufficient funds')) {
    return 'insufficient funds for gas';
  }
  if (err?.message?.includes('chain mismatch') || err?.message?.includes('chainId')) {
    return 'wrong network — please switch to a supported chain';
  }
  const msg = err?.shortMessage || err?.message || '';
  if (msg.includes('ExcessivePriceImpact')) {
    return 'swap blocked: price moved too far in this block (anti-sandwich protection)';
  }
  if (msg.includes('RebalanceInSameBlockAsSwap')) {
    return 'rebalance blocked: a swap occurred in this block — try again next block';
  }
  if (msg.includes('RebalanceCooldownNotMet')) {
    return 'rebalance cooldown: wait 60 seconds between rebalances';
  }
  if (msg.includes('KeeperRebalanceBlockedDuringVolatility')) {
    return 'keeper rebalance blocked during high volatility';
  }
  return msg || 'unknown error';
}

// ── EIP-5792 batched calls (AA wallets) ──

export interface BatchCall {
  to: Address;
  abi: readonly any[];
  functionName: string;
  args: readonly any[];
  value?: bigint;
}

/** Check if the connected wallet supports EIP-5792 atomic batched calls. */
export async function walletSupportsBatching(): Promise<boolean> {
  try {
    const caps = await getCapabilities(config);
    return Object.values(caps).some(
      (c: any) => c.atomicBatch?.supported || c.atomic?.supported,
    );
  } catch {
    return false;
  }
}

/**
 * Send multiple contract calls as a single EIP-5792 batch and poll until confirmed.
 */
export async function executeBatchTransaction(
  label: string,
  calls: BatchCall[],
): Promise<void> {
  await ensureChain();
  const toastId = addToast('pending', `${label}: sending batched transaction…`);

  try {
    const formattedCalls = calls.map((c) => ({
      to: c.to,
      abi: c.abi,
      functionName: c.functionName,
      args: c.args,
      ...(c.value != null && c.value > 0n ? { value: c.value } : {}),
    }));

    const { id } = await sendCalls(config, { calls: formattedCalls } as any);

    updateToast(toastId, { message: `${label}: waiting for confirmation…` });

    // Poll until terminal status
    let status: Awaited<ReturnType<typeof getCallsStatus>>;
    do {
      await new Promise((r) => setTimeout(r, 2000));
      status = await getCallsStatus(config, { id });
    } while (status.status === 'pending');
    if (status.status === 'success') {
      updateToast(toastId, { type: 'success', message: `${label}: confirmed!` });
    } else {
      updateToast(toastId, { type: 'error', message: `${label}: batch reverted` });
      throw new Error('Batch transaction reverted');
    }
  } catch (err: any) {
    const msg = parseError(err);
    updateToast(toastId, { type: 'error', message: `${label}: ${msg}` });
    throw err;
  }
}
