<script lang="ts">
  import { connected, signerAddress, chainId as chainIdStore } from '$lib/stores/wallet';
  import { getGridHookAddress } from '$lib/contracts/config';
  import { executeTransaction } from '$lib/contracts/txWrapper';
  import { addToast } from '$lib/stores/toasts';
  import {
    getGridConfig,
    getPoolState,
    getUserState,
    getGridOrders,
    getPlannedWeights,
    previewWeights,
    computeGridOrders,
    setGridConfig as writeSetGridConfig,
    deployGrid as writeDeployGrid,
    rebalance as writeRebalance,
    closeGrid as writeCloseGrid,
    setRebalanceKeeper as writeSetKeeper,
    getDeadline,
    isGridConfigEqual,
    getPoolManagerSlot0,
    getPoolManagerAddress,
    initializePool,
    type PoolKey,
    type GridConfig,
    type PoolState,
    type UserGridState,
    type GridOrder,
  } from '$lib/contracts/gridHook';
  import {
    approveTokenForPermit2,
    getTokenAllowanceForPermit2,
    grantPermit2Allowance,
    getPermit2Allowance,
    getTokenBalance,
    getTokenDecimals,
  } from '$lib/contracts/permit2';
  import { getPresetsForChain, isNativeToken } from '$lib/contracts/poolPresets';
  import { getTokenAmountsForOrders, formatTokenAmount, parseTokenAmount, getAmountsForLiquidity, getSqrtPriceAtTick, tickToPrice } from '$lib/contracts/tickMath';
  import { STRATEGY_PRESETS, DIST_LABELS, DIST_DESCRIPTIONS } from '$lib/contracts/strategyPresets';
  import WeightChart from './WeightChart.svelte';
  import GridOrdersChart from './GridOrdersChart.svelte';
  import type { Address } from 'viem';

  // ── Style classes ──
  const inputCls = 'py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1';
  const btnPrimary = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-white hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnOutline = 'cursor-pointer rounded-xl py-2.5 px-5 font-bold text-sm bg-transparent text-accent border border-accent hover:bg-glow disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnDanger = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const card = 'bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card';
  const labelCls = 'text-[0.78rem] font-bold text-muted uppercase tracking-wide';
  const statLabel = 'text-[0.72rem] font-bold text-muted uppercase tracking-wider';

  // ── State machine ──
  let view: 'positions' | 'wizard' | 'manage' = 'positions';
  let wizardStep = 1;
  let advancedMode = false;
  const WIZARD_STEPS = ['Pool', 'Strategy', 'Preview', 'Deploy'];
  const SLIPPAGE_OPTIONS = [
    { label: 'None', value: '0' },
    { label: '0.1%', value: '10' },
    { label: '0.5%', value: '50' },
    { label: '1%', value: '100' },
    { label: '3%', value: '300' },
  ];
  const FEE_OPTIONS = [
    { label: '0.01%', value: 100 },
    { label: '0.05%', value: 500 },
    { label: '0.3%', value: 3000 },
    { label: '1%', value: 10000 },
  ];
  const FEE_TO_TICK_SPACING: Record<number, number> = {
    100: 1,
    500: 10,
    3000: 60,
    10000: 200,
  };

  // ── Deployed positions ──
  interface DeployedPosition {
    preset: import('$lib/contracts/poolPresets').PoolPreset;
    poolState: PoolState;
    userState: UserGridState;
    gridConfig: GridConfig;
    orderCount: number;
    activeOrders: number;
  }
  let deployedPositions: DeployedPosition[] = [];
  let scanningPositions = false;
  let hasScanned = false;

  async function scanDeployedPositions() {
    const user = $signerAddress as Address;
    if (!user || !hookAddress) return;
    scanningPositions = true;
    const found: DeployedPosition[] = [];
    const chainPresets = getPresetsForChain($chainIdStore);
    await Promise.all(
      chainPresets.map(async (preset) => {
        try {
          const key: PoolKey = {
            currency0: preset.currency0,
            currency1: preset.currency1,
            fee: preset.fee,
            tickSpacing: preset.tickSpacing,
            hooks: hookAddress,
          };
          const us = await getUserState(hookAddress, key, user);
          if (!us.deployed) return;
          const [ps, cfg, orders] = await Promise.all([
            getPoolState(hookAddress, key),
            getGridConfig(hookAddress, key, user),
            getGridOrders(hookAddress, key, user),
          ]);
          found.push({
            preset,
            poolState: ps,
            userState: us,
            gridConfig: cfg,
            orderCount: orders.length,
            activeOrders: orders.filter(o => o.liquidity > 0n).length,
          });
        } catch {
          // Skip pools that fail (not initialized, etc.)
        }
      }),
    );
    deployedPositions = found;
    scanningPositions = false;
    hasScanned = true;
  }

  // Scan on connect
  $: if ($connected && $signerAddress && hookAddress) {
    scanDeployedPositions();
  }

  // After scan, if no positions found, go to wizard
  $: if (hasScanned && view === 'positions' && deployedPositions.length === 0) {
    view = 'wizard';
    wizardStep = 1;
  }

  // ── Hook address ──
  $: hookAddress = getGridHookAddress($chainIdStore);

  // ── Pool preset state ──
  let selectedPresetIdx = -1;
  let currency0 = '';
  let currency1 = '';
  let fee = 3000;
  let customFee = false;
  let tickSpacing = 60;
  let currency0Symbol = '';
  let currency1Symbol = '';
  let currency0Decimals = 18;
  let currency1Decimals = 18;
  let currency0DecimalsResolved = false;
  let currency1DecimalsResolved = false;
  const tokenDecimalsCache = new Map<string, number>();

  $: presets = getPresetsForChain($chainIdStore ?? 0);

  function selectPreset(idx: number) {
    selectedPresetIdx = idx;
    const p = presets[idx];
    if (p) {
      currency0 = p.currency0;
      currency1 = p.currency1;
      fee = p.fee;
      customFee = !FEE_OPTIONS.some(o => o.value === p.fee);
      tickSpacing = p.tickSpacing;
      currency0Symbol = p.currency0Symbol;
      currency1Symbol = p.currency1Symbol;
      currency0Decimals = p.currency0Decimals;
      currency1Decimals = p.currency1Decimals;
      currency0DecimalsResolved = true;
      currency1DecimalsResolved = true;
    }
  }

  function hasValidTokenDecimals(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 255;
  }

  function areTokenDecimalsReady(): boolean {
    return hasValidTokenDecimals(currency0Decimals)
      && hasValidTokenDecimals(currency1Decimals)
      && currency0DecimalsResolved
      && currency1DecimalsResolved;
  }

  async function resolveTokenDecimalsForSelection(): Promise<boolean> {
    const selectedPreset = selectedPresetIdx >= 0 ? presets[selectedPresetIdx] : undefined;
    const strictForCustom = !selectedPreset;

    const resolveOne = async (
      tokenAddress: string,
      currentDecimals: number,
      tokenLabelName: string,
      isPresetToken: boolean,
    ): Promise<{ ok: boolean; decimals: number; resolved: boolean }> => {
      const cacheKey = `${$chainIdStore ?? 0}:${tokenAddress.toLowerCase()}`;
      const cached = tokenDecimalsCache.get(cacheKey);
      if (cached != null) return { ok: true, decimals: cached, resolved: true };

      const onChainDecimals = await getTokenDecimals(tokenAddress as Address);
      if (onChainDecimals == null || !hasValidTokenDecimals(onChainDecimals)) {
        if (strictForCustom) {
          addToast('error', `Could not resolve decimals for ${tokenLabelName}. Please verify the token address.`);
          return { ok: false, decimals: currentDecimals, resolved: false };
        }
        addToast('info', `Could not verify on-chain decimals for ${tokenLabelName}; using preset decimals.`);
        return { ok: true, decimals: currentDecimals, resolved: isPresetToken };
      }

      tokenDecimalsCache.set(cacheKey, onChainDecimals);
      if (isPresetToken && onChainDecimals !== currentDecimals) {
        addToast('info', `${tokenLabelName} decimals updated from ${currentDecimals} to ${onChainDecimals} using on-chain metadata.`);
      }
      return { ok: true, decimals: onChainDecimals, resolved: true };
    };

    const token0Name = tokenLabel(currency0Symbol, currency0);
    const token1Name = tokenLabel(currency1Symbol, currency1);

    const [t0, t1] = await Promise.all([
      resolveOne(currency0, currency0Decimals, token0Name, Boolean(selectedPreset)),
      resolveOne(currency1, currency1Decimals, token1Name, Boolean(selectedPreset)),
    ]);

    if (!t0.ok || !t1.ok) return false;

    currency0Decimals = t0.decimals;
    currency1Decimals = t1.decimals;
    currency0DecimalsResolved = t0.resolved;
    currency1DecimalsResolved = t1.resolved;
    return true;
  }

  function resolveTickSpacingFromFee(nextFee: number): number | null {
    if (!Number.isFinite(nextFee)) return null;
    return FEE_TO_TICK_SPACING[nextFee] ?? null;
  }

  function applyTickSpacingFromFee(nextFee: number) {
    const resolved = resolveTickSpacingFromFee(nextFee);
    if (resolved == null || tickSpacing === resolved) return;
    tickSpacing = resolved;
  }

  function onFeeSelectChange(e: Event) {
    const v = (e.target as HTMLSelectElement | null)?.value;
    if (!v) return;
    if (v === 'custom') {
      customFee = true;
      return;
    }
    customFee = false;
    fee = Number(v);
    applyTickSpacingFromFee(fee);
  }

  $: mappedTickSpacing = resolveTickSpacingFromFee(fee);
  $: hasMappedTickSpacing = mappedTickSpacing != null;
  $: {
    fee;
    applyTickSpacingFromFee(fee);
  }

  function tokenLabel(symbol: string, addr: string): string {
    if (symbol) return symbol;
    if (!addr) return '\u2014';
    return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
  }

  function isNativeCurrency(addr: string): boolean {
    return isNativeToken(addr as Address);
  }

  function buildPoolKey(): PoolKey {
    return {
      currency0: currency0 as Address,
      currency1: currency1 as Address,
      fee,
      tickSpacing,
      hooks: hookAddress,
    };
  }

  // ── Chain change detection ──
  let prevChain = $chainIdStore;
  $: if ($chainIdStore !== prevChain) {
    prevChain = $chainIdStore;
    selectedPresetIdx = -1;
    currency0 = '';
    currency1 = '';
    currency0Symbol = '';
    currency1Symbol = '';
    currency0Decimals = 18;
    currency1Decimals = 18;
    currency0DecimalsResolved = false;
    currency1DecimalsResolved = false;
    tokenDecimalsCache.clear();
    inputAmount0 = '';
    inputAmount1 = '';
    balance0 = 0n;
    balance1 = 0n;
    refAmount0 = 0n;
    refAmount1 = 0n;
    poolState = null;
    userState = null;
    gridConfig = null;
    gridOrders = [];
    plannedWeights = [];
    referenceTick = null;
    deployedPositions = [];
    hasScanned = false;
    view = 'positions';
    wizardStep = 1;
  }

  // ── Strategy state ──
  let selectedStrategyIdx = -1;
  let cfgGridSpacing = 60;
  let cfgMaxOrders = 10;
  let cfgRebalanceBps = 200;
  let cfgDistType = 0;
  let cfgAutoRebalance = true;
  let cfgMaxSlippageDelta0 = '0';
  let cfgMaxSlippageDelta1 = '0';

  function selectStrategy(idx: number) {
    selectedStrategyIdx = idx;
    const s = STRATEGY_PRESETS[idx];
    if (s && !s.isCustom) {
      cfgGridSpacing = s.gridSpacing;
      cfgMaxOrders = s.maxOrders;
      cfgRebalanceBps = s.rebalanceThresholdBps;
      cfgDistType = s.distributionType;
      cfgAutoRebalance = s.autoRebalance;
    }
  }

  // ── Grid spacing alignment helpers (must be multiples of pool tick spacing) ──
  $: spacingStep = Math.max(1, Number.isFinite(tickSpacing) ? tickSpacing : 1);

  function normalizeGridSpacing(value: number): number {
    if (!Number.isFinite(value) || value < spacingStep) return spacingStep;
    const normalized = Math.round(value / spacingStep) * spacingStep;
    return Math.max(spacingStep, normalized);
  }

  function handleGridSpacingChange(e: Event) {
    const raw = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(raw)) cfgGridSpacing = normalizeGridSpacing(raw);
  }

  // Keep spacing valid if strategy/pool changes make it misaligned.
  $: {
    const normalized = normalizeGridSpacing(cfgGridSpacing);
    if (normalized !== cfgGridSpacing) cfgGridSpacing = normalized;
  }

  // ── Read state ──
  let poolState: PoolState | null = null;
  let userState: UserGridState | null = null;
  let gridConfig: GridConfig | null = null;
  let gridOrders: GridOrder[] = [];
  let plannedWeights: bigint[] = [];
  let loadingData = false;

  // ── Reference tick (from PoolManager when grid pool not initialized) ──
  let referenceTick: number | null = null;
  $: usingReferenceTick = poolState != null && !poolState.initialized && referenceTick != null;
  $: effectiveTick = poolState ? (poolState.initialized ? poolState.currentTick : (referenceTick ?? 0)) : 0;

  // Price of token1 per token0 (adjusted for decimals)
  $: priceToken1PerToken0 = tickToPrice(effectiveTick) * Math.pow(10, currency0Decimals - currency1Decimals);
  $: priceToken0PerToken1 = priceToken1PerToken0 > 0 ? 1 / priceToken1PerToken0 : 0;

  function formatPrice(price: number): string {
    if (price === 0) return '0';
    if (price >= 1_000_000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    // For very small prices, show enough significant digits
    const digits = Math.max(2, -Math.floor(Math.log10(price)) + 3);
    return price.toFixed(Math.min(digits, 18));
  }

  // ── Preview state ──
  let previewedWeights: bigint[] = [];
  let previewedOrders: GridOrder[] = [];
  let loadingPreview = false;

  // ── Deploy state ──
  let deployLiquidity = '';
  let inputAmount0 = '';
  let inputAmount1 = '';
  let balance0 = 0n;
  let balance1 = 0n;
  let refAmount0 = 0n;
  let refAmount1 = 0n;
  let loadingBalances = false;
  const REF_LIQUIDITY = 10n ** 18n;
  let deployMaxDelta0 = '0';
  let deployMaxDelta1 = '0';
  let customDelta0 = false;
  let customDelta1 = false;

  $: isCustomDelta0 = customDelta0 || !SLIPPAGE_OPTIONS.some(p => p.value === deployMaxDelta0);
  $: isCustomDelta1 = customDelta1 || !SLIPPAGE_OPTIONS.some(p => p.value === deployMaxDelta1);
  $: deltaSelectVal0 = isCustomDelta0 ? 'custom' : deployMaxDelta0;
  $: deltaSelectVal1 = isCustomDelta1 ? 'custom' : deployMaxDelta1;

  function onDeltaChange(e: Event, isT0: boolean) {
    const val = (e.target as HTMLSelectElement).value;
    if (val === 'custom') {
      if (isT0) customDelta0 = true;
      else customDelta1 = true;
    } else {
      if (isT0) { customDelta0 = false; deployMaxDelta0 = val; }
      else { customDelta1 = false; deployMaxDelta1 = val; }
    }
  }

  let deploying = false;
  let deployStepLabel = '';
  let deadlineMinutes = 5;
  const AMOUNT_MISMATCH_WARN_BPS = 100n; // 1%

  const MAX_UINT160 = (1n << 160n) - 1n;
  const permit2Expiration = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

  // ── Token balance & amount logic ──

  async function fetchBalances() {
    const user = $signerAddress as Address;
    if (!user || !currency0 || !currency1) return;
    loadingBalances = true;
    try {
      const [b0, b1] = await Promise.all([
        getTokenBalance(currency0 as Address, user),
        getTokenBalance(currency1 as Address, user),
      ]);
      balance0 = b0;
      balance1 = b1;
    } catch {
      // Silent — balance display is best-effort
    } finally {
      loadingBalances = false;
    }
  }

  async function fetchReferenceTick() {
    if (!hookAddress || !currency0 || !currency1) return;
    try {
      const refKey: PoolKey = {
        currency0: currency0 as Address,
        currency1: currency1 as Address,
        fee,
        tickSpacing,
        hooks: '0x0000000000000000000000000000000000000000' as Address,
      };
      const slot0 = await getPoolManagerSlot0(hookAddress, refKey);
      if (slot0.sqrtPriceX96 > 0n) {
        referenceTick = slot0.tick;
      } else {
        referenceTick = null;
      }
    } catch {
      referenceTick = null;
    }
  }

  async function computeReferenceAmounts() {
    if (!hookAddress || !poolState || previewedWeights.length === 0) return;
    const tick = effectiveTick;
    try {
      const refOrders = await computeGridOrders(
        hookAddress,
        tick,
        cfgGridSpacing,
        tickSpacing,
        cfgMaxOrders,
        previewedWeights,
        REF_LIQUIDITY,
      );
      const { totalAmount0, totalAmount1 } = getTokenAmountsForOrders(refOrders, tick);
      refAmount0 = totalAmount0;
      refAmount1 = totalAmount1;
    } catch {
      refAmount0 = 0n;
      refAmount1 = 0n;
    }
  }

  function computeFromAmount0(raw0: bigint) {
    if (raw0 === 0n || refAmount0 === 0n) {
      deployLiquidity = '';
      inputAmount1 = '';
      return;
    }
    const liq = (raw0 * REF_LIQUIDITY) / refAmount0;
    deployLiquidity = liq.toString();
    if (refAmount1 > 0n) {
      const derived1 = (liq * refAmount1) / REF_LIQUIDITY;
      inputAmount1 = formatTokenAmount(derived1, currency1Decimals);
    } else {
      inputAmount1 = '0';
    }
  }

  function computeFromAmount1(raw1: bigint) {
    if (raw1 === 0n || refAmount1 === 0n) {
      deployLiquidity = '';
      inputAmount0 = '';
      return;
    }
    const liq = (raw1 * REF_LIQUIDITY) / refAmount1;
    deployLiquidity = liq.toString();
    if (refAmount0 > 0n) {
      const derived0 = (liq * refAmount0) / REF_LIQUIDITY;
      inputAmount0 = formatTokenAmount(derived0, currency0Decimals);
    } else {
      inputAmount0 = '0';
    }
  }

  function onAmount0Input() {
    const raw = parseTokenAmount(inputAmount0, currency0Decimals);
    computeFromAmount0(raw);
  }

  function onAmount1Input() {
    const raw = parseTokenAmount(inputAmount1, currency1Decimals);
    computeFromAmount1(raw);
  }

  function setPercentage(token: 0 | 1, pct: number) {
    const raw = token === 0
      ? (balance0 * BigInt(pct)) / 100n
      : (balance1 * BigInt(pct)) / 100n;
    if (token === 0) {
      inputAmount0 = formatTokenAmount(raw, currency0Decimals);
      computeFromAmount0(raw);
    } else {
      inputAmount1 = formatTokenAmount(raw, currency1Decimals);
      computeFromAmount1(raw);
    }
  }

  // ── Fetch pool data ──
  async function fetchPoolData(): Promise<boolean> {
    if (!currency0 || !currency1) {
      addToast('error', 'Please select or enter both token addresses');
      return false;
    }
    const user = $signerAddress as Address;
    if (!user) {
      addToast('error', 'Wallet not connected');
      return false;
    }
    loadingData = true;
    try {
      const key = buildPoolKey();
      const [ps, us] = await Promise.all([
        getPoolState(hookAddress, key),
        getUserState(hookAddress, key, user),
      ]);
      poolState = ps;
      userState = us;

      // Fetch reference tick from canonical pool when grid not initialized
      if (!ps.initialized) {
        await fetchReferenceTick();
      } else {
        referenceTick = null;
      }

      if (us.deployed) {
        const [cfg, orders, weights] = await Promise.all([
          getGridConfig(hookAddress, key, user),
          getGridOrders(hookAddress, key, user),
          getPlannedWeights(hookAddress, key, user),
        ]);
        gridConfig = cfg;
        gridOrders = orders;
        plannedWeights = weights;
        // Sync local state from on-chain config
        cfgGridSpacing = cfg.gridSpacing;
        cfgMaxOrders = cfg.maxOrders;
        cfgRebalanceBps = cfg.rebalanceThresholdBps;
        cfgDistType = cfg.distributionType;
        cfgAutoRebalance = cfg.autoRebalance;
        cfgMaxSlippageDelta0 = formatTokenAmount(cfg.maxSlippageDelta0, currency0Decimals);
        cfgMaxSlippageDelta1 = formatTokenAmount(cfg.maxSlippageDelta1, currency1Decimals);
      }
      return true;
    } catch (e: any) {
      addToast('error', `Fetch failed: ${e.shortMessage || e.message}`);
      return false;
    } finally {
      loadingData = false;
    }
  }

  // ── Wizard navigation ──
  async function handlePoolNext() {
    const decimalsOk = await resolveTokenDecimalsForSelection();
    if (!decimalsOk) return;
    const ok = await fetchPoolData();
    if (!ok) return;
    if (userState?.deployed) {
      view = 'manage';
    } else {
      wizardStep = 2;
    }
  }

  function openPosition(pos: DeployedPosition) {
    currency0 = pos.preset.currency0;
    currency1 = pos.preset.currency1;
    fee = pos.preset.fee;
    tickSpacing = pos.preset.tickSpacing;
    currency0Symbol = pos.preset.currency0Symbol;
    currency1Symbol = pos.preset.currency1Symbol;
    currency0Decimals = pos.preset.currency0Decimals;
    currency1Decimals = pos.preset.currency1Decimals;
    currency0DecimalsResolved = true;
    currency1DecimalsResolved = true;
    selectedPresetIdx = presets.indexOf(pos.preset);
    poolState = pos.poolState;
    userState = pos.userState;
    gridConfig = pos.gridConfig;
    cfgGridSpacing = pos.gridConfig.gridSpacing;
    cfgMaxOrders = pos.gridConfig.maxOrders;
    cfgRebalanceBps = pos.gridConfig.rebalanceThresholdBps;
    cfgDistType = pos.gridConfig.distributionType;
    cfgAutoRebalance = pos.gridConfig.autoRebalance;
    cfgMaxSlippageDelta0 = formatTokenAmount(pos.gridConfig.maxSlippageDelta0, currency0Decimals);
    cfgMaxSlippageDelta1 = formatTokenAmount(pos.gridConfig.maxSlippageDelta1, currency1Decimals);
    fetchPoolData();
    view = 'manage';
  }

  function startNewGrid() {
    selectedPresetIdx = -1;
    currency0 = '';
    currency1 = '';
    currency0Symbol = '';
    currency1Symbol = '';
    currency0Decimals = 18;
    currency1Decimals = 18;
    currency0DecimalsResolved = false;
    currency1DecimalsResolved = false;
    poolState = null;
    userState = null;
    gridConfig = null;
    gridOrders = [];
    plannedWeights = [];
    selectedStrategyIdx = -1;
    view = 'wizard';
    wizardStep = 1;
  }

  function goBackToPositions() {
    if (deployedPositions.length > 0) {
      view = 'positions';
    } else {
      view = 'wizard';
      wizardStep = 1;
    }
  }

  function handleStrategyNext() {
    if (selectedStrategyIdx < 0 && !advancedMode) {
      addToast('error', 'Please select a strategy');
      return;
    }
    previewedOrders = [];
    inputAmount0 = '';
    inputAmount1 = '';
    deployLiquidity = '';
    wizardStep = 3;
    triggerWeightPreview();
    fetchBalances();
  }

  async function handlePreviewNext() {
    if (!deployLiquidity) {
      addToast('error', 'Please enter token amounts');
      return;
    }
    await handleComputeOrders();
    wizardStep = 4;
  }

  // ── Reactive weight preview (debounced) ──
  let previewTimer: ReturnType<typeof setTimeout> | undefined;

  function triggerWeightPreview() {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(doWeightPreview, 300);
  }

  async function doWeightPreview() {
    if (!hookAddress || cfgMaxOrders < 1) return;
    loadingPreview = true;
    try {
      previewedWeights = await previewWeights(hookAddress, cfgMaxOrders, cfgDistType);
      await computeReferenceAmounts();
    } catch {
      // Silent — preview is best-effort
    } finally {
      loadingPreview = false;
    }
  }

  // Trigger preview when config changes on strategy/preview step
  $: if (wizardStep >= 2) {
    cfgMaxOrders; cfgDistType;
    triggerWeightPreview();
  }

  async function handleComputeOrders() {
    if (!poolState || !deployLiquidity || previewedWeights.length === 0) return;
    try {
      previewedOrders = await computeGridOrders(
        hookAddress,
        effectiveTick,
        cfgGridSpacing,
        tickSpacing,
        cfgMaxOrders,
        previewedWeights,
        BigInt(deployLiquidity),
      );
    } catch (e: any) {
      addToast('error', `Order preview failed: ${e.shortMessage || e.message}`);
    }
  }

  // ── Zero-liquidity order detection ──
  $: zeroOrderCount = previewedOrders.filter(o => o.liquidity === 0n).length;
  $: activeOrderCount = previewedOrders.length - zeroOrderCount;

  // ── Estimated token amounts for previewed orders ──
  $: estimatedAmounts = (previewedOrders.length > 0 && poolState)
    ? getTokenAmountsForOrders(previewedOrders, effectiveTick)
    : { totalAmount0: 0n, totalAmount1: 0n };

  $: enteredAmount0Raw = parseTokenAmount(inputAmount0, currency0Decimals);
  $: enteredAmount1Raw = parseTokenAmount(inputAmount1, currency1Decimals);

  function absBigInt(value: bigint): bigint {
    return value < 0n ? -value : value;
  }

  function mismatchBps(entered: bigint, estimated: bigint): bigint {
    if (entered === 0n && estimated === 0n) return 0n;
    if (estimated === 0n) return 10000n;
    const diff = absBigInt(entered - estimated);
    return (diff * 10000n) / estimated;
  }

  $: mismatch0Bps = mismatchBps(enteredAmount0Raw, estimatedAmounts.totalAmount0);
  $: mismatch1Bps = mismatchBps(enteredAmount1Raw, estimatedAmounts.totalAmount1);
  $: hasAmountMismatchWarning = mismatch0Bps > AMOUNT_MISMATCH_WARN_BPS || mismatch1Bps > AMOUNT_MISMATCH_WARN_BPS;

  function getNativeDeployValue(maxD0: bigint, maxD1: bigint): bigint {
    let value = 0n;
    if (isNativeCurrency(currency0)) value += estimatedAmounts.totalAmount0 + maxD0;
    if (isNativeCurrency(currency1)) value += estimatedAmounts.totalAmount1 + maxD1;
    return value;
  }

  function parseBpsInput(value: string): bigint {
    try {
      return BigInt(value || '0');
    } catch {
      return 0n;
    }
  }

  $: nativeDeployValue = getNativeDeployValue(
    (estimatedAmounts.totalAmount0 * parseBpsInput(deployMaxDelta0)) / 10000n,
    (estimatedAmounts.totalAmount1 * parseBpsInput(deployMaxDelta1)) / 10000n,
  );

  // ── Estimated token amounts for on-chain grid orders ──
  $: gridAmounts = (gridOrders.length > 0 && poolState)
    ? getTokenAmountsForOrders(gridOrders, effectiveTick)
    : { totalAmount0: 0n, totalAmount1: 0n };

  function orderAmounts(order: GridOrder, currentTick: number): { amount0: bigint; amount1: bigint } {
    if (order.liquidity === 0n) return { amount0: 0n, amount1: 0n };
    const sqrtPriceX96 = getSqrtPriceAtTick(currentTick);
    const sqrtPriceAX96 = getSqrtPriceAtTick(order.tickLower);
    const sqrtPriceBX96 = getSqrtPriceAtTick(order.tickUpper);
    return getAmountsForLiquidity(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, order.liquidity);
  }

  // ── Pool needs initialization? ──
  $: needsPoolInit = poolState != null && !poolState.initialized;

  // ── Unified deploy flow ──
  function buildDesiredGridConfig(): GridConfig {
    return {
      gridSpacing: cfgGridSpacing,
      maxOrders: cfgMaxOrders,
      rebalanceThresholdBps: cfgRebalanceBps,
      distributionType: cfgDistType,
      autoRebalance: cfgAutoRebalance,
      maxSlippageDelta0: parseTokenAmount(cfgMaxSlippageDelta0, currency0Decimals),
      maxSlippageDelta1: parseTokenAmount(cfgMaxSlippageDelta1, currency1Decimals),
    };
  }

  async function handleUnifiedDeploy() {
    const user = $signerAddress as Address;
    if (!user) return;
    if (!areTokenDecimalsReady()) {
      addToast('error', 'Token decimals are not resolved. Please go back and verify pool tokens.');
      wizardStep = 1;
      return;
    }
    deploying = true;
    try {
      // 0. Initialize pool in PoolManager (if not yet initialized)
      if (needsPoolInit) {
        deployStepLabel = 'Initializing pool in PoolManager\u2026';
        const sqrtPrice = getSqrtPriceAtTick(effectiveTick);
        const poolMgr = await getPoolManagerAddress(hookAddress);
        await executeTransaction('Initialize Pool', () =>
          initializePool(poolMgr, buildPoolKey(), sqrtPrice),
        );
        // Re-fetch pool state so subsequent steps see initialized = true
        const ps = await getPoolState(hookAddress, buildPoolKey());
        if (ps) poolState = ps;
      }

      // 1. Set grid config
      deployStepLabel = 'Checking grid configuration\u2026';
      const key = buildPoolKey();
      const desiredConfig = buildDesiredGridConfig();
      const onChainConfig = await getGridConfig(hookAddress, key, user);
      if (isGridConfigEqual(desiredConfig, onChainConfig)) {
        addToast('info', 'Grid configuration unchanged, skipping Set Config transaction');
      } else {
        deployStepLabel = 'Setting grid configuration\u2026';
        await executeTransaction('Set Grid Config', () =>
          writeSetGridConfig(hookAddress, key, desiredConfig),
        );
      }

      // 2. Token approvals (skip native)
      const tokens = [
        { addr: currency0, label: tokenLabel(currency0Symbol, currency0) },
        { addr: currency1, label: tokenLabel(currency1Symbol, currency1) },
      ];
      for (const tok of tokens) {
        if (isNativeCurrency(tok.addr)) continue;

        deployStepLabel = `Checking ${tok.label} allowance\u2026`;
        const erc20 = await getTokenAllowanceForPermit2(tok.addr as Address, user);
        if (erc20 < MAX_UINT160 / 2n) {
          deployStepLabel = `Approving ${tok.label} for Permit2\u2026`;
          await executeTransaction(`Approve ${tok.label}`, () =>
            approveTokenForPermit2(tok.addr as Address, MAX_UINT160),
          );
        }

        const p2 = await getPermit2Allowance(user, tok.addr as Address, hookAddress);
        if (p2.amount < MAX_UINT160 / 2n) {
          deployStepLabel = `Granting ${tok.label} hook allowance\u2026`;
          await executeTransaction(`Grant ${tok.label} Allowance`, () =>
            grantPermit2Allowance(tok.addr as Address, hookAddress, MAX_UINT160, permit2Expiration()),
          );
        }
      }

      // 3. Deploy grid
      deployStepLabel = 'Deploying grid\u2026';
      const bps0 = BigInt(deployMaxDelta0 || '0');
      const bps1 = BigInt(deployMaxDelta1 || '0');
      const maxD0 = bps0 === 0n ? 0n : estimatedAmounts.totalAmount0 * bps0 / 10000n;
      const maxD1 = bps1 === 0n ? 0n : estimatedAmounts.totalAmount1 * bps1 / 10000n;
      const nativeValue = getNativeDeployValue(maxD0, maxD1);
      await executeTransaction('Deploy Grid', () =>
        writeDeployGrid(
          hookAddress,
          buildPoolKey(),
          BigInt(deployLiquidity),
          maxD0,
          maxD1,
          getDeadline(deadlineMinutes),
          nativeValue,
        ),
      );

      addToast('success', 'Grid deployed successfully!');
      await fetchPoolData();
      view = 'manage';
    } catch (e: any) {
      addToast('error', `Deploy failed: ${e.shortMessage || e.message}`);
    } finally {
      deploying = false;
      deployStepLabel = '';
    }
  }

  // ── Management actions ──
  let pendingRebalance = false;
  let pendingClose = false;

  async function handleRebalance() {
    const user = $signerAddress as Address;
    if (!user) return;
    pendingRebalance = true;
    await executeTransaction('Rebalance', () =>
      writeRebalance(hookAddress, buildPoolKey(), user, getDeadline(deadlineMinutes)),
    );
    pendingRebalance = false;
    await fetchPoolData();
  }

  async function handleCloseGrid() {
    pendingClose = true;
    await executeTransaction('Close Grid', () =>
      writeCloseGrid(hookAddress, buildPoolKey(), getDeadline(deadlineMinutes)),
    );
    pendingClose = false;
    poolState = null;
    userState = null;
    gridConfig = null;
    gridOrders = [];
    plannedWeights = [];
    await scanDeployedPositions();
    if (deployedPositions.length > 0) {
      view = 'positions';
    } else {
      view = 'wizard';
      wizardStep = 1;
    }
  }

  // ── Keeper ──
  let keeperAddress = '';
  let keeperAuthorized = true;
  let pendingKeeper = false;
  let showKeeper = false;

  async function handleSetKeeper() {
    if (!keeperAddress) return;
    pendingKeeper = true;
    await executeTransaction(keeperAuthorized ? 'Authorize Keeper' : 'Revoke Keeper', () =>
      writeSetKeeper(hookAddress, keeperAddress as Address, keeperAuthorized),
    );
    pendingKeeper = false;
  }

  // ── Advanced: individual Permit2 buttons ──
  let pendingPermit2_0 = false;
  let pendingPermit2_1 = false;
  let pendingAllow_0 = false;
  let pendingAllow_1 = false;

  async function handleApprovePermit2(token: string, isT0: boolean) {
    if (isT0) pendingPermit2_0 = true; else pendingPermit2_1 = true;
    await executeTransaction(`Approve ${isT0 ? 'Token 0' : 'Token 1'} for Permit2`, () =>
      approveTokenForPermit2(token as Address, MAX_UINT160),
    );
    if (isT0) pendingPermit2_0 = false; else pendingPermit2_1 = false;
  }

  async function handleGrantAllowance(token: string, isT0: boolean) {
    if (isT0) pendingAllow_0 = true; else pendingAllow_1 = true;
    await executeTransaction(`Grant ${isT0 ? 'Token 0' : 'Token 1'} Allowance`, () =>
      grantPermit2Allowance(token as Address, hookAddress, MAX_UINT160, permit2Expiration()),
    );
    if (isT0) pendingAllow_0 = false; else pendingAllow_1 = false;
  }

  // Advanced: manual config & deploy
  let pendingSetConfig = false;
  async function handleManualSetConfig() {
    pendingSetConfig = true;
    try {
      const user = $signerAddress as Address;
      if (!user) return;
      const key = buildPoolKey();
      const desiredConfig = buildDesiredGridConfig();
      const onChainConfig = await getGridConfig(hookAddress, key, user);
      if (isGridConfigEqual(desiredConfig, onChainConfig)) {
        addToast('info', 'Grid configuration unchanged, skipping Set Config transaction');
        return;
      }
      await executeTransaction('Set Grid Config', () =>
        writeSetGridConfig(hookAddress, key, desiredConfig),
      );
    } finally {
      pendingSetConfig = false;
    }
  }

  let pendingManualDeploy = false;
  async function handleManualDeploy() {
    if (!deployLiquidity) return;
    if (!areTokenDecimalsReady()) {
      addToast('error', 'Token decimals are not resolved. Please go back and verify pool tokens.');
      wizardStep = 1;
      return;
    }
    pendingManualDeploy = true;
    const bps0 = BigInt(deployMaxDelta0 || '0');
    const bps1 = BigInt(deployMaxDelta1 || '0');
    const maxD0 = bps0 === 0n ? 0n : estimatedAmounts.totalAmount0 * bps0 / 10000n;
    const maxD1 = bps1 === 0n ? 0n : estimatedAmounts.totalAmount1 * bps1 / 10000n;
    const nativeValue = getNativeDeployValue(maxD0, maxD1);
    await executeTransaction('Deploy Grid', () =>
      writeDeployGrid(hookAddress, buildPoolKey(), BigInt(deployLiquidity), maxD0, maxD1, getDeadline(deadlineMinutes), nativeValue),
    );
    pendingManualDeploy = false;
  }
</script>

<div class="max-w-[1080px] mx-auto px-4 pt-8 pb-16 flex flex-col gap-6">
  <!-- Advanced mode toggle -->
  <div class="flex justify-end">
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <span class="text-[0.78rem] text-muted">{advancedMode ? 'Advanced' : 'Simple'}</span>
      <div class="relative inline-flex items-center">
        <input type="checkbox" bind:checked={advancedMode} class="sr-only peer" />
        <div class="w-9 h-5 bg-line rounded-full peer-checked:bg-accent transition-colors"></div>
        <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
      </div>
    </label>
  </div>

  {#if view === 'positions'}
    <!-- ═══════════════════════════════════════ -->
    <!-- ═══ POSITIONS VIEW ═══ -->
    <!-- ═══════════════════════════════════════ -->

    <div class="flex items-center justify-between flex-wrap gap-2">
      <h2 class="text-[1.3rem] font-extrabold">Your Grids</h2>
      <button class={btnPrimary} on:click={startNewGrid}>
        <span class="inline-flex items-center gap-1.5">&#x1FA84; Deploy a new Grid</span>
      </button>
    </div>

    {#if scanningPositions}
      <div class="flex items-center gap-3 p-6">
        <div class="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full flex-shrink-0"></div>
        <span class="text-sm text-muted">Scanning pools&hellip;</span>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each deployedPositions as pos}
          <button
            class="text-left p-5 rounded-[var(--radius-card)] border border-line bg-surface shadow-card hover:border-accent transition-colors duration-150 cursor-pointer"
            on:click={() => openPosition(pos)}
          >
            <div class="flex items-center gap-2 mb-3">
              <span class="text-lg">&#x1F4CA;</span>
              <span class="font-extrabold text-text text-[1.05rem]">{pos.preset.label}</span>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-2">
              <div class="flex flex-col gap-0.5">
                <span class={statLabel}>Distribution</span>
                <span class="text-sm font-semibold">{DIST_LABELS[pos.gridConfig.distributionType]}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class={statLabel}>Orders</span>
                <span class="text-sm font-semibold font-mono">{pos.activeOrders}<span class="text-muted font-normal">/{pos.orderCount}</span></span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class={statLabel}>Center Tick</span>
                <span class="text-sm font-semibold font-mono">{pos.userState.gridCenterTick}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class={statLabel}>Current Tick</span>
                <span class="text-sm font-semibold font-mono">{pos.poolState.currentTick}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class={statLabel}>Spacing</span>
                <span class="text-sm font-semibold font-mono">{pos.gridConfig.gridSpacing}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class={statLabel}>Auto Rebalance</span>
                <span class="text-sm font-semibold">{pos.gridConfig.autoRebalance ? 'On' : 'Off'}</span>
              </div>
            </div>
            <div class="mt-3 pt-3 border-t border-line flex items-center justify-between">
              <span class="text-[0.72rem] text-muted">Fee: {(pos.preset.fee / 10000).toFixed(2)}%</span>
              <span class="text-[0.75rem] text-accent font-bold">Manage &rarr;</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}

  {:else if view === 'wizard'}
    <!-- ═══ Wizard Stepper ═══ -->
    <nav class="flex items-center justify-center gap-0 mb-2">
      {#each WIZARD_STEPS as stepLabel, i}
        {@const num = i + 1}
        {@const active = wizardStep === num}
        {@const done = wizardStep > num}
        <button
          class="flex flex-col items-center gap-1 px-4 py-1 bg-transparent border-none cursor-pointer disabled:cursor-default transition-opacity duration-150"
          class:opacity-40={!active && !done}
          disabled={!done}
          on:click={() => { if (done) wizardStep = num; }}
        >
          <span
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors duration-150"
            class:bg-accent={active}
            class:text-white={active}
            class:text-accent={done}
            class:bg-surface-strong={!active && !done}
            class:text-muted={!active && !done}
            style={done ? 'background: rgba(23,107,82,0.15)' : ''}
          >
            {done ? '\u2713' : num}
          </span>
          <span class="text-[0.7rem] font-semibold" class:text-accent={active} class:text-muted={!active}>{stepLabel}</span>
        </button>
        {#if i < WIZARD_STEPS.length - 1}
          <div class="flex-1 h-px max-w-[3rem] transition-colors duration-150" class:bg-accent={done} class:bg-line={!done}></div>
        {/if}
      {/each}
    </nav>

    <!-- ═══ Step 1: Pool Selection ═══ -->
    {#if wizardStep === 1}
      <section class={card}>
        <h2 class="mb-1 text-[1.15rem] font-extrabold">Select Pool</h2>
        <p class="mb-4 text-muted text-[0.85rem]">Choose a trading pair{advancedMode ? ' or enter custom token addresses' : ''}.</p>

        {#if presets.length > 0}
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {#each presets as preset, i}
              <button
                class="text-left p-4 rounded-xl border-2 transition-colors duration-100 bg-transparent cursor-pointer"
                class:border-accent={selectedPresetIdx === i}
                class:border-line={selectedPresetIdx !== i}
                on:click={() => selectPreset(i)}
              >
                <span class="font-bold text-text">{preset.label}</span>
                <span class="block text-[0.72rem] text-muted mt-0.5">Fee: {(preset.fee / 10000).toFixed(2)}% &middot; Tick Spacing: {preset.tickSpacing}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="mb-4 text-muted text-sm">No presets for this chain. Enter addresses manually.</p>
        {/if}

        {#if advancedMode || presets.length === 0}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4 mt-2">
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Currency 0</span>
              <input class={inputCls} type="text" bind:value={currency0} placeholder="0x\u2026" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Currency 1</span>
              <input class={inputCls} type="text" bind:value={currency1} placeholder="0x\u2026" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Fee</span>
              <select class={inputCls} value={customFee ? 'custom' : fee} on:change={onFeeSelectChange}>
                {#each FEE_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
                <option value="custom">Custom</option>
              </select>
              {#if customFee}
                <input
                  class={inputCls}
                  type="number"
                  bind:value={fee}
                  placeholder="e.g. 3000 = 0.3%"
                  on:change={() => applyTickSpacingFromFee(fee)}
                  on:blur={() => applyTickSpacingFromFee(fee)}
                />
              {/if}
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Tick Spacing</span>
              <input class={inputCls} type="number" bind:value={tickSpacing} disabled={hasMappedTickSpacing} />
              {#if hasMappedTickSpacing}
                <span class="text-[0.7rem] text-muted">Auto-set from fee tier ({fee}) to {mappedTickSpacing}.</span>
              {:else}
                <span class="text-[0.7rem] text-muted">No fallback mapping for this fee; set spacing manually.</span>
              {/if}
            </label>
          </div>
        {/if}

        <button class={btnPrimary} on:click={handlePoolNext} disabled={loadingData || !currency0 || !currency1}>
          {loadingData ? 'Loading\u2026' : 'Continue'}
        </button>
      </section>
    {/if}

    <!-- ═══ Step 2: Strategy Selection ═══ -->
    {#if wizardStep === 2}
      <section class={card}>
        <h2 class="mb-1 text-[1.15rem] font-extrabold">Choose Strategy</h2>
        <p class="mb-4 text-muted text-[0.85rem]">Select a grid strategy or configure custom parameters.</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {#each STRATEGY_PRESETS as preset, i}
            <button
              class="text-left p-4 rounded-xl border-2 transition-colors duration-100 bg-transparent cursor-pointer"
              class:border-accent={selectedStrategyIdx === i}
              class:border-line={selectedStrategyIdx !== i}
              on:click={() => selectStrategy(i)}
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="text-lg">{preset.icon}</span>
                <span class="font-bold text-text">{preset.label}</span>
              </div>
              <span class="block text-[0.75rem] text-muted">{preset.description}</span>
              {#if !preset.isCustom}
                <span class="block text-[0.68rem] text-accent mt-1.5">
                  {preset.maxOrders} orders &middot; {DIST_LABELS[preset.distributionType]} &middot; spacing {preset.gridSpacing}
                </span>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Custom config form -->
        {#if (selectedStrategyIdx >= 0 && STRATEGY_PRESETS[selectedStrategyIdx]?.isCustom) || advancedMode}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 mb-4 p-4 border border-line rounded-xl">
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Grid Spacing</span>
              <input
                class={inputCls}
                type="number"
                bind:value={cfgGridSpacing}
                min={spacingStep}
                step={spacingStep}
                on:change={handleGridSpacingChange}
                on:blur={handleGridSpacingChange}
              />
              <span class="text-[0.7rem] text-muted">Must be a multiple of tick spacing ({spacingStep}).</span>
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Max Orders</span>
              <input class={inputCls} type="number" bind:value={cfgMaxOrders} min="1" max="500" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Rebalance Threshold ({(cfgRebalanceBps / 100).toFixed(2)}%)</span>
              <input class={inputCls} type="number" bind:value={cfgRebalanceBps} min="0" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Distribution Type</span>
              <select class={inputCls} bind:value={cfgDistType}>
                {#each DIST_LABELS as dl, i}
                  <option value={i}>{dl}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-row items-center gap-2 self-end pb-2">
              <input class="w-[1.1rem] h-[1.1rem] accent-[var(--color-accent)]" type="checkbox" bind:checked={cfgAutoRebalance} />
              <span class={labelCls}>Auto Rebalance</span>
            </label>
            {#if advancedMode}
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Max Slippage {currency0Symbol || 'Token 0'}</span>
                <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta0} placeholder="0 = no limit" />
              </label>
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Max Slippage {currency1Symbol || 'Token 1'}</span>
                <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta1} placeholder="0 = no limit" />
              </label>
            {/if}
          </div>
        {/if}

        <!-- Distribution description -->
        {#if DIST_DESCRIPTIONS[cfgDistType]}
          <p class="text-[0.8rem] text-muted mb-3">{DIST_LABELS[cfgDistType]}: {DIST_DESCRIPTIONS[cfgDistType]}</p>
        {/if}

        <!-- Live weight preview -->
        {#if previewedWeights.length > 0}
          <div class="mt-2 mb-4">
            <WeightChart weights={previewedWeights} label="Weight Distribution Preview" />
          </div>
        {:else if loadingPreview}
          <p class="text-sm text-muted mb-4">Loading preview&hellip;</p>
        {/if}

        <div class="flex gap-3 mt-2">
          <button class={btnOutline} on:click={() => (wizardStep = 1)}>Back</button>
          <button class={btnPrimary} on:click={handleStrategyNext} disabled={selectedStrategyIdx < 0 && !advancedMode}>
            Continue
          </button>
        </div>
      </section>
    {/if}

    <!-- ═══ Step 3: Preview ═══ -->
    {#if wizardStep === 3}
      <section class={card}>
        <h2 class="mb-1 text-[1.15rem] font-extrabold">Review &amp; Preview</h2>
        <p class="mb-4 text-muted text-[0.85rem]">Verify your configuration and preview the grid layout.</p>

        <!-- Summary -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Pair</span>
            <span class="text-sm font-semibold">{tokenLabel(currency0Symbol, currency0)} / {tokenLabel(currency1Symbol, currency1)}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Distribution</span>
            <span class="text-sm font-semibold">{DIST_LABELS[cfgDistType]}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Max Orders</span>
            <span class="text-sm font-semibold font-mono">{cfgMaxOrders}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Grid Spacing</span>
            <span class="text-sm font-semibold font-mono">{cfgGridSpacing}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Rebalance Threshold</span>
            <span class="text-sm font-semibold">{(cfgRebalanceBps / 100).toFixed(2)}%</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Auto Rebalance</span>
            <span class="text-sm font-semibold">{cfgAutoRebalance ? 'On' : 'Off'}</span>
          </div>
          {#if poolState}
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>{usingReferenceTick ? 'Market Tick (approx.)' : 'Current Tick'}</span>
              <span class="text-sm font-semibold font-mono">{effectiveTick} {#if usingReferenceTick} <span class="text-[0.68rem] text-yellow-400 font-normal">via canonical pool</span>{/if}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>1 {currency0Symbol || 'Token0'} =</span>
              <span class="text-sm font-semibold font-mono">{formatPrice(priceToken1PerToken0)} {currency1Symbol || 'Token1'}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>1 {currency1Symbol || 'Token1'} =</span>
              <span class="text-sm font-semibold font-mono">{formatPrice(priceToken0PerToken1)} {currency0Symbol || 'Token0'}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>Pool Initialized</span>
              <span class="text-sm font-semibold">{poolState.initialized ? 'Yes' : 'No'}</span>
            </div>
          {/if}
        </div>

        <!-- Token amount inputs -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <!-- Token 0 -->
          <div class="flex flex-col gap-2 p-4 border border-line rounded-xl">
            <div class="flex items-center justify-between">
              <span class="font-bold text-text text-[0.9rem]">{currency0Symbol || 'Token0'} <span class="text-[0.72rem] text-muted font-normal">({currency0Decimals}d)</span></span>
              <span class="text-[0.72rem] text-muted">
                Balance: {loadingBalances ? '\u2026' : formatTokenAmount(balance0, currency0Decimals)}
              </span>
            </div>
            <input class={inputCls} type="text" bind:value={inputAmount0} on:input={onAmount0Input} placeholder="0.0" disabled={refAmount0 === 0n && refAmount1 > 0n} />
            {#if refAmount0 === 0n && refAmount1 > 0n}
              <span class="text-[0.72rem] text-muted italic">Not required for current grid range</span>
            {:else}
              <div class="flex gap-2">
                {#each [25, 50, 100] as pct}
                  <button
                    class="px-3 py-1 text-[0.72rem] font-bold rounded-lg border border-accent/30 text-accent bg-transparent hover:bg-glow cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    on:click={() => setPercentage(0, pct)}
                    disabled={balance0 === 0n}
                  >
                    {pct}%
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <!-- Token 1 -->
          <div class="flex flex-col gap-2 p-4 border border-line rounded-xl">
            <div class="flex items-center justify-between">
              <span class="font-bold text-text text-[0.9rem]">{currency1Symbol || 'Token1'} <span class="text-[0.72rem] text-muted font-normal">({currency1Decimals}d)</span></span>
              <span class="text-[0.72rem] text-muted">
                Balance: {loadingBalances ? '\u2026' : formatTokenAmount(balance1, currency1Decimals)}
              </span>
            </div>
            <input class={inputCls} type="text" bind:value={inputAmount1} on:input={onAmount1Input} placeholder="0.0" disabled={refAmount1 === 0n && refAmount0 > 0n} />
            {#if refAmount1 === 0n && refAmount0 > 0n}
              <span class="text-[0.72rem] text-muted italic">Not required for current grid range</span>
            {:else}
              <div class="flex gap-2">
                {#each [25, 50, 100] as pct}
                  <button
                    class="px-3 py-1 text-[0.72rem] font-bold rounded-lg border border-accent/30 text-accent bg-transparent hover:bg-glow cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    on:click={() => setPercentage(1, pct)}
                    disabled={balance1 === 0n}
                  >
                    {pct}%
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        {#if advancedMode}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-5">
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Max Delta 0 (slippage)</span>
              <select class={inputCls} value={deltaSelectVal0} on:change={(e) => onDeltaChange(e, true)}>
                {#each SLIPPAGE_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
                <option value="custom">Custom</option>
              </select>
              {#if isCustomDelta0}
                <input class={inputCls} type="text" bind:value={deployMaxDelta0} placeholder="Custom value" />
              {/if}
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Max Delta 1 (slippage)</span>
              <select class={inputCls} value={deltaSelectVal1} on:change={(e) => onDeltaChange(e, false)}>
                {#each SLIPPAGE_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
                <option value="custom">Custom</option>
              </select>
              {#if isCustomDelta1}
                <input class={inputCls} type="text" bind:value={deployMaxDelta1} placeholder="Custom value" />
              {/if}
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Deadline (min from now)</span>
              <input class={inputCls} type="number" bind:value={deadlineMinutes} min="1" max="60" />
            </label>
          </div>
        {/if}

        <!-- Weight chart -->
        {#if previewedWeights.length > 0}
          <WeightChart weights={previewedWeights} label="Weight Distribution" />
        {/if}

        <!-- Preview grid orders -->
        {#if deployLiquidity && previewedWeights.length > 0}
          <button class="{btnOutline} mt-4" on:click={handleComputeOrders}>
            Preview Grid Orders
          </button>
        {/if}
        {#if previewedOrders.length > 0}
          <div class="mt-4">
            <GridOrdersChart
              orders={previewedOrders}
              currentTick={effectiveTick}
              centerTick={effectiveTick}
              token0Symbol={currency0Symbol}
              token1Symbol={currency1Symbol}
              token0Decimals={currency0Decimals}
              token1Decimals={currency1Decimals}
            />
          </div>
          {#if zeroOrderCount > 0}
            <div class="mt-3 flex items-start gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-[0.85rem] text-yellow-200">
              <span class="mt-0.5 text-yellow-400">&#9888;</span>
              <span>
                <strong>{zeroOrderCount}</strong> of {previewedOrders.length} orders will be empty due to rounding
                (only <strong>{activeOrderCount}</strong> active).
                Consider using fewer orders or more liquidity.
              </span>
            </div>
          {/if}
        {/if}

        <div class="flex gap-3 mt-5">
          <button class={btnOutline} on:click={() => (wizardStep = 2)}>Back</button>
          <button class={btnPrimary} on:click={handlePreviewNext} disabled={!deployLiquidity}>
            Continue to Deploy
          </button>
        </div>
      </section>
    {/if}

    <!-- ═══ Step 4: Deploy ═══ -->
    {#if wizardStep === 4}
      <section class={card}>
        <h2 class="mb-1 text-[1.15rem] font-extrabold">Deploy Grid</h2>
        <p class="mb-4 text-muted text-[0.85rem]">This will execute multiple transactions to configure and deploy your grid.</p>

        <!-- Deploy steps overview -->
        <div class="mb-5 text-sm space-y-2">
          {#if needsPoolInit}
            <div class="flex items-start gap-2">
              <span class="text-accent font-bold min-w-[1.2rem]">0.</span>
              <span>Initialize pool in PoolManager at current market price</span>
            </div>
          {/if}
          <div class="flex items-start gap-2">
            <span class="text-accent font-bold min-w-[1.2rem]">1.</span>
            <span>Set grid configuration on-chain</span>
          </div>
          {#if !isNativeCurrency(currency0)}
            <div class="flex items-start gap-2">
              <span class="text-accent font-bold min-w-[1.2rem]">2.</span>
              <span>Approve {tokenLabel(currency0Symbol, currency0)} (ERC-20 + Permit2, if needed)</span>
            </div>
          {/if}
          {#if !isNativeCurrency(currency1)}
            <div class="flex items-start gap-2">
              <span class="text-accent font-bold min-w-[1.2rem]">{isNativeCurrency(currency0) ? '2' : '3'}.</span>
              <span>Approve {tokenLabel(currency1Symbol, currency1)} (ERC-20 + Permit2, if needed)</span>
            </div>
          {/if}
          <div class="flex items-start gap-2">
            <span class="text-accent font-bold min-w-[1.2rem]">&rArr;</span>
            <span>Deploy grid
              {#if estimatedAmounts.totalAmount0 > 0n || estimatedAmounts.totalAmount1 > 0n}
                (~{formatTokenAmount(estimatedAmounts.totalAmount0, currency0Decimals)} {currency0Symbol || 'Token0'} + ~{formatTokenAmount(estimatedAmounts.totalAmount1, currency1Decimals)} {currency1Symbol || 'Token1'})
              {/if}
            </span>
          </div>
        </div>

        <div class="mb-5 rounded-xl border border-line bg-surface-strong p-4 text-sm">
          <div class="mb-2 font-bold text-text">Pre-submit Amount Check</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="text-[0.72rem] uppercase tracking-wide text-muted">{currency0Symbol || 'Token0'}</div>
              <div class="text-text">Entered: {inputAmount0 || '0'} ({currency0Decimals}d)</div>
              <div class="text-muted text-[0.78rem] font-mono">Raw: {enteredAmount0Raw.toString()}</div>
              <div class="text-muted text-[0.78rem]">Estimated raw: {estimatedAmounts.totalAmount0.toString()}</div>
            </div>
            <div>
              <div class="text-[0.72rem] uppercase tracking-wide text-muted">{currency1Symbol || 'Token1'}</div>
              <div class="text-text">Entered: {inputAmount1 || '0'} ({currency1Decimals}d)</div>
              <div class="text-muted text-[0.78rem] font-mono">Raw: {enteredAmount1Raw.toString()}</div>
              <div class="text-muted text-[0.78rem]">Estimated raw: {estimatedAmounts.totalAmount1.toString()}</div>
            </div>
          </div>
          {#if nativeDeployValue > 0n}
            <div class="mt-3 text-[0.78rem] text-muted">
              Native ETH value to send: <span class="font-mono text-text">{formatTokenAmount(nativeDeployValue, 18)} ETH</span>
              <span class="text-muted"> (raw: {nativeDeployValue.toString()})</span>
            </div>
          {/if}
          {#if hasAmountMismatchWarning}
            <div class="mt-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-[0.8rem] text-yellow-200">
              Amount mismatch detected (&gt; 1%):
              {#if mismatch0Bps > AMOUNT_MISMATCH_WARN_BPS}
                {currency0Symbol || 'Token0'} {Number(mismatch0Bps) / 100}%
              {/if}
              {#if mismatch0Bps > AMOUNT_MISMATCH_WARN_BPS && mismatch1Bps > AMOUNT_MISMATCH_WARN_BPS}
                ,
              {/if}
              {#if mismatch1Bps > AMOUNT_MISMATCH_WARN_BPS}
                {currency1Symbol || 'Token1'} {Number(mismatch1Bps) / 100}%
              {/if}
              . Re-check entered amounts and decimals before signing.
            </div>
          {/if}
        </div>

        {#if deploying && deployStepLabel}
          <div class="flex items-center gap-3 mb-4 p-3 rounded-xl border border-accent/20" style="background: rgba(23,107,82,0.05)">
            <div class="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full flex-shrink-0"></div>
            <span class="text-sm font-medium text-text">{deployStepLabel}</span>
          </div>
        {/if}

        <div class="flex gap-3">
          <button class={btnOutline} on:click={() => (wizardStep = 3)} disabled={deploying}>Back</button>
          <button class={btnPrimary} on:click={handleUnifiedDeploy} disabled={deploying || !$connected}>
            {deploying ? 'Deploying\u2026' : 'Deploy Grid'}
          </button>
        </div>
      </section>

      <!-- Advanced: individual operations -->
      {#if advancedMode && $connected}
        <section class={card}>
          <h2 class="mb-4 text-[1.15rem] font-extrabold">Manual Operations</h2>
          <p class="mb-4 text-muted text-[0.85rem]">Execute individual steps manually instead of the unified flow.</p>

          <div class="space-y-4">
            <div>
              <button class={btnOutline} on:click={handleManualSetConfig} disabled={pendingSetConfig}>
                {pendingSetConfig ? 'Sending\u2026' : 'Set Config Only'}
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="flex flex-col gap-2">
                <span class={labelCls}>{tokenLabel(currency0Symbol, currency0)}</span>
                <button class={btnOutline} on:click={() => handleApprovePermit2(currency0, true)} disabled={pendingPermit2_0 || !currency0 || isNativeCurrency(currency0)}>
                  {pendingPermit2_0 ? 'Sending\u2026' : 'Approve for Permit2'}
                </button>
                <button class={btnOutline} on:click={() => handleGrantAllowance(currency0, true)} disabled={pendingAllow_0 || !currency0 || isNativeCurrency(currency0)}>
                  {pendingAllow_0 ? 'Sending\u2026' : 'Grant Hook Allowance'}
                </button>
              </div>
              <div class="flex flex-col gap-2">
                <span class={labelCls}>{tokenLabel(currency1Symbol, currency1)}</span>
                <button class={btnOutline} on:click={() => handleApprovePermit2(currency1, false)} disabled={pendingPermit2_1 || !currency1 || isNativeCurrency(currency1)}>
                  {pendingPermit2_1 ? 'Sending\u2026' : 'Approve for Permit2'}
                </button>
                <button class={btnOutline} on:click={() => handleGrantAllowance(currency1, false)} disabled={pendingAllow_1 || !currency1 || isNativeCurrency(currency1)}>
                  {pendingAllow_1 ? 'Sending\u2026' : 'Grant Hook Allowance'}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Total Liquidity</span>
                <input class={inputCls} type="text" bind:value={deployLiquidity} placeholder="e.g. 1000000000000000000" />
              </label>
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Max Delta 0</span>
                <select class={inputCls} value={deltaSelectVal0} on:change={(e) => onDeltaChange(e, true)}>
                  {#each SLIPPAGE_OPTIONS as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                  <option value="custom">Custom</option>
                </select>
                {#if isCustomDelta0}
                  <input class={inputCls} type="text" bind:value={deployMaxDelta0} placeholder="Custom value" />
                {/if}
              </label>
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Max Delta 1</span>
                <select class={inputCls} value={deltaSelectVal1} on:change={(e) => onDeltaChange(e, false)}>
                  {#each SLIPPAGE_OPTIONS as opt}
                    <option value={opt.value}>{opt.label}</option>
                  {/each}
                  <option value="custom">Custom</option>
                </select>
                {#if isCustomDelta1}
                  <input class={inputCls} type="text" bind:value={deployMaxDelta1} placeholder="Custom value" />
                {/if}
              </label>
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Deadline (min)</span>
                <input class={inputCls} type="number" bind:value={deadlineMinutes} min="1" max="60" />
              </label>
            </div>

            <div>
              <button class={btnPrimary} on:click={handleManualDeploy} disabled={pendingManualDeploy || !deployLiquidity}>
                {pendingManualDeploy ? 'Sending\u2026' : 'Deploy Grid Only'}
              </button>
            </div>
          </div>
        </section>
      {/if}
    {/if}

  {:else}
    <!-- ═══════════════════════════════════════ -->
    <!-- ═══ MANAGEMENT VIEW ═══ -->
    <!-- ═══════════════════════════════════════ -->

    <!-- Pool header -->
    <div class="flex items-center justify-between flex-wrap gap-2">
      <h2 class="text-[1.3rem] font-extrabold">
        {tokenLabel(currency0Symbol, currency0)} / {tokenLabel(currency1Symbol, currency1)} Grid
      </h2>
      <button
        class="text-[0.8rem] text-accent hover:underline bg-transparent border-none cursor-pointer"
        on:click={goBackToPositions}
      >
        &larr; {deployedPositions.length > 0 ? 'Your Grids' : 'Change Pool'}
      </button>
    </div>

    <!-- Status cards -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Grid Status</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {#if poolState}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>{usingReferenceTick ? 'Market Tick (approx.)' : 'Current Tick'}</span>
            <span class="text-base font-semibold font-mono">{effectiveTick}{#if usingReferenceTick} <span class="text-[0.68rem] text-yellow-400 font-normal">via canonical pool</span>{/if}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Initialized</span>
            <span class="text-base font-semibold">{poolState.initialized ? 'Yes' : 'No'}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Swap Count</span>
            <span class="text-base font-semibold">{poolState.swapCount}</span>
          </div>
        {/if}
        {#if userState}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Status</span>
            <span class="text-base font-semibold text-accent">{userState.deployed ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Grid Center</span>
            <span class="text-base font-semibold font-mono">{userState.gridCenterTick}</span>
          </div>
        {/if}
        {#if gridConfig}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Distribution</span>
            <span class="text-base font-semibold">{DIST_LABELS[gridConfig.distributionType]}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Orders</span>
            <span class="text-base font-semibold">{gridConfig.maxOrders}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Auto Rebalance</span>
            <span class="text-base font-semibold">{gridConfig.autoRebalance ? 'On' : 'Off'}</span>
          </div>
        {/if}
        {#if gridOrders.length > 0 && (gridAmounts.totalAmount0 > 0n || gridAmounts.totalAmount1 > 0n)}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>{currency0Symbol || 'Token0'} Exposure</span>
            <span class="text-base font-semibold font-mono">~{formatTokenAmount(gridAmounts.totalAmount0, currency0Decimals)}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>{currency1Symbol || 'Token1'} Exposure</span>
            <span class="text-base font-semibold font-mono">~{formatTokenAmount(gridAmounts.totalAmount1, currency1Decimals)}</span>
          </div>
        {/if}
      </div>
    </section>

    <!-- Grid Orders Chart -->
    {#if gridOrders.length > 0}
      <section class={card}>
        <GridOrdersChart
          orders={gridOrders}
          currentTick={effectiveTick}
          centerTick={userState?.gridCenterTick ?? null}
          token0Symbol={currency0Symbol}
          token1Symbol={currency1Symbol}
          token0Decimals={currency0Decimals}
          token1Decimals={currency1Decimals}
        />
      </section>
    {/if}

    <!-- Planned Weights Chart -->
    {#if plannedWeights.length > 0}
      <section class={card}>
        <WeightChart weights={plannedWeights} label="Active Weight Distribution" highlightCenter={true} />
      </section>
    {/if}

    <!-- Grid Orders Table -->
    {#if gridOrders.length > 0}
      <section class={card}>
        <h2 class="mb-4 text-[1.15rem] font-extrabold">Grid Orders ({gridOrders.length})</h2>
        <div class="overflow-x-auto">
          <table class="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">#</th>
                <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">Tick Lower</th>
                <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">Tick Upper</th>
                <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">Liquidity</th>
                <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">{currency0Symbol || 'Token0'}</th>
                <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">{currency1Symbol || 'Token1'}</th>
              </tr>
            </thead>
            <tbody>
              {#each gridOrders as order, i}
                {@const amounts = poolState ? orderAmounts(order, effectiveTick) : { amount0: 0n, amount1: 0n }}
                <tr>
                  <td class="py-2 px-3 border-b border-line">{i + 1}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">{order.tickLower}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">{order.tickUpper}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">{order.liquidity.toString()}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">~{formatTokenAmount(amounts.amount0, currency0Decimals)}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">~{formatTokenAmount(amounts.amount1, currency1Decimals)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    <!-- Actions -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Actions</h2>
      {#if advancedMode}
        <label class="flex flex-col gap-1 mb-4 max-w-[220px]">
          <span class={labelCls}>Deadline (min from now)</span>
          <input class={inputCls} type="number" bind:value={deadlineMinutes} min="1" max="60" />
        </label>
      {/if}
      <div class="flex flex-wrap gap-3">
        <button class={btnPrimary} on:click={handleRebalance} disabled={pendingRebalance}>
          {pendingRebalance ? 'Rebalancing\u2026' : 'Rebalance'}
        </button>
        <button class={btnOutline} on:click={() => fetchPoolData()}>
          Refresh Data
        </button>
        <button class={btnDanger} on:click={handleCloseGrid} disabled={pendingClose}>
          {pendingClose ? 'Closing\u2026' : 'Close Grid'}
        </button>
      </div>
    </section>

    <!-- Reconfigure (advanced mode) -->
    {#if advancedMode && $connected}
      <section class={card}>
        <h2 class="mb-4 text-[1.15rem] font-extrabold">Reconfigure Grid</h2>
        <p class="mb-4 text-muted text-[0.85rem]">Update your grid configuration, then rebalance to apply.</p>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 mb-4">
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Grid Spacing</span>
            <input class={inputCls} type="number" bind:value={cfgGridSpacing} min="1" />
          </label>
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Max Orders</span>
            <input class={inputCls} type="number" bind:value={cfgMaxOrders} min="1" max="500" />
          </label>
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Rebalance Threshold ({(cfgRebalanceBps / 100).toFixed(2)}%)</span>
            <input class={inputCls} type="number" bind:value={cfgRebalanceBps} min="0" />
          </label>
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Distribution Type</span>
            <select class={inputCls} bind:value={cfgDistType}>
              {#each DIST_LABELS as dl, i}
                <option value={i}>{dl}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-row items-center gap-2 self-end pb-2">
            <input class="w-[1.1rem] h-[1.1rem] accent-[var(--color-accent)]" type="checkbox" bind:checked={cfgAutoRebalance} />
            <span class={labelCls}>Auto Rebalance</span>
          </label>
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Max Slippage {currency0Symbol || 'Token 0'}</span>
            <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta0} placeholder="0 = no limit" />
          </label>
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Max Slippage {currency1Symbol || 'Token 1'}</span>
            <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta1} placeholder="0 = no limit" />
          </label>
        </div>
        <button class={btnPrimary} on:click={handleManualSetConfig} disabled={pendingSetConfig}>
          {pendingSetConfig ? 'Sending\u2026' : 'Update Config'}
        </button>
      </section>
    {/if}

    <!-- Keeper (collapsible) -->
    <section class={card}>
      <button
        class="flex items-center justify-between w-full text-left bg-transparent border-none cursor-pointer p-0"
        on:click={() => (showKeeper = !showKeeper)}
      >
        <h2 class="text-[1.15rem] font-extrabold">Keeper Authorization</h2>
        <span class="text-muted text-lg">{showKeeper ? '\u25BE' : '\u25B8'}</span>
      </button>
      {#if showKeeper}
        <div class="mt-4">
          <p class="mb-3 text-muted text-[0.85rem]">Authorize or revoke a keeper to rebalance on your behalf.</p>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4">
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Keeper Address</span>
              <input class={inputCls} type="text" bind:value={keeperAddress} placeholder="0x\u2026" />
            </label>
            <label class="flex flex-row items-center gap-2 self-end pb-2">
              <input class="w-[1.1rem] h-[1.1rem] accent-[var(--color-accent)]" type="checkbox" bind:checked={keeperAuthorized} />
              <span class={labelCls}>Authorize</span>
            </label>
          </div>
          <button class={btnOutline} on:click={handleSetKeeper} disabled={pendingKeeper || !keeperAddress}>
            {pendingKeeper ? 'Sending\u2026' : keeperAuthorized ? 'Authorize Keeper' : 'Revoke Keeper'}
          </button>
        </div>
      {/if}
    </section>
  {/if}
</div>
