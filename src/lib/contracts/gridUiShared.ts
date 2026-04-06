export const WIZARD_STEPS = ['Pool', 'Strategy', 'Preview', 'Deploy'] as const;

export const SLIPPAGE_OPTIONS = [
  { label: 'None', value: '0' },
  { label: '0.1%', value: '10' },
  { label: '0.5%', value: '50' },
  { label: '1%', value: '100' },
  { label: '3%', value: '300' },
] as const;

export const FEE_OPTIONS = [
  { label: '0.01%', value: 100 },
  { label: '0.05%', value: 500 },
  { label: '0.3%', value: 3000 },
  { label: '1%', value: 10000 },
] as const;

const FEE_TO_TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

export function resolveTickSpacingFromFee(nextFee: number): number | null {
  if (!Number.isFinite(nextFee)) return null;
  return FEE_TO_TICK_SPACING[nextFee] ?? null;
}

export function hasValidTokenDecimals(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

export function tokenLabel(symbol: string, addr: string): string {
  if (symbol) return symbol;
  if (!addr) return '-';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function mismatchBps(entered: bigint, estimated: bigint): bigint {
  if (entered === 0n && estimated === 0n) return 0n;
  if (estimated === 0n) return 10000n;
  const diff = absBigInt(entered - estimated);
  return (diff * 10000n) / estimated;
}

export function parseBpsInput(value: string): bigint {
  try {
    return BigInt(value || '0');
  } catch {
    return 0n;
  }
}
