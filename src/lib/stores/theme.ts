import { writable } from 'svelte/store';

const STORAGE_KEY = 'ingrid-theme';

export const darkMode = writable(false);

export function initTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = stored ? stored === 'dark' : prefersDark;
  darkMode.set(isDark);
  applyClass(isDark);
}

export function toggleTheme(): void {
  darkMode.update((v) => {
    const next = !v;
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    applyClass(next);
    return next;
  });
}

function applyClass(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark);
}
