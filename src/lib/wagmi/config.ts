import type { Chain } from 'viem';

export const unichain: Chain = {
  id: Number(import.meta.env.VITE_CHAIN_ID) || 130,
  name: 'Unichain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_UNICHAIN_RPC_URL || 'https://mainnet.unichain.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Unichain Explorer',
      url: 'https://unichain.blockscout.com',
    },
  },
};
