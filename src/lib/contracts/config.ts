import type { Address } from 'viem';

export const PERMIT2_ADDRESS: Address = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

export interface ChainDeployment {
  address: Address;
  explorerUrl: string;
}

const ZERO: Address = '0x0000000000000000000000000000000000000000';

export const deployments: Record<number, ChainDeployment> = {
  1: {
    address: (import.meta.env.VITE_GRIDHOOK_ADDRESS_ETHEREUM as Address) ?? ZERO,
    explorerUrl: 'https://etherscan.io',
  },
  130: {
    address: (import.meta.env.VITE_GRIDHOOK_ADDRESS_UNICHAIN as Address) ?? ZERO,
    explorerUrl: 'https://unichain.blockscout.com',
  },
  42161: {
    address: (import.meta.env.VITE_GRIDHOOK_ADDRESS_ARBITRUM as Address) ?? ZERO,
    explorerUrl: 'https://arbiscan.io',
  },
  8453: {
    address: (import.meta.env.VITE_GRIDHOOK_ADDRESS_BASE as Address) ?? ZERO,
    explorerUrl: 'https://basescan.org',
  },
  56: {
    address: (import.meta.env.VITE_GRIDHOOK_ADDRESS_BNB as Address) ?? ZERO,
    explorerUrl: 'https://bscscan.com',
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
