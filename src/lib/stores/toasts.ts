import { writable } from 'svelte/store';

export type ToastType = 'info' | 'success' | 'error' | 'pending';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  txHash?: string;
}

let nextId = 1;
const AUTO_DISMISS_MS = 5000;

export const toasts = writable<Toast[]>([]);

export function addToast(type: ToastType, message: string, txHash?: string): number {
  const id = nextId++;
  toasts.update((t) => [...t, { id, type, message, txHash }]);

  if (type === 'success' || type === 'info') {
    setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
  }

  return id;
}

export function updateToast(id: number, updates: Partial<Omit<Toast, 'id'>>) {
  toasts.update((t) =>
    t.map((toast) => (toast.id === id ? { ...toast, ...updates } : toast))
  );

  if (updates.type === 'success' || updates.type === 'info') {
    setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
  }
}

export function removeToast(id: number) {
  toasts.update((t) => t.filter((toast) => toast.id !== id));
}
