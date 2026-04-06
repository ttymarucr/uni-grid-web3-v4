import type { Chain } from 'viem';

export const unichain: Chain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL_UNICHAIN || 'https://mainnet.unichain.org'] },
  },
  blockExplorers: {
    default: { name: 'Unichain Explorer', url: 'https://unichain.blockscout.com' },
  },
};

export const supportedChains = [unichain] as const;

export const chainById = new Map<number, Chain>(
  supportedChains.map((c) => [c.id, c])
);
