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
    {
      label: 'ETH / USDC',
      currency0: ZERO,
      currency1: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USDC',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 500,
      tickSpacing: 10,
    },
    {
      label: 'ETH / USD₮0',
      currency0: ZERO,
      currency1: '0x9151434b16b9763660705744891fA906F660EcC5',
      currency0Symbol: 'ETH',
      currency1Symbol: 'USD₮0',
      currency0Decimals: 18,
      currency1Decimals: 6,
      fee: 500,
      tickSpacing: 10,
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
