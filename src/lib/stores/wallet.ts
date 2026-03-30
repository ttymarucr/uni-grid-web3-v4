import { writable, derived, readable } from 'svelte/store';
import { watchAccount, watchChainId, disconnect, getAccount, getChainId } from '@wagmi/core';
import { config } from '$lib/wagmi/client';

export const connected = writable(false);
export const signerAddress = writable<string | null>(null);
export const chainId = writable<number | null>(null);
export const wagmiLoaded = writable(false);
export const loading = writable(false);

export const wagmiConfig = readable(config);

// Keep stores in sync with wagmi state
watchAccount(config, {
  onChange(account) {
    connected.set(account.status === 'connected');
    signerAddress.set(account.address ?? null);
    loading.set(account.status === 'connecting' || account.status === 'reconnecting');
  },
});

watchChainId(config, {
  onChange(id) {
    chainId.set(id);
  },
});

// Seed initial values
const initial = getAccount(config);
connected.set(initial.status === 'connected');
signerAddress.set(initial.address ?? null);
chainId.set(getChainId(config));

export async function disconnectWagmi() {
  await disconnect(config);
}

export const shortAddress = derived(signerAddress, ($addr) =>
  $addr ? `${$addr.slice(0, 6)}…${$addr.slice(-4)}` : ''
);
