export interface StrategyPreset {
  label: string;
  description: string;
  icon: string;
  gridSpacing: number;
  maxOrders: number;
  rebalanceThresholdBps: number;
  distributionType: number;
  autoRebalance: boolean;
  isCustom: boolean;
}

export const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    label: 'Conservative',
    description: 'Wide grid, few orders, low rebalance frequency. Best for stable pairs or long-term holds.',
    icon: '🛡',
    gridSpacing: 200,
    maxOrders: 5,
    rebalanceThresholdBps: 400,
    distributionType: 0, // Flat
    autoRebalance: false,
    isCustom: false,
  },
  {
    label: 'Moderate',
    description: 'Balanced spacing with sigmoid distribution. Good all-around strategy for volatile pairs.',
    icon: '⚖',
    gridSpacing: 60,
    maxOrders: 10,
    rebalanceThresholdBps: 200,
    distributionType: 4, // Sigmoid
    autoRebalance: true,
    isCustom: false,
  },
  {
    label: 'Aggressive',
    description: 'Tight grid, many orders, concentrated liquidity. Maximizes fees in high-volume pools.',
    icon: '⚡',
    gridSpacing: 10,
    maxOrders: 30,
    rebalanceThresholdBps: 100,
    distributionType: 3, // Fibonacci
    autoRebalance: true,
    isCustom: false,
  },
  {
    label: 'Custom',
    description: 'Configure all parameters manually for full control over your grid strategy.',
    icon: '⚙',
    gridSpacing: 60,
    maxOrders: 10,
    rebalanceThresholdBps: 200,
    distributionType: 0, // Flat
    autoRebalance: true,
    isCustom: true,
  },
];

export const DIST_LABELS = ['Flat', 'Linear', 'Reverse Linear', 'Fibonacci', 'Sigmoid', 'Logarithmic'];

export const DIST_DESCRIPTIONS: Record<number, string> = {
  0: 'Equal liquidity across all positions',
  1: 'Increasing liquidity from edges to center',
  2: 'Decreasing liquidity from edges to center',
  3: 'Fibonacci-weighted concentration',
  4: 'S-curve distribution — smooth center focus',
  5: 'Logarithmic — gentle concentration',
};
