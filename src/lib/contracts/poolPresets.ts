import type { Address } from 'viem';

export interface PoolPreset {
  label: string;
  currency0: Address;
  currency1: Address;
  currency0Symbol: string;
  currency1Symbol: string;
  currency0Decimals: number;
  currency1Decimals: number;
  fee: number;
  tickSpacing: number;
}

const ZERO: Address = '0x0000000000000000000000000000000000000000';

// currency0 must be numerically < currency1 (address(0) is always smallest)
export const POOL_PRESETS: Record<number, PoolPreset[]> = {
  // ── Ethereum (1) ──
  1: [
    {
      label: 'ETH / USDC',
      currency0: ZERO,
      currency1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USDC',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'ETH / USDT',
      currency0: ZERO,
      currency1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USDT',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'WBTC / ETH',
      currency0: ZERO,
      currency1: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      currency0Symbol: 'ETH',
      currency1Symbol: 'WBTC',
      currency0Decimals: 18,
      currency1Decimals: 8,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'USDC / USDT',
      currency0: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      currency1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      currency0Symbol: 'USDC',
      currency1Symbol: 'USDT',
      currency0Decimals: 6,
      currency1Decimals: 6,
      fee: 100,
      tickSpacing: 1,
    },
  ],

  // ── Unichain (130) ──
  130: [
    {
      label: 'ETH / USDC',
      currency0: ZERO,
      currency1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USDC',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'ETH / USD₮0',
      currency0: ZERO,
      currency1: '0x9151434b16b9763660705744891fA906F660EcC5',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USD₮0',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 3000,
      tickSpacing: 60,
    },
  ],

  // ── Arbitrum (42161) ──
  42161: [
    {
      label: 'ETH / USDC',
      currency0: ZERO,
      currency1: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USDC',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'ETH / USDT',
      currency0: ZERO,
      currency1: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USDT',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'WBTC / ETH',
      currency0: ZERO,
      currency1: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
      currency0Symbol: 'ETH',
      currency1Symbol: 'WBTC',
      currency0Decimals: 18,
      currency1Decimals: 8,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'USDC / USDT',
      currency0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
      currency1: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      currency0Symbol: 'USDT',
      currency1Symbol: 'USDC',
      currency0Decimals: 6,
      currency1Decimals: 6,
      fee: 100,
      tickSpacing: 1,
    },
  ],

  // ── Base (8453) ──
  8453: [
    {
      label: 'ETH / USDC',
      currency0: ZERO,
      currency1: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USDC',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'ETH / cbBTC',
      currency0: ZERO,
      currency1: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      currency0Symbol: 'ETH',
      currency1Symbol: 'cbBTC',
      currency0Decimals: 18,
      currency1Decimals: 8,
      fee: 3000,
      tickSpacing: 60,
    },
  ],

  // ── BNB Chain (56) ──
  56: [
    {
      label: 'BNB / USDT',
      currency0: ZERO,
      currency1: '0x55d398326f99059fF775485246999027B3197955',
      currency0Symbol: 'BNB',
      currency1Symbol: 'USDT',
      currency0Decimals: 18,
      currency1Decimals: 18,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'BNB / USDC',
      currency0: ZERO,
      currency1: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      currency0Symbol: 'BNB',
      currency1Symbol: 'USDC',
      currency0Decimals: 18,
      currency1Decimals: 18,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'BNB / BTCB',
      currency0: ZERO,
      currency1: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      currency0Symbol: 'BNB',
      currency1Symbol: 'BTCB',
      currency0Decimals: 18,
      currency1Decimals: 18,
      fee: 3000,
      tickSpacing: 60,
    },
    {
      label: 'ETH / BNB',
      currency0: ZERO,
      currency1: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      currency0Symbol: 'BNB',
      currency1Symbol: 'ETH',
      currency0Decimals: 18,
      currency1Decimals: 18,
      fee: 3000,
      tickSpacing: 60,
    },
  ],
};

export function getPresetsForChain(chainId: number | null): PoolPreset[] {
  if (chainId == null) return [];
  return POOL_PRESETS[chainId] ?? [];
}

export function isNativeToken(address: Address): boolean {
  return address === ZERO;
}
