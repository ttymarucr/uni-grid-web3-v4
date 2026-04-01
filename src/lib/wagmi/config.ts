import type { Chain } from 'viem';

export const ethereum: Chain = {
  id: 1,
  name: 'Ethereum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL_ETHEREUM || 'https://eth.llamarpc.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://etherscan.io' },
  },
};

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

export const arbitrum: Chain = {
  id: 42161,
  name: 'Arbitrum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL_ARBITRUM || 'https://arb1.arbitrum.io/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Arbiscan', url: 'https://arbiscan.io' },
  },
};

export const base: Chain = {
  id: 8453,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL_BASE || 'https://mainnet.base.org'] },
  },
  blockExplorers: {
    default: { name: 'BaseScan', url: 'https://basescan.org' },
  },
};

export const bnb: Chain = {
  id: 56,
  name: 'BNB Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL_BNB || 'https://bsc-dataseed.binance.org'] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
};

export const supportedChains = [ethereum, unichain, arbitrum, base, bnb] as const;

export const chainById = new Map<number, Chain>(
  supportedChains.map((c) => [c.id, c])
);
