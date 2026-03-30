import type { Address } from 'viem';

const address = import.meta.env.VITE_GRIDHOOK_ADDRESS;
if (!address) {
  console.warn('VITE_GRIDHOOK_ADDRESS is not set. Contract calls will fail.');
}

export const GRIDHOOK_ADDRESS: Address = (address as Address) ?? '0x0000000000000000000000000000000000000000';

export const EXPLORER_BASE_URL = 'https://unichain.blockscout.com';

export function txUrl(hash: string): string {
  return `${EXPLORER_BASE_URL}/tx/${hash}`;
}

export function addressUrl(addr: string): string {
  return `${EXPLORER_BASE_URL}/address/${addr}`;
}
