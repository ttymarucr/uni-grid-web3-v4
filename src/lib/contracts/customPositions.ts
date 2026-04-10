import type { Address } from 'viem';
import type { PoolPreset } from './poolPresets';

export interface StoredPosition {
  currency0: Address;
  currency1: Address;
  currency0Symbol: string;
  currency1Symbol: string;
  currency0Decimals: number;
  currency1Decimals: number;
  fee: number;
  tickSpacing: number;
}

function storageKey(chainId: number, user: string): string {
  return `uni-grid:positions:${chainId}:${user.toLowerCase()}`;
}

function isSamePool(a: StoredPosition, b: StoredPosition): boolean {
  return (
    a.currency0.toLowerCase() === b.currency0.toLowerCase() &&
    a.currency1.toLowerCase() === b.currency1.toLowerCase() &&
    a.fee === b.fee &&
    a.tickSpacing === b.tickSpacing
  );
}

function toPreset(pos: StoredPosition): PoolPreset {
  const s0 = pos.currency0Symbol || `${pos.currency0.slice(0, 6)}…`;
  const s1 = pos.currency1Symbol || `${pos.currency1.slice(0, 6)}…`;
  return {
    ...pos,
    label: `${s0} / ${s1}`,
  };
}

export function getStoredPositions(chainId: number | null, user: string | null): PoolPreset[] {
  if (chainId == null || !user) return [];
  try {
    const raw = localStorage.getItem(storageKey(chainId, user));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (p: any) =>
          typeof p.currency0 === 'string' &&
          typeof p.currency1 === 'string' &&
          typeof p.fee === 'number' &&
          typeof p.tickSpacing === 'number',
      )
      .map(toPreset);
  } catch {
    return [];
  }
}

export function savePosition(chainId: number | null, user: string | null, pos: StoredPosition): void {
  if (chainId == null || !user) return;
  const key = storageKey(chainId, user);
  let existing: StoredPosition[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) existing = arr;
    }
  } catch {
    existing = [];
  }
  if (existing.some((e) => isSamePool(e, pos))) return;
  existing.push(pos);
  localStorage.setItem(key, JSON.stringify(existing));
}

export function removePosition(chainId: number | null, user: string | null, pos: StoredPosition): void {
  if (chainId == null || !user) return;
  const key = storageKey(chainId, user);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const filtered = arr.filter((e: StoredPosition) => !isSamePool(e, pos));
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch {
    // ignore
  }
}
