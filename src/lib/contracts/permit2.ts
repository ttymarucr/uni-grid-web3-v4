import { readContract, writeContract, waitForTransactionReceipt } from '@wagmi/core';
import { config } from '$lib/wagmi/client';
import { PERMIT2_ADDRESS } from './config';
import permit2Abi from './abi/Permit2.json';
import type { Address } from 'viem';

function cfg() {
  return config;
}

const erc20ApproveAbi = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const abi = permit2Abi as readonly any[];

// ── ERC-20 → Permit2 approval ──

export async function approveTokenForPermit2(token: Address, amount: bigint) {
  const hash = await writeContract(cfg(), {
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'approve',
    args: [PERMIT2_ADDRESS, amount],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export async function getTokenAllowanceForPermit2(token: Address, owner: Address): Promise<bigint> {
  const result = await readContract(cfg(), {
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'allowance',
    args: [owner, PERMIT2_ADDRESS],
  });
  return BigInt(result as any);
}

// ── Permit2 → Hook allowance ──

export async function grantPermit2Allowance(
  token: Address,
  hookAddress: Address,
  amount: bigint,
  expiration: number
) {
  const hash = await writeContract(cfg(), {
    address: PERMIT2_ADDRESS,
    abi,
    functionName: 'approve',
    args: [token, hookAddress, amount, expiration],
  });
  return { hash, wait: () => waitForTransactionReceipt(cfg(), { hash }) };
}

export interface Permit2Allowance {
  amount: bigint;
  expiration: number;
  nonce: number;
}

export async function getPermit2Allowance(
  user: Address,
  token: Address,
  hookAddress: Address
): Promise<Permit2Allowance> {
  const result = await readContract(cfg(), {
    address: PERMIT2_ADDRESS,
    abi,
    functionName: 'allowance',
    args: [user, token, hookAddress],
  });
  const r = result as any;
  return {
    amount: BigInt(r[0] ?? r.amount),
    expiration: Number(r[1] ?? r.expiration),
    nonce: Number(r[2] ?? r.nonce),
  };
}
