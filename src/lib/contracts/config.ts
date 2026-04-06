import type { Address } from 'viem';

export const PERMIT2_ADDRESS: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export interface ChainDeployment {
  address: Address;
  explorerUrl: string;
}

const ZERO: Address = '0x0000000000000000000000000000000000000000';

export const deployments: Record<number, ChainDeployment> = {
  130: {
    address: (import.meta.env.VITE_GRIDHOOK_ADDRESS_UNICHAIN as Address) ?? ZERO,
    explorerUrl: 'https://unichain.blockscout.com',
  },
};

export function getDeployment(chainId: number | null): ChainDeployment | undefined {
  return chainId != null ? deployments[chainId] : undefined;
}

export function getGridHookAddress(chainId: number | null): Address {
  return getDeployment(chainId)?.address ?? ZERO;
}

export function getExplorerUrl(chainId: number | null): string {
  return getDeployment(chainId)?.explorerUrl ?? '';
}

export function isSupported(chainId: number | null): boolean {
  return chainId != null && chainId in deployments;
}

export function txUrl(chainId: number | null, hash: string): string {
  const base = getExplorerUrl(chainId);
  return base ? `${base}/tx/${hash}` : `#tx-${hash}`;
}

export function addressUrl(chainId: number | null, addr: string): string {
  const base = getExplorerUrl(chainId);
  return base ? `${base}/address/${addr}` : `#addr-${addr}`;
}

// ── SwapRouter addresses (set after deployment via env vars) ──

const swapRouterAddresses: Record<number, Address> = {
  130: (import.meta.env.VITE_SWAP_ROUTER_ADDRESS_UNICHAIN as Address) ?? ZERO,
};

export function getSwapRouterAddress(chainId: number | null): Address {
  if (chainId == null) return ZERO;
  return swapRouterAddresses[chainId] ?? ZERO;
}
