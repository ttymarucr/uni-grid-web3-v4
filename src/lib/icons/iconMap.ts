/**
 * Canonical mapping from token symbols and chain IDs to Iconify icon identifiers.
 *
 * Icon set: "cryptocurrency-color" (coloured crypto logos).
 * Fallback: monogram chip rendered by the component layer.
 */

// ── Token symbol → Iconify icon ID ──
// Keys are UPPERCASE. Aliases (USD₮0, cbBTC, BTCB, …) are mapped to the
// same visual as their canonical counterpart.
const TOKEN_ICON_MAP: Record<string, string> = {
  ETH:   'cryptocurrency-color:eth',
  WETH:  'cryptocurrency-color:eth',
  USDC:  'cryptocurrency-color:usdc',
  USDT:  'cryptocurrency-color:usdt',
  'USD₮0': 'cryptocurrency-color:usdt',
  BTC:   'cryptocurrency-color:btc',
  WBTC:  'cryptocurrency-color:btc',
  CBBTC: 'cryptocurrency-color:btc',
  BTCB:  'cryptocurrency-color:btc',
  BNB:   'cryptocurrency-color:bnb',
  DAI:   'cryptocurrency-color:dai',
  UNI:   'cryptocurrency-color:uni',
};

// ── Chain ID → Iconify icon ID ──
const CHAIN_ICON_MAP: Record<number, string> = {
  1:     'cryptocurrency-color:eth',   // Ethereum
  130:   'cryptocurrency-color:uni',   // Unichain
  42161: 'cryptocurrency-color:eth',   // Arbitrum (no crypto-color entry)
  8453:  'cryptocurrency-color:eth',   // Base (L2 of Ethereum)
  56:    'cryptocurrency-color:bnb',   // BNB Chain
};

// ── Strategy label → Iconify icon ID (replaces emoji) ──
const STRATEGY_ICON_MAP: Record<string, string> = {
  Conservative: 'lucide:shield',
  Moderate:     'lucide:scale',
  Aggressive:   'lucide:zap',
  Custom:       'lucide:settings',
};

// ── Public API ──

/** Resolve a token symbol to an Iconify icon ID (or `null` if unmapped). */
export function getTokenIconId(symbol: string): string | null {
  const key = symbol.trim().toUpperCase();
  return TOKEN_ICON_MAP[key] ?? TOKEN_ICON_MAP[symbol.trim()] ?? null;
}

/** Resolve a chain ID to an Iconify icon ID (or `null` if unmapped). */
export function getChainIconId(chainId: number): string | null {
  return CHAIN_ICON_MAP[chainId] ?? null;
}

/** Resolve a strategy label to an Iconify icon ID (or `null` if unmapped). */
export function getStrategyIconId(label: string): string | null {
  return STRATEGY_ICON_MAP[label] ?? null;
}

/**
 * Generate a short monogram string (1–4 chars) for use as a text-based
 * fallback when no icon is available.
 */
export function getMonogram(symbol: string): string {
  const s = symbol.trim();
  if (s.length <= 4) return s.toUpperCase();
  return s.slice(0, 4).toUpperCase();
}
