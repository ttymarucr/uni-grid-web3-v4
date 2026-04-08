import { writable } from 'svelte/store';
import { parseTokenAmount } from '$lib/contracts/tickMath';
import { resolveTickSpacingFromFee, hasValidTokenDecimals } from '$lib/contracts/gridUiShared';
import { tokenLabel } from '$lib/contracts/gridUiShared';
import { getTokenBalance, getTokenDecimals, getTokenSymbol } from '$lib/contracts/permit2';
import {
  alignTick,
  computeGridOrders,
  getAccumulatedFees,
  getGridConfig,
  getGridOrders,
  getPlannedWeights,
  getPoolManagerSlot0,
  getPoolState,
  getUserState,
  previewWeights,
} from '$lib/contracts/gridHook';
import { formatTokenAmount, getTokenAmountsForOrders, tickToPrice } from '$lib/contracts/tickMath';
import type { Address } from 'viem';
import type { GridConfig, GridOrder, OrderFees, PoolKey, PoolState, UserGridState } from '$lib/contracts/gridHook';

export type GridView = 'positions' | 'wizard' | 'manage';

export interface GridControllerUiState {
  view: GridView;
  wizardStep: number;
  advancedMode: boolean;
}

export function createGridControllerStore(initial?: Partial<GridControllerUiState>) {
  const defaults: GridControllerUiState = {
    view: 'positions',
    wizardStep: 1,
    advancedMode: false,
  };

  const { subscribe, set, update } = writable<GridControllerUiState>({ ...defaults, ...initial });

  return {
    subscribe,
    set,
    setView(view: GridView) {
      update(state => ({ ...state, view }));
    },
    setWizardStep(wizardStep: number) {
      update(state => ({ ...state, wizardStep }));
    },
    setAdvancedMode(advancedMode: boolean) {
      update(state => ({ ...state, advancedMode }));
    },
    resetForView(view: GridView) {
      update(state => ({ ...state, view, wizardStep: 1 }));
    },
  };
}

export function areTokenDecimalsReady(params: {
  currency0Decimals: number;
  currency1Decimals: number;
  currency0DecimalsResolved: boolean;
  currency1DecimalsResolved: boolean;
}): boolean {
  return hasValidTokenDecimals(params.currency0Decimals)
    && hasValidTokenDecimals(params.currency1Decimals)
    && params.currency0DecimalsResolved
    && params.currency1DecimalsResolved;
}

export function applyTickSpacingFromFee(nextFee: number, currentTickSpacing: number): number {
  const resolved = resolveTickSpacingFromFee(nextFee);
  if (resolved == null || currentTickSpacing === resolved) return currentTickSpacing;
  return resolved;
}

export function buildPoolKey(params: {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hookAddress: Address;
}): PoolKey {
  return {
    currency0: params.currency0 as Address,
    currency1: params.currency1 as Address,
    fee: params.fee,
    tickSpacing: params.tickSpacing,
    hooks: params.hookAddress,
  };
}

export function buildDesiredGridConfig(params: {
  cfgGridSpacing: number;
  cfgMaxOrders: number;
  cfgRebalanceBps: number;
  cfgDistType: number;
  cfgAutoRebalance: boolean;
  cfgMaxSlippageDelta0: string;
  cfgMaxSlippageDelta1: string;
  currency0Decimals: number;
  currency1Decimals: number;
}): GridConfig {
  return {
    gridSpacing: params.cfgGridSpacing,
    maxOrders: params.cfgMaxOrders,
    rebalanceThresholdBps: params.cfgRebalanceBps,
    distributionType: params.cfgDistType,
    autoRebalance: params.cfgAutoRebalance,
    maxSlippageDelta0: parseTokenAmount(params.cfgMaxSlippageDelta0, params.currency0Decimals),
    maxSlippageDelta1: parseTokenAmount(params.cfgMaxSlippageDelta1, params.currency1Decimals),
  };
}

export function getNativeDeployValue(params: {
  currency0: string;
  currency1: string;
  estimatedAmount0: bigint;
  estimatedAmount1: bigint;
  maxDelta0: bigint;
  maxDelta1: bigint;
  isNativeCurrency: (address: string) => boolean;
}): bigint {
  let value = 0n;
  if (params.isNativeCurrency(params.currency0)) value += params.estimatedAmount0 + params.maxDelta0;
  if (params.isNativeCurrency(params.currency1)) value += params.estimatedAmount1 + params.maxDelta1;
  return value;
}

export interface ChainResetState {
  selectedPresetIdx: number;
  currency0: string;
  currency1: string;
  currency0Symbol: string;
  currency1Symbol: string;
  currency0Decimals: number;
  currency1Decimals: number;
  currency0DecimalsResolved: boolean;
  currency1DecimalsResolved: boolean;
  inputAmount0: string;
  inputAmount1: string;
  balance0: bigint;
  balance1: bigint;
  refAmount0: bigint;
  refAmount1: bigint;
  poolState: PoolState | null;
  userState: UserGridState | null;
  gridConfig: GridConfig | null;
  gridOrders: GridOrder[];
  plannedWeights: bigint[];
  referenceTick: number | null;
  deployedPositions: unknown[];
  hasScanned: boolean;
  view: GridView;
  wizardStep: number;
}

export function createChainResetState(initialView: GridView = 'positions'): ChainResetState {
  return {
    selectedPresetIdx: -1,
    currency0: '',
    currency1: '',
    currency0Symbol: '',
    currency1Symbol: '',
    currency0Decimals: 18,
    currency1Decimals: 18,
    currency0DecimalsResolved: false,
    currency1DecimalsResolved: false,
    inputAmount0: '',
    inputAmount1: '',
    balance0: 0n,
    balance1: 0n,
    refAmount0: 0n,
    refAmount1: 0n,
    poolState: null,
    userState: null,
    gridConfig: null,
    gridOrders: [],
    plannedWeights: [],
    referenceTick: null,
    deployedPositions: [],
    hasScanned: false,
    view: initialView,
    wizardStep: 1,
  };
}

export interface ResolveTokenDecimalsParams {
  chainId: number;
  selectedPreset: unknown | undefined;
  currency0: string;
  currency1: string;
  currency0Symbol: string;
  currency1Symbol: string;
  currency0Decimals: number;
  currency1Decimals: number;
  tokenDecimalsCache: Map<string, number>;
  tokenSymbolCache: Map<string, string>;
  addToast: (level: 'error' | 'info' | 'success', message: string) => void;
}

export interface ResolveTokenDecimalsResult {
  ok: boolean;
  currency0Decimals: number;
  currency1Decimals: number;
  currency0DecimalsResolved: boolean;
  currency1DecimalsResolved: boolean;
  currency0Symbol: string;
  currency1Symbol: string;
}

export async function resolveTokenDecimalsForSelectionAction(
  params: ResolveTokenDecimalsParams,
): Promise<ResolveTokenDecimalsResult> {
  const strictForCustom = !params.selectedPreset;

  const resolveOne = async (
    tokenAddress: string,
    currentDecimals: number,
    tokenLabelName: string,
    isPresetToken: boolean,
  ): Promise<{ ok: boolean; decimals: number; resolved: boolean }> => {
    const cacheKey = `${params.chainId}:${tokenAddress.toLowerCase()}`;
    const cached = params.tokenDecimalsCache.get(cacheKey);
    if (cached != null) return { ok: true, decimals: cached, resolved: true };

    const onChainDecimals = await getTokenDecimals(tokenAddress as Address);
    if (onChainDecimals == null || !hasValidTokenDecimals(onChainDecimals)) {
      if (strictForCustom) {
        params.addToast('error', `Could not resolve decimals for ${tokenLabelName}. Please verify the token address.`);
        return { ok: false, decimals: currentDecimals, resolved: false };
      }
      params.addToast('info', `Could not verify on-chain decimals for ${tokenLabelName}; using preset decimals.`);
      return { ok: true, decimals: currentDecimals, resolved: isPresetToken };
    }

    params.tokenDecimalsCache.set(cacheKey, onChainDecimals);
    if (isPresetToken && onChainDecimals !== currentDecimals) {
      params.addToast('info', `${tokenLabelName} decimals updated from ${currentDecimals} to ${onChainDecimals} using on-chain metadata.`);
    }
    return { ok: true, decimals: onChainDecimals, resolved: true };
  };

  const token0Name = tokenLabel(params.currency0Symbol, params.currency0);
  const token1Name = tokenLabel(params.currency1Symbol, params.currency1);

  const [t0, t1] = await Promise.all([
    resolveOne(params.currency0, params.currency0Decimals, token0Name, Boolean(params.selectedPreset)),
    resolveOne(params.currency1, params.currency1Decimals, token1Name, Boolean(params.selectedPreset)),
  ]);

  if (!t0.ok || !t1.ok) {
    return {
      ok: false,
      currency0Decimals: params.currency0Decimals,
      currency1Decimals: params.currency1Decimals,
      currency0DecimalsResolved: false,
      currency1DecimalsResolved: false,
      currency0Symbol: params.currency0Symbol,
      currency1Symbol: params.currency1Symbol,
    };
  }

  const resolveSymbol = async (address: string, current: string): Promise<string> => {
    if (current) return current;
    const cacheKey = `${params.chainId}:${address.toLowerCase()}`;
    const cached = params.tokenSymbolCache.get(cacheKey);
    if (cached) return cached;
    const sym = await getTokenSymbol(address as Address);
    if (sym) {
      params.tokenSymbolCache.set(cacheKey, sym);
      return sym;
    }
    return tokenLabel('', address);
  };

  const [sym0, sym1] = await Promise.all([
    resolveSymbol(params.currency0, params.currency0Symbol),
    resolveSymbol(params.currency1, params.currency1Symbol),
  ]);

  return {
    ok: true,
    currency0Decimals: t0.decimals,
    currency1Decimals: t1.decimals,
    currency0DecimalsResolved: t0.resolved,
    currency1DecimalsResolved: t1.resolved,
    currency0Symbol: sym0,
    currency1Symbol: sym1,
  };
}

export async function fetchTokenBalancesAction(params: {
  user: Address | undefined;
  currency0: string;
  currency1: string;
}): Promise<{ balance0: bigint; balance1: bigint } | null> {
  if (!params.user || !params.currency0 || !params.currency1) return null;
  const [balance0, balance1] = await Promise.all([
    getTokenBalance(params.currency0 as Address, params.user),
    getTokenBalance(params.currency1 as Address, params.user),
  ]);
  return { balance0, balance1 };
}

export async function fetchReferenceTickAction(params: {
  hookAddress: Address;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
}): Promise<number | null> {
  if (!params.hookAddress || !params.currency0 || !params.currency1) return null;
  const refKey: PoolKey = {
    currency0: params.currency0 as Address,
    currency1: params.currency1 as Address,
    fee: params.fee,
    tickSpacing: params.tickSpacing,
    hooks: '0x0000000000000000000000000000000000000000' as Address,
  };
  const slot0 = await getPoolManagerSlot0(params.hookAddress, refKey);
  if (slot0.sqrtPriceX96 > 0n) return slot0.tick;
  return null;
}

export function computeReferenceAmountsAction(params: {
  effectiveTick: number;
  cfgGridSpacing: number;
  tickSpacing: number;
  cfgMaxOrders: number;
  previewedWeights: bigint[];
  refLiquidity: bigint;
}): { refAmount0: bigint; refAmount1: bigint } {
  const refOrders = computeGridOrders(
    params.effectiveTick,
    params.cfgGridSpacing,
    params.tickSpacing,
    params.cfgMaxOrders,
    params.previewedWeights,
    params.refLiquidity,
  );
  const { totalAmount0, totalAmount1 } = getTokenAmountsForOrders(refOrders, params.effectiveTick);
  return { refAmount0: totalAmount0, refAmount1: totalAmount1 };
}

export async function fetchPoolDataAction(params: {
  hookAddress: Address;
  poolKey: PoolKey;
  user: Address;
  currency0Decimals: number;
  currency1Decimals: number;
}): Promise<{
  poolState: PoolState;
  userState: UserGridState;
  gridConfig: GridConfig | null;
  gridOrders: GridOrder[];
  plannedWeights: bigint[];
  orderFees: OrderFees[];
  referenceTick: number | null;
  syncedConfig: {
    cfgGridSpacing: number;
    cfgMaxOrders: number;
    cfgRebalanceBps: number;
    cfgDistType: number;
    cfgAutoRebalance: boolean;
    cfgMaxSlippageDelta0: string;
    cfgMaxSlippageDelta1: string;
  } | null;
}> {
  const [poolStateResult, userStateResult] = await Promise.all([
    getPoolState(params.hookAddress, params.poolKey),
    getUserState(params.hookAddress, params.poolKey, params.user),
  ]);

  let referenceTick: number | null = null;
  if (!poolStateResult.initialized) {
    referenceTick = await fetchReferenceTickAction({
      hookAddress: params.hookAddress,
      currency0: params.poolKey.currency0,
      currency1: params.poolKey.currency1,
      fee: params.poolKey.fee,
      tickSpacing: params.poolKey.tickSpacing,
    });
  }

  let gridConfigResult: GridConfig | null = null;
  let gridOrdersResult: GridOrder[] = [];
  let plannedWeightsResult: bigint[] = [];
  let orderFeesResult: OrderFees[] = [];
  let syncedConfig: {
    cfgGridSpacing: number;
    cfgMaxOrders: number;
    cfgRebalanceBps: number;
    cfgDistType: number;
    cfgAutoRebalance: boolean;
    cfgMaxSlippageDelta0: string;
    cfgMaxSlippageDelta1: string;
  } | null = null;

  if (userStateResult.deployed) {
    const [cfg, orders, weights, fees] = await Promise.all([
      getGridConfig(params.hookAddress, params.poolKey, params.user),
      getGridOrders(params.hookAddress, params.poolKey, params.user),
      getPlannedWeights(params.hookAddress, params.poolKey, params.user),
      getAccumulatedFees(params.hookAddress, params.poolKey, params.user),
    ]);
    gridConfigResult = cfg;
    gridOrdersResult = orders;
    plannedWeightsResult = weights;
    orderFeesResult = fees;
    syncedConfig = {
      cfgGridSpacing: cfg.gridSpacing,
      cfgMaxOrders: cfg.maxOrders,
      cfgRebalanceBps: cfg.rebalanceThresholdBps,
      cfgDistType: cfg.distributionType,
      cfgAutoRebalance: cfg.autoRebalance,
      cfgMaxSlippageDelta0: formatTokenAmount(cfg.maxSlippageDelta0, params.currency0Decimals),
      cfgMaxSlippageDelta1: formatTokenAmount(cfg.maxSlippageDelta1, params.currency1Decimals),
    };
  }

  return {
    poolState: poolStateResult,
    userState: userStateResult,
    gridConfig: gridConfigResult,
    gridOrders: gridOrdersResult,
    plannedWeights: plannedWeightsResult,
    orderFees: orderFeesResult,
    referenceTick,
    syncedConfig,
  };
}

export function previewWeightsAction(params: {
  cfgMaxOrders: number;
  cfgDistType: number;
}): bigint[] {
  return previewWeights(params.cfgMaxOrders, params.cfgDistType);
}

export function computeGridOrdersPreviewAction(params: {
  effectiveTick: number;
  cfgGridSpacing: number;
  tickSpacing: number;
  cfgMaxOrders: number;
  previewedWeights: bigint[];
  deployLiquidity: string;
}): GridOrder[] {
  return computeGridOrders(
    params.effectiveTick,
    params.cfgGridSpacing,
    params.tickSpacing,
    params.cfgMaxOrders,
    params.previewedWeights,
    BigInt(params.deployLiquidity),
  );
}

export interface RebalanceEstimate {
  netDelta0: bigint;
  netDelta1: bigint;
  newCenter: number;
  oldCenter: number;
  thresholdMet: boolean;
  newOrders: GridOrder[];
}

export function estimateRebalanceDelta(params: {
  gridOrders: GridOrder[];
  gridConfig: GridConfig;
  plannedWeights: bigint[];
  currentTick: number;
  oldCenter: number;
  tickSpacing: number;
}): RebalanceEstimate {
  const { gridOrders, gridConfig, plannedWeights, currentTick, oldCenter, tickSpacing } = params;

  const totalLiquidity = gridOrders.reduce((sum, o) => sum + o.liquidity, 0n);
  const currentAmounts = getTokenAmountsForOrders(gridOrders, currentTick);

  const newCenter = alignTick(currentTick, tickSpacing);

  // Check threshold (mirrors contract logic)
  const tickDelta = Math.abs(newCenter - oldCenter);
  const minTickDelta = Math.trunc(
    (gridConfig.gridSpacing * gridConfig.rebalanceThresholdBps) / 10_000,
  );
  const thresholdMet = minTickDelta === 0 || tickDelta >= minTickDelta;

  const newOrders = computeGridOrders(
    newCenter,
    gridConfig.gridSpacing,
    tickSpacing,
    gridConfig.maxOrders,
    plannedWeights,
    totalLiquidity,
  );
  const newAmounts = getTokenAmountsForOrders(newOrders, currentTick);

  return {
    netDelta0: newAmounts.totalAmount0 - currentAmounts.totalAmount0,
    netDelta1: newAmounts.totalAmount1 - currentAmounts.totalAmount1,
    newCenter,
    oldCenter,
    thresholdMet,
    newOrders,
  };
}

export function computeNativeRebalanceValue(params: {
  currency0: string;
  currency1: string;
  netDelta0: bigint;
  netDelta1: bigint;
  maxSlippageDelta0: bigint;
  maxSlippageDelta1: bigint;
  isNativeCurrency: (address: string) => boolean;
}): bigint {
  let value = 0n;
  // Only attach value for native currencies where the user owes the pool (positive net delta)
  if (params.isNativeCurrency(params.currency0) && params.netDelta0 > 0n) {
    value += params.netDelta0 + params.maxSlippageDelta0;
  }
  if (params.isNativeCurrency(params.currency1) && params.netDelta1 > 0n) {
    value += params.netDelta1 + params.maxSlippageDelta1;
  }
  return value;
}

export function computeLiquidityFromAmount0(params: {
  raw0: bigint;
  refAmount0: bigint;
  refAmount1: bigint;
  refLiquidity: bigint;
  currency1Decimals: number;
}): { deployLiquidity: string; derivedAmount1Text: string } {
  if (params.raw0 === 0n || params.refAmount0 === 0n) {
    return { deployLiquidity: '', derivedAmount1Text: '' };
  }
  const liq = (params.raw0 * params.refLiquidity) / params.refAmount0;
  if (params.refAmount1 > 0n) {
    const derived1 = (liq * params.refAmount1) / params.refLiquidity;
    return {
      deployLiquidity: liq.toString(),
      derivedAmount1Text: formatTokenAmount(derived1, params.currency1Decimals),
    };
  }
  return { deployLiquidity: liq.toString(), derivedAmount1Text: '0' };
}

export function computeLiquidityFromAmount1(params: {
  raw1: bigint;
  refAmount0: bigint;
  refAmount1: bigint;
  refLiquidity: bigint;
  currency0Decimals: number;
}): { deployLiquidity: string; derivedAmount0Text: string } {
  if (params.raw1 === 0n || params.refAmount1 === 0n) {
    return { deployLiquidity: '', derivedAmount0Text: '' };
  }
  const liq = (params.raw1 * params.refLiquidity) / params.refAmount1;
  if (params.refAmount0 > 0n) {
    const derived0 = (liq * params.refAmount0) / params.refLiquidity;
    return {
      deployLiquidity: liq.toString(),
      derivedAmount0Text: formatTokenAmount(derived0, params.currency0Decimals),
    };
  }
  return { deployLiquidity: liq.toString(), derivedAmount0Text: '0' };
}

export interface GridAprResult {
  apr: number;
  elapsedSeconds: number;
}

export function computeGridApr(params: {
  totalFees0: bigint;
  totalFees1: bigint;
  gridOrders: GridOrder[];
  currentTick: number;
  lastActionTimestamp: number;
  currency0Decimals: number;
  currency1Decimals: number;
}): GridAprResult | null {
  const nowSec = Math.floor(Date.now() / 1000);
  const elapsed = nowSec - params.lastActionTimestamp;
  if (params.lastActionTimestamp <= 0 || elapsed < 60) return null;

  const amounts = getTokenAmountsForOrders(params.gridOrders, params.currentTick);
  if (amounts.totalAmount0 === 0n && amounts.totalAmount1 === 0n) return null;

  const price = tickToPrice(params.currentTick);
  const d0 = params.currency0Decimals;
  const d1 = params.currency1Decimals;

  const toFloat0 = (v: bigint) => Number(v) / 10 ** d0;
  const toFloat1 = (v: bigint) => Number(v) / 10 ** d1;

  const capitalInToken1 = toFloat0(amounts.totalAmount0) * price + toFloat1(amounts.totalAmount1);
  if (capitalInToken1 <= 0) return null;

  const feesInToken1 = toFloat0(params.totalFees0) * price + toFloat1(params.totalFees1);
  if (feesInToken1 <= 0) return null;

  const SECONDS_PER_YEAR = 365 * 86400;
  const apr = (feesInToken1 / capitalInToken1) * (SECONDS_PER_YEAR / elapsed) * 100;

  return { apr, elapsedSeconds: elapsed };
}
