import type { waitForTransactionReceipt } from '@wagmi/core';
import { getConnection, switchChain } from '@wagmi/core';
import { config } from '$lib/wagmi/client';
import { supportedChains } from '$lib/wagmi/config';
import { isSupported } from '$lib/contracts/config';
import { addToast, updateToast } from '$lib/stores/toasts';
import type { Hash } from 'viem';

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

function parseError(err: any): string {
  if (err?.name === 'UserRejectedRequestError' || err?.code === 4001) {
    return 'transaction rejected by user';
  }
  if (err?.message?.includes('insufficient funds')) {
    return 'insufficient funds for gas';
  }
  if (err?.message?.includes('chain mismatch') || err?.message?.includes('chainId')) {
    return 'wrong network — please switch to a supported chain';
  }
  return err?.shortMessage || err?.message || 'unknown error';
}
