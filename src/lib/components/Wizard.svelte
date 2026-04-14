<script lang="ts">
  import { connected, signerAddress, chainId as chainIdStore } from '$lib/stores/wallet';
  import { getGridHookAddress, PERMIT2_ADDRESS } from '$lib/contracts/config';
  import { executeTransaction, ensureChain, executeBatchTransaction, walletSupportsBatching, type BatchCall } from '$lib/contracts/txWrapper';
  import { addToast } from '$lib/stores/toasts';
  import {
    getGridConfig,
    getPoolState,
    setGridConfig as writeSetGridConfig,
    deployGrid as writeDeployGrid,
    getDeadline,
    isGridConfigEqual,
    getPoolManagerAddress,
    initializePool,
    gridHookAbi,
    POOL_MANAGER_INITIALIZE_ABI,
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
    erc20ApproveAbi,
  } from '$lib/contracts/permit2';
  import {
    WIZARD_STEPS,
    SLIPPAGE_OPTIONS,
    FEE_OPTIONS,
    resolveTickSpacingFromFee,
    tokenLabel,
    mismatchBps,
    parseBpsInput,
  } from '$lib/contracts/gridUiShared';
  import { getPresetsForChain, isNativeToken } from '$lib/contracts/poolPresets';
  import { savePosition } from '$lib/contracts/customPositions';
  import { getTokenAmountsForOrders, formatTokenAmount, formatRawTokenAmount, parseTokenAmount, getAmountsForLiquidity, getSqrtPriceAtTick, tickToPrice, formatSmallDecimal } from '$lib/contracts/tickMath';
  import { STRATEGY_PRESETS, DIST_LABELS, DIST_DESCRIPTIONS } from '$lib/contracts/strategyPresets';
  import Icon from '@iconify/svelte';
  import {
    areTokenDecimalsReady as areTokenDecimalsReadyShared,
    applyTickSpacingFromFee as applyTickSpacingFromFeeShared,
    buildPoolKey as buildPoolKeyShared,
    buildDesiredGridConfig as buildDesiredGridConfigShared,
    getNativeDeployValue as getNativeDeployValueShared,
    createChainResetState,
    resolveTokenDecimalsForSelectionAction,
    fetchTokenBalancesAction,
    fetchReferenceTickAction,
    computeReferenceAmountsAction,
    fetchPoolDataAction,
    previewWeightsAction,
    computeGridOrdersPreviewAction,
    computeLiquidityFromAmount0,
    computeLiquidityFromAmount1,
  } from '$lib/stores/gridController';
  import WeightChart from './WeightChart.svelte';
  import GridOrdersChart from './GridOrdersChart.svelte';
  import TokenIcon from './TokenIcon.svelte';
  import type { Address } from 'viem';

  // ── Style classes ──
  const inputCls = 'py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1';
  const btnPrimary = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnOutline = 'cursor-pointer rounded-xl py-2.5 px-5 font-bold text-sm bg-transparent text-accent border border-accent hover:bg-glow disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnDanger = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-danger text-on-accent hover:bg-danger-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const card = 'bg-surface border border-line rounded-[var(--radius-card)] p-4 sm:p-6 shadow-card';
  const labelCls = 'text-[0.78rem] font-bold text-muted uppercase tracking-wide';
  const statLabel = 'text-[0.72rem] font-bold text-muted uppercase tracking-wider';

  // ── State machine ──
  let view: 'wizard' = 'wizard';
  let wizardStep = 1;
  let advancedMode = false;

  import { push, link } from 'svelte-spa-router';

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
  const tokenSymbolCache = new Map<string, string>();

  $: presets = getPresetsForChain($chainIdStore ?? 0);

  // Clear preset selection when user edits currency addresses away from preset values
  $: if (selectedPresetIdx >= 0 && presets[selectedPresetIdx]) {
    const p = presets[selectedPresetIdx];
    if (currency0.toLowerCase() !== p.currency0.toLowerCase() || currency1.toLowerCase() !== p.currency1.toLowerCase()) {
      selectedPresetIdx = -1;
      currency0DecimalsResolved = false;
      currency1DecimalsResolved = false;
      currency0Symbol = '';
      currency1Symbol = '';
    }
  }

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

  function areTokenDecimalsReady(): boolean {
    return areTokenDecimalsReadyShared({
      currency0Decimals,
      currency1Decimals,
      currency0DecimalsResolved,
      currency1DecimalsResolved,
    });
  }

  async function resolveTokenDecimalsForSelection(): Promise<boolean> {
    const selectedPreset = selectedPresetIdx >= 0 ? presets[selectedPresetIdx] : undefined;
    const result = await resolveTokenDecimalsForSelectionAction({
      chainId: $chainIdStore ?? 0,
      selectedPreset,
      currency0,
      currency1,
      currency0Symbol,
      currency1Symbol,
      currency0Decimals,
      currency1Decimals,
      tokenDecimalsCache,
      tokenSymbolCache,
      addToast,
    });
    if (!result.ok) return false;
    currency0Decimals = result.currency0Decimals;
    currency1Decimals = result.currency1Decimals;
    currency0DecimalsResolved = result.currency0DecimalsResolved;
    currency1DecimalsResolved = result.currency1DecimalsResolved;
    currency0Symbol = result.currency0Symbol;
    currency1Symbol = result.currency1Symbol;
    return true;
  }

  function applyTickSpacingFromFee(nextFee: number) {
    tickSpacing = applyTickSpacingFromFeeShared(nextFee, tickSpacing);
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

  function isNativeCurrency(addr: string): boolean {
    return isNativeToken(addr as Address);
  }

  function savePositionIfCustom() {
    if (selectedPresetIdx >= 0) return; // already a known preset
    const user = $signerAddress;
    if (!user || !currency0 || !currency1) return;
    const a = currency0.toLowerCase();
    const b = currency1.toLowerCase();
    const sorted = a < b;
    savePosition($chainIdStore ?? 0, user, {
      currency0: (sorted ? currency0 : currency1) as Address,
      currency1: (sorted ? currency1 : currency0) as Address,
      currency0Symbol: (sorted ? currency0Symbol : currency1Symbol),
      currency1Symbol: (sorted ? currency1Symbol : currency0Symbol),
      currency0Decimals: (sorted ? currency0Decimals : currency1Decimals),
      currency1Decimals: (sorted ? currency1Decimals : currency0Decimals),
      fee,
      tickSpacing,
    });
  }

  function buildPoolKey(): PoolKey {
    return buildPoolKeyShared({
      currency0,
      currency1,
      fee,
      tickSpacing,
      hookAddress,
    });
  }

  // ── Chain change detection ──
  let prevChain = $chainIdStore;
  let intentionalSwitch = false;
  $: if ($chainIdStore !== prevChain) {
    prevChain = $chainIdStore;
    if (intentionalSwitch) {
      intentionalSwitch = false;
    } else {
      const reset = createChainResetState('wizard');
      selectedPresetIdx = reset.selectedPresetIdx;
      currency0 = reset.currency0;
      currency1 = reset.currency1;
      currency0Symbol = reset.currency0Symbol;
      currency1Symbol = reset.currency1Symbol;
      currency0Decimals = reset.currency0Decimals;
      currency1Decimals = reset.currency1Decimals;
      currency0DecimalsResolved = reset.currency0DecimalsResolved;
      currency1DecimalsResolved = reset.currency1DecimalsResolved;
      tokenDecimalsCache.clear();
      inputAmount0 = reset.inputAmount0;
      inputAmount1 = reset.inputAmount1;
      balance0 = reset.balance0;
      balance1 = reset.balance1;
      refAmount0 = reset.refAmount0;
      refAmount1 = reset.refAmount1;
      poolState = reset.poolState;
      userState = reset.userState;
      gridConfig = reset.gridConfig;
    gridOrders = reset.gridOrders;
    plannedWeights = reset.plannedWeights;
    referenceTick = reset.referenceTick;
    view = 'wizard';
    wizardStep = reset.wizardStep;
    }
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
    const fixed = price.toFixed(Math.min(digits, 18));
    return formatSmallDecimal(fixed) ?? fixed;
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
  let batchMode = false;
  let walletCanBatch = false;
  const AMOUNT_MISMATCH_WARN_BPS = 100n; // 1%

  // Detect AA batching support when wallet connects
  $: if ($connected) {
    walletSupportsBatching().then((v) => (walletCanBatch = v));
  }

  const MAX_UINT160 = (1n << 160n) - 1n;
  const permit2Expiration = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

  // ── Token balance & amount logic ──

  async function fetchBalances() {
    const user = $signerAddress as Address;
    if (!user || !currency0 || !currency1) return;
    loadingBalances = true;
    try {
      const balances = await fetchTokenBalancesAction({ user, currency0, currency1 });
      if (balances) {
        balance0 = balances.balance0;
        balance1 = balances.balance1;
      }
    } catch {
      // Silent — balance display is best-effort
    } finally {
      loadingBalances = false;
    }
  }

  async function fetchReferenceTick() {
    if (!hookAddress || !currency0 || !currency1) return;
    try {
      referenceTick = await fetchReferenceTickAction({
        hookAddress,
        currency0,
        currency1,
        fee,
        tickSpacing,
      });
    } catch {
      referenceTick = null;
    }
  }

  function computeReferenceAmounts() {
    if (!poolState || previewedWeights.length === 0) return;
    try {
      const amounts = computeReferenceAmountsAction({
        effectiveTick,
        cfgGridSpacing,
        tickSpacing,
        cfgMaxOrders,
        previewedWeights,
        refLiquidity: REF_LIQUIDITY,
      });
      refAmount0 = amounts.refAmount0;
      refAmount1 = amounts.refAmount1;
    } catch {
      refAmount0 = 0n;
      refAmount1 = 0n;
    }
  }

  function computeFromAmount0(raw0: bigint) {
    const next = computeLiquidityFromAmount0({
      raw0,
      refAmount0,
      refAmount1,
      refLiquidity: REF_LIQUIDITY,
      currency1Decimals,
    });
    deployLiquidity = next.deployLiquidity;
    inputAmount1 = next.derivedAmount1Text;
  }

  function computeFromAmount1(raw1: bigint) {
    const next = computeLiquidityFromAmount1({
      raw1,
      refAmount0,
      refAmount1,
      refLiquidity: REF_LIQUIDITY,
      currency0Decimals,
    });
    deployLiquidity = next.deployLiquidity;
    inputAmount0 = next.derivedAmount0Text;
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
      inputAmount0 = formatRawTokenAmount(raw, currency0Decimals);
      computeFromAmount0(raw);
    } else {
      inputAmount1 = formatRawTokenAmount(raw, currency1Decimals);
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
      intentionalSwitch = true;
      await ensureChain();
      const key = buildPoolKey();
      const state = await fetchPoolDataAction({
        hookAddress,
        poolKey: key,
        user,
        currency0Decimals,
        currency1Decimals,
      });
      poolState = state.poolState;
      userState = state.userState;
      gridConfig = state.gridConfig;
      gridOrders = state.gridOrders;
      plannedWeights = state.plannedWeights;
      referenceTick = state.referenceTick;
      // Only auto-apply config when grid is deployed (user will be redirected to Profile)
      if (state.syncedConfig && userState?.deployed) {
        cfgGridSpacing = state.syncedConfig.cfgGridSpacing;
        cfgMaxOrders = state.syncedConfig.cfgMaxOrders;
        cfgRebalanceBps = state.syncedConfig.cfgRebalanceBps;
        cfgDistType = state.syncedConfig.cfgDistType;
        cfgAutoRebalance = state.syncedConfig.cfgAutoRebalance;
        cfgMaxSlippageDelta0 = state.syncedConfig.cfgMaxSlippageDelta0;
        cfgMaxSlippageDelta1 = state.syncedConfig.cfgMaxSlippageDelta1;
      }
      return true;
    } catch (e: any) {
      addToast('error', `Fetch failed: ${e.shortMessage || e.message}`);
      return false;
    } finally {
      loadingData = false;
      intentionalSwitch = false;
    }
  }

  // ── Reuse previous config ──
  $: hasPreviousConfig = gridConfig != null && gridConfig.maxOrders > 0 && !userState?.deployed;

  function usePreviousConfig() {
    if (!gridConfig) return;
    cfgGridSpacing = gridConfig.gridSpacing;
    cfgMaxOrders = gridConfig.maxOrders;
    cfgRebalanceBps = gridConfig.rebalanceThresholdBps;
    cfgDistType = gridConfig.distributionType;
    cfgAutoRebalance = gridConfig.autoRebalance;
    cfgMaxSlippageDelta0 = formatTokenAmount(gridConfig.maxSlippageDelta0, currency0Decimals);
    cfgMaxSlippageDelta1 = formatTokenAmount(gridConfig.maxSlippageDelta1, currency1Decimals);
    selectedStrategyIdx = -1;
    previewedOrders = [];
    inputAmount0 = '';
    inputAmount1 = '';
    deployLiquidity = '';
    wizardStep = 3;
    triggerWeightPreview();
    fetchBalances();
  }

  // ── Wizard navigation ──
  async function handlePoolNext() {
    const decimalsOk = await resolveTokenDecimalsForSelection();
    if (!decimalsOk) return;
    const ok = await fetchPoolData();
    if (!ok) return;
    if (userState?.deployed) {
      savePositionIfCustom();
      push('/profile');
    } else {
      wizardStep = 2;
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
      previewedWeights = previewWeightsAction({
        cfgMaxOrders,
        cfgDistType,
      });
      computeReferenceAmounts();
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

  // Auto-compute grid orders when amounts or config change
  $: if (wizardStep >= 3 && deployLiquidity && previewedWeights.length > 0 && poolState) {
    try {
      previewedOrders = computeGridOrdersPreviewAction({
        effectiveTick,
        cfgGridSpacing,
        tickSpacing,
        cfgMaxOrders,
        previewedWeights,
        deployLiquidity,
      });
    } catch {
      previewedOrders = [];
    }
  }

  async function handleComputeOrders() {
    if (!poolState || !deployLiquidity || previewedWeights.length === 0) return;
    try {
      previewedOrders = computeGridOrdersPreviewAction({
        effectiveTick,
        cfgGridSpacing,
        tickSpacing,
        cfgMaxOrders,
        previewedWeights,
        deployLiquidity,
      });
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

  $: mismatch0Bps = mismatchBps(enteredAmount0Raw, estimatedAmounts.totalAmount0);
  $: mismatch1Bps = mismatchBps(enteredAmount1Raw, estimatedAmounts.totalAmount1);
  $: hasAmountMismatchWarning = mismatch0Bps > AMOUNT_MISMATCH_WARN_BPS || mismatch1Bps > AMOUNT_MISMATCH_WARN_BPS;

  // ── Insufficient balance warnings (Step 3) — validated against estimated on-chain amounts ──
  $: insufficientBalance0 = estimatedAmounts.totalAmount0 > 0n && estimatedAmounts.totalAmount0 > balance0 && !(refAmount0 === 0n && refAmount1 > 0n);
  $: insufficientBalance1 = estimatedAmounts.totalAmount1 > 0n && estimatedAmounts.totalAmount1 > balance1 && !(refAmount1 === 0n && refAmount0 > 0n);
  $: hasInsufficientBalance = insufficientBalance0 || insufficientBalance1;

  function getNativeDeployValue(maxD0: bigint, maxD1: bigint): bigint {
    return getNativeDeployValueShared({
      currency0,
      currency1,
      estimatedAmount0: estimatedAmounts.totalAmount0,
      estimatedAmount1: estimatedAmounts.totalAmount1,
      maxDelta0: maxD0,
      maxDelta1: maxD1,
      isNativeCurrency,
    });
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
    return buildDesiredGridConfigShared({
      cfgGridSpacing,
      cfgMaxOrders,
      cfgRebalanceBps,
      cfgDistType,
      cfgAutoRebalance,
      cfgMaxSlippageDelta0,
      cfgMaxSlippageDelta1,
      currency0Decimals,
      currency1Decimals,
    });
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
    intentionalSwitch = true;
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
      savePositionIfCustom();
      await fetchPoolData();
      push('/profile');
    } catch (e: any) {
      addToast('error', `Deploy failed: ${e.shortMessage || e.message}`);
      wizardStep = 3;
    } finally {
      deploying = false;
      deployStepLabel = '';
      intentionalSwitch = false;
    }
  }

  async function handleBatchDeploy() {
    const user = $signerAddress as Address;
    if (!user) return;
    if (!areTokenDecimalsReady()) {
      addToast('error', 'Token decimals are not resolved. Please go back and verify pool tokens.');
      wizardStep = 1;
      return;
    }
    deploying = true;
    intentionalSwitch = true;
    deployStepLabel = 'Preparing batched transaction\u2026';
    try {
      await ensureChain();

      const key = buildPoolKey();
      const calls: BatchCall[] = [];
      const permit2ApproveAbi = [{
        type: 'function' as const,
        name: 'approve',
        inputs: [
          { name: 'token', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
        ],
        outputs: [],
        stateMutability: 'nonpayable' as const,
      }];

      // 0. Pool init (if needed)
      if (needsPoolInit) {
        const sqrtPrice = getSqrtPriceAtTick(effectiveTick);
        const poolMgr = await getPoolManagerAddress(hookAddress);
        calls.push({
          to: poolMgr,
          abi: POOL_MANAGER_INITIALIZE_ABI,
          functionName: 'initialize',
          args: [key, sqrtPrice],
        });
      }

      // 1. Set grid config (if changed)
      const desiredConfig = buildDesiredGridConfig();
      const onChainConfig = await getGridConfig(hookAddress, key, user);
      if (!isGridConfigEqual(desiredConfig, onChainConfig)) {
        calls.push({
          to: hookAddress,
          abi: gridHookAbi as readonly any[],
          functionName: 'setGridConfig',
          args: [key, desiredConfig],
        });
      }

      // 2. Token approvals (skip native)
      const tokens = [
        { addr: currency0, label: tokenLabel(currency0Symbol, currency0) },
        { addr: currency1, label: tokenLabel(currency1Symbol, currency1) },
      ];
      for (const tok of tokens) {
        if (isNativeCurrency(tok.addr)) continue;

        const erc20 = await getTokenAllowanceForPermit2(tok.addr as Address, user);
        if (erc20 < MAX_UINT160 / 2n) {
          calls.push({
            to: tok.addr as Address,
            abi: erc20ApproveAbi,
            functionName: 'approve',
            args: [PERMIT2_ADDRESS, MAX_UINT160],
          });
        }

        const p2 = await getPermit2Allowance(user, tok.addr as Address, hookAddress);
        if (p2.amount < MAX_UINT160 / 2n) {
          calls.push({
            to: PERMIT2_ADDRESS,
            abi: permit2ApproveAbi,
            functionName: 'approve',
            args: [tok.addr, hookAddress, MAX_UINT160, permit2Expiration()],
          });
        }
      }

      // 3. Deploy grid
      const bps0 = BigInt(deployMaxDelta0 || '0');
      const bps1 = BigInt(deployMaxDelta1 || '0');
      const maxD0 = bps0 === 0n ? 0n : estimatedAmounts.totalAmount0 * bps0 / 10000n;
      const maxD1 = bps1 === 0n ? 0n : estimatedAmounts.totalAmount1 * bps1 / 10000n;
      const nativeValue = getNativeDeployValue(maxD0, maxD1);
      calls.push({
        to: hookAddress,
        abi: gridHookAbi as readonly any[],
        functionName: 'deployGrid',
        args: [key, BigInt(deployLiquidity), maxD0, maxD1, getDeadline(deadlineMinutes)],
        value: nativeValue,
      });

      deployStepLabel = `Sending ${calls.length} calls as a single batch\u2026`;
      await executeBatchTransaction('Deploy Grid', calls);

      addToast('success', 'Grid deployed successfully!');
      savePositionIfCustom();
      await fetchPoolData();
      push('/profile');
    } catch (e: any) {
      addToast('error', `Deploy failed: ${e.shortMessage || e.message}`);
      wizardStep = 3;
    } finally {
      deploying = false;
      deployStepLabel = '';
      intentionalSwitch = false;
    }
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
  <!-- Page switch + advanced mode toggle -->
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <div class="flex items-center gap-2">
      <a
        href="/wizard"
        use:link
        class="px-3 py-1.5 text-[0.78rem] font-bold rounded-lg border transition-colors duration-150 border-accent text-accent bg-glow"
      >
        Wizard
      </a>
      <a
        href="/profile"
        use:link
        class="px-3 py-1.5 text-[0.78rem] font-bold rounded-lg border transition-colors duration-150 border-line text-muted"
      >
        Profile
      </a>
    </div>
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <span class="text-[0.78rem] text-muted">{advancedMode ? 'Advanced' : 'Simple'}</span>
      <div class="relative inline-flex items-center">
        <input type="checkbox" bind:checked={advancedMode} class="sr-only peer" />
        <div class="w-9 h-5 bg-line rounded-full peer-checked:bg-accent transition-colors"></div>
        <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-toggle-knob rounded-full shadow transition-transform peer-checked:translate-x-4"></div>
      </div>
    </label>
  </div>

  {#if true}
    <!-- ═══ Wizard Stepper ═══ -->
    <nav class="flex items-center justify-center gap-0 mb-2">
      {#each WIZARD_STEPS as stepLabel, i}
        {@const num = i + 1}
        {@const active = wizardStep === num}
        {@const done = wizardStep > num}
        <button
          class="flex flex-col items-center gap-1 px-2 sm:px-4 py-1 bg-transparent border-none cursor-pointer disabled:cursor-default transition-opacity duration-150"
          class:opacity-40={!active && !done}
          disabled={!done}
          on:click={() => { if (done) wizardStep = num; }}
        >
          <span
            class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors duration-150"
            class:bg-accent={active}
            class:text-on-accent={active}
            class:text-accent={done}
            class:bg-surface-strong={!active && !done}
            class:text-muted={!active && !done}
            class:bg-glow={done}
          >
            {done ? '\u2713' : num}
          </span>
          <span class="hidden sm:inline text-[0.7rem] font-semibold" class:text-accent={active} class:text-muted={!active}>{stepLabel}</span>
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
                <span class="flex items-center gap-1 font-bold text-text">
                  <TokenIcon symbol={preset.currency0Symbol} size={18} />
                  <TokenIcon symbol={preset.currency1Symbol} size={18} />
                  {preset.label}
                </span>
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

        {#if hasPreviousConfig}
          <div class="mb-5 p-4 rounded-xl border border-accent bg-glow">
            <p class="text-[0.85rem] font-semibold text-text mb-1">Previous configuration found</p>
            <p class="text-[0.78rem] text-muted mb-3">
              {gridConfig.maxOrders} orders &middot; {DIST_LABELS[gridConfig.distributionType]} &middot; spacing {gridConfig.gridSpacing} &middot; rebalance {(gridConfig.rebalanceThresholdBps / 100).toFixed(2)}%
            </p>
            <button class={btnPrimary} on:click={usePreviousConfig}>
              Use Previous Config
            </button>
          </div>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {#each STRATEGY_PRESETS as preset, i}
            <button
              class="text-left p-4 rounded-xl border-2 transition-colors duration-100 bg-transparent cursor-pointer"
              class:border-accent={selectedStrategyIdx === i}
              class:border-line={selectedStrategyIdx !== i}
              on:click={() => selectStrategy(i)}
            >
              <div class="flex items-center gap-0 mb-1">
                <Icon icon={preset.icon} width={20} height={20} />
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
            <span class="text-sm font-semibold inline-flex items-center gap-1">
              <TokenIcon symbol={currency0Symbol} size={16} />
              {tokenLabel(currency0Symbol, currency0)}
              /
              <TokenIcon symbol={currency1Symbol} size={16} />
              {tokenLabel(currency1Symbol, currency1)}
            </span>
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
              <span class="text-sm font-semibold font-mono">{effectiveTick} {#if usingReferenceTick} <span class="text-[0.68rem] text-warning font-normal">via canonical pool</span>{/if}</span>
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
                Balance: {loadingBalances ? '\u2026' : formatRawTokenAmount(balance0, currency0Decimals)}
              </span>
            </div>
            <input class={inputCls} type="text" bind:value={inputAmount0} on:input={onAmount0Input} placeholder="0.0" disabled={refAmount0 === 0n && refAmount1 > 0n} />
            {#if estimatedAmounts.totalAmount0 > 0n}
              <span class="text-[0.72rem] text-muted">~{formatRawTokenAmount(estimatedAmounts.totalAmount0, currency0Decimals)} Required</span>
            {/if}
            {#if refAmount0 === 0n && refAmount1 > 0n}
              <span class="text-[0.72rem] text-muted italic">Not required for current grid range</span>
            {:else}
              {#if insufficientBalance0}
                <span class="text-[0.72rem] font-semibold text-danger">Insufficient balance (have {formatRawTokenAmount(balance0, currency0Decimals)})</span>
              {/if}
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
                Balance: {loadingBalances ? '\u2026' : formatRawTokenAmount(balance1, currency1Decimals)}
              </span>
            </div>
            <input class={inputCls} type="text" bind:value={inputAmount1} on:input={onAmount1Input} placeholder="0.0" disabled={refAmount1 === 0n && refAmount0 > 0n} />
            {#if estimatedAmounts.totalAmount1 > 0n}
              <span class="text-[0.72rem] text-muted">~{formatRawTokenAmount(estimatedAmounts.totalAmount1, currency1Decimals)} Required</span>
            {/if}
            {#if refAmount1 === 0n && refAmount0 > 0n}
              <span class="text-[0.72rem] text-muted italic">Not required for current grid range</span>
            {:else}
              {#if insufficientBalance1}
                <span class="text-[0.72rem] font-semibold text-danger">Insufficient balance (have {formatRawTokenAmount(balance1, currency1Decimals)})</span>
              {/if}
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

        <!-- Grid orders preview (auto-computed) -->
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
            <div class="mt-3 flex items-start gap-2 rounded-lg border border-warning bg-warning/20 px-4 py-3 text-[0.85rem] text-warning-strong font-semibold">
              <span class="mt-0.5 text-warning">&#9888;</span>
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
          <button class={btnPrimary} on:click={handlePreviewNext} disabled={!deployLiquidity || hasInsufficientBalance}>
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
          <div class="mb-2 font-bold text-text">Deploy Summary</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div class="text-[0.72rem] uppercase tracking-wide text-muted">{currency0Symbol || 'Token0'}</div>
              <div class="text-text">~{formatTokenAmount(estimatedAmounts.totalAmount0, currency0Decimals)}</div>
            </div>
            <div>
              <div class="text-[0.72rem] uppercase tracking-wide text-muted">{currency1Symbol || 'Token1'}</div>
              <div class="text-text">~{formatTokenAmount(estimatedAmounts.totalAmount1, currency1Decimals)}</div>
            </div>
          </div>
          {#if nativeDeployValue > 0n}
            <div class="mt-3 text-[0.78rem] text-muted">
              Native ETH value to send: <span class="font-mono text-text">{formatTokenAmount(nativeDeployValue, 18)} ETH</span>
            </div>
          {/if}
          {#if hasAmountMismatchWarning}
            <div class="mt-3 rounded-lg border border-warning bg-warning/20 px-3 py-2 text-[0.8rem] text-warning-strong font-semibold">
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
          <div class="flex items-center gap-3 mb-4 p-3 rounded-xl border border-accent/20 bg-glow/30">
            <div class="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full flex-shrink-0"></div>
            <span class="text-sm font-medium text-text">{deployStepLabel}</span>
          </div>
        {/if}

        {#if walletCanBatch}
          <label class="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input
              class="w-[1.1rem] h-[1.1rem] accent-[var(--color-accent)]"
              type="checkbox"
              bind:checked={batchMode}
              disabled={deploying}
            />
            <span class="text-sm font-semibold text-text">Batch all transactions in a single call</span>
            <span class="text-[0.72rem] text-muted">(AA wallet detected)</span>
          </label>
        {/if}

        <div class="flex gap-3">
          <button class={btnOutline} on:click={() => (wizardStep = 3)} disabled={deploying}>Back</button>
          <button class={btnPrimary} on:click={batchMode ? handleBatchDeploy : handleUnifiedDeploy} disabled={deploying || !$connected}>
            {deploying ? 'Deploying\u2026' : batchMode ? 'Deploy Grid (Batched)' : 'Deploy Grid'}
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
  {/if}
</div>
