import type { GridOrder } from './gridHook';

const Q96 = 1n << 96n;
const MAX_TICK = 887272;

function mulDiv(a: bigint, b: bigint, c: bigint): bigint {
  return (a * b) / c;
}

function mulDivRoundingUp(a: bigint, b: bigint, c: bigint): bigint {
  const result = (a * b) / c;
  if ((a * b) % c > 0n) return result + 1n;
  return result;
}

function divRoundingUp(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export function getSqrtPriceAtTick(tick: number): bigint {
  const absTick = Math.abs(tick);
  if (absTick > MAX_TICK) throw new Error(`Invalid tick: ${tick}`);

  let price: bigint;
  if (absTick & 0x1) {
    price = 0xfffcb933bd6fad37aa2d162d1a594001n;
  } else {
    price = 1n << 128n;
  }
  if (absTick & 0x2) price = (price * 0xfff97272373d413259a46990580e213an) >> 128n;
  if (absTick & 0x4) price = (price * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if (absTick & 0x8) price = (price * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if (absTick & 0x10) price = (price * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if (absTick & 0x20) price = (price * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if (absTick & 0x40) price = (price * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if (absTick & 0x80) price = (price * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if (absTick & 0x100) price = (price * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if (absTick & 0x200) price = (price * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if (absTick & 0x400) price = (price * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if (absTick & 0x800) price = (price * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if (absTick & 0x1000) price = (price * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if (absTick & 0x2000) price = (price * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if (absTick & 0x4000) price = (price * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if (absTick & 0x8000) price = (price * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if (absTick & 0x10000) price = (price * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if (absTick & 0x20000) price = (price * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if (absTick & 0x40000) price = (price * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if (absTick & 0x80000) price = (price * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) {
    price = ((1n << 256n) - 1n) / price;
  }

  // Q128.128 → Q64.96, rounding up
  return (price + ((1n << 32n) - 1n)) >> 32n;
}

export function getAmount0Delta(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint,
  roundUp: boolean = true,
): bigint {
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
  }
  if (sqrtPriceAX96 <= 0n) return 0n;

  const numerator1 = liquidity << 96n;
  const numerator2 = sqrtPriceBX96 - sqrtPriceAX96;

  if (roundUp) {
    return divRoundingUp(
      mulDivRoundingUp(numerator1, numerator2, sqrtPriceBX96),
      sqrtPriceAX96,
    );
  }
  return mulDiv(numerator1, numerator2, sqrtPriceBX96) / sqrtPriceAX96;
}

export function getAmount1Delta(
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint,
  roundUp: boolean = true,
): bigint {
  const numerator =
    sqrtPriceAX96 > sqrtPriceBX96
      ? sqrtPriceAX96 - sqrtPriceBX96
      : sqrtPriceBX96 - sqrtPriceAX96;

  if (roundUp) {
    return mulDivRoundingUp(liquidity, numerator, Q96);
  }
  return mulDiv(liquidity, numerator, Q96);
}

export function getAmountsForLiquidity(
  sqrtPriceX96: bigint,
  sqrtPriceAX96: bigint,
  sqrtPriceBX96: bigint,
  liquidity: bigint,
): { amount0: bigint; amount1: bigint } {
  if (sqrtPriceAX96 > sqrtPriceBX96) {
    [sqrtPriceAX96, sqrtPriceBX96] = [sqrtPriceBX96, sqrtPriceAX96];
  }

  if (sqrtPriceX96 <= sqrtPriceAX96) {
    return {
      amount0: getAmount0Delta(sqrtPriceAX96, sqrtPriceBX96, liquidity, true),
      amount1: 0n,
    };
  } else if (sqrtPriceX96 >= sqrtPriceBX96) {
    return {
      amount0: 0n,
      amount1: getAmount1Delta(sqrtPriceAX96, sqrtPriceBX96, liquidity, true),
    };
  }
  return {
    amount0: getAmount0Delta(sqrtPriceX96, sqrtPriceBX96, liquidity, true),
    amount1: getAmount1Delta(sqrtPriceAX96, sqrtPriceX96, liquidity, true),
  };
}

export function getTokenAmountsForOrders(
  orders: GridOrder[],
  currentTick: number,
): { totalAmount0: bigint; totalAmount1: bigint } {
  const sqrtPriceX96 = getSqrtPriceAtTick(currentTick);
  let totalAmount0 = 0n;
  let totalAmount1 = 0n;

  for (const order of orders) {
    if (order.liquidity === 0n) continue;
    const sqrtPriceAX96 = getSqrtPriceAtTick(order.tickLower);
    const sqrtPriceBX96 = getSqrtPriceAtTick(order.tickUpper);
    const { amount0, amount1 } = getAmountsForLiquidity(
      sqrtPriceX96,
      sqrtPriceAX96,
      sqrtPriceBX96,
      order.liquidity,
    );
    totalAmount0 += amount0;
    totalAmount1 += amount1;
  }

  return { totalAmount0, totalAmount1 };
}

const SUBSCRIPT_DIGITS = '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089';

/** Convert a number to Unicode subscript digits, e.g. 4 → "₄", 12 → "₁₂" */
export function toSubscript(n: number): string {
  return String(n).split('').map(ch => SUBSCRIPT_DIGITS[Number(ch)] ?? ch).join('');
}

/**
 * Format a small decimal with subscript leading-zero count.
 * e.g. 0.00000939 → "0.0₅939" (5 leading zeros, then significant digits).
 * Returns null if the format doesn't apply.
 */
export function formatSmallDecimal(value: string): string | null {
  const m = value.match(/^0\.(0{2,})(\d+)$/);
  if (!m) return null;
  const leadingZeros = m[1].length;
  const significant = m[2].replace(/0+$/, '');
  if (!significant) return null;
  return `0.0${toSubscript(leadingZeros)}${significant}`;
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const fractionStr = remainder.toString().padStart(decimals, '0');
  const trimmed = fractionStr.slice(0, 6).replace(/0+$/, '');
  if (trimmed === '') return whole.toString();
  const plain = `${whole}.${trimmed}`;
  if (whole === 0n) {
    const sub = formatSmallDecimal(plain);
    if (sub) return sub;
  }
  return plain;
}

export function formatRawTokenAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  const fractionStr = remainder.toString().padStart(decimals, '0');
  return `${whole}.${fractionStr}`;
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  const s = amount.trim();
  if (!s || s === '.') return 0n;
  const parts = s.split('.');
  if (parts.length > 2) return 0n;
  const whole = parts[0] || '0';
  let frac = parts[1] || '';
  if (frac.length > decimals) frac = frac.slice(0, decimals);
  else frac = frac.padEnd(decimals, '0');
  const raw = whole + frac;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

/**
 * Convert a Uniswap V4 tick to a price.
 * Returns the price of token0 denominated in token1: price = 1.0001^tick
 */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}
