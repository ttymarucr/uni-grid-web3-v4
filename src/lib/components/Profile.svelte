<script lang="ts">
  import { connected, signerAddress, chainId as chainIdStore } from '$lib/stores/wallet';
  import { getGridHookAddress } from '$lib/contracts/config';
  import { executeTransaction, ensureChain } from '$lib/contracts/txWrapper';
  import { addToast } from '$lib/stores/toasts';
  import {
    getGridConfig,
    setGridConfig as writeSetGridConfig,
    isGridConfigEqual,
    type PoolKey,
    type GridConfig,
    type PoolState,
    type UserGridState,
    type GridOrder,
    type OrderFees,
  } from '$lib/contracts/gridHook';
  import { scanDeployedPositionsForUser, type DeployedPosition } from '$lib/contracts/gridData';
  import { runRebalance, runCloseGrid, runSetKeeper } from '$lib/contracts/gridProfileTx';
  import { isNativeToken } from '$lib/contracts/poolPresets';
  import { getStoredPositions } from '$lib/contracts/customPositions';
  import {
    tokenLabel,
  } from '$lib/contracts/gridUiShared';
  import { getTokenAmountsForOrders, formatTokenAmount, getAmountsForLiquidity, getSqrtPriceAtTick, formatRawTokenAmount, tickToPrice, formatSmallDecimal } from '$lib/contracts/tickMath';
  import { DIST_LABELS } from '$lib/contracts/strategyPresets';
  import {
    buildPoolKey as buildPoolKeyShared,
    buildDesiredGridConfig as buildDesiredGridConfigShared,
    createChainResetState,
    fetchPoolDataAction,
    estimateRebalanceDelta,
    computeNativeRebalanceValue,
    computeGridApr,
    type RebalanceEstimate,
    type GridAprResult,
  } from '$lib/stores/gridController';
  import WeightChart from './WeightChart.svelte';
  import GridOrdersChart from './GridOrdersChart.svelte';
  import { RefreshCw, RotateCcw, X } from 'lucide-svelte';
  import TokenIcon from './TokenIcon.svelte';
  import type { Address } from 'viem';

  // ── Style classes ──
  const inputCls = 'py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1';
  const btnPrimary = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnOutline = 'cursor-pointer rounded-xl py-2.5 px-5 font-bold text-sm bg-transparent text-accent border border-accent hover:bg-glow disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnDanger = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-danger text-on-accent hover:bg-danger-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const actionBtnBase = 'w-9 h-9 inline-flex items-center justify-center rounded-full transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2';
  const actionBtnPrimary = `${actionBtnBase} border-none bg-accent text-on-accent hover:bg-accent-strong`;
  const actionBtnNeutral = `${actionBtnBase} border border-line bg-surface-strong text-text hover:border-accent hover:bg-glow`;
  const actionBtnDanger = `${actionBtnBase} border-none bg-danger text-on-accent hover:bg-danger-strong`;
  const card = 'bg-surface border border-line rounded-[var(--radius-card)] p-4 sm:p-6 shadow-card';
  const labelCls = 'text-[0.78rem] font-bold text-muted uppercase tracking-wide';
  const statLabel = 'text-[0.72rem] font-bold text-muted uppercase tracking-wider';

  // ── State machine ──
  let view: 'positions' | 'manage' = 'positions';
  let advancedMode = false;
  let sortBy: 'default' | 'apr' | 'liquidity' = 'default';

  import { push, link } from 'svelte-spa-router';

  // ── Deployed positions ──
  let deployedPositions: DeployedPosition[] = [];
  let scanningPositions = false;
  let hasScanned = false;

  async function scanDeployedPositions() {
    const user = $signerAddress as Address;
    if (!user || !hookAddress) return;
    scanningPositions = true;
    intentionalSwitch = true;
    try {
      await ensureChain();
      const chainId = $chainIdStore ?? 0;
      const stored = getStoredPositions(chainId, user);
      deployedPositions = await scanDeployedPositionsForUser(hookAddress, user, chainId, stored);
    } catch {
      // Silent — scan is best-effort
    } finally {
      scanningPositions = false;
      hasScanned = true;
      intentionalSwitch = false;
    }
  }

  // ── Hook address ──
  $: hookAddress = getGridHookAddress($chainIdStore);

  // Scan on connect
  $: if ($connected && $signerAddress && hookAddress) {
    scanDeployedPositions();
  }

  // ── Pool preset state ──
  let currency0 = '';
  let currency1 = '';
  let fee = 3000;
  let tickSpacing = 60;
  let currency0Symbol = '';
  let currency1Symbol = '';
  let currency0Decimals = 18;
  let currency1Decimals = 18;
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
      const reset = createChainResetState();
      currency0 = reset.currency0;
      currency1 = reset.currency1;
      currency0Symbol = reset.currency0Symbol;
      currency1Symbol = reset.currency1Symbol;
      currency0Decimals = reset.currency0Decimals;
      currency1Decimals = reset.currency1Decimals;
      poolState = reset.poolState;
      userState = reset.userState;
      gridConfig = reset.gridConfig;
      gridOrders = reset.gridOrders;
      plannedWeights = reset.plannedWeights;
      orderFees = [];
      referenceTick = reset.referenceTick;
      deployedPositions = reset.deployedPositions as DeployedPosition[];
      hasScanned = reset.hasScanned;
      view = 'positions';
    }
  }

  // ── Strategy state ──
  let cfgGridSpacing = 60;
  let cfgMaxOrders = 10;
  let cfgRebalanceBps = 200;
  let cfgDistType = 0;
  let cfgAutoRebalance = true;
  let cfgMaxSlippageDelta0 = '0';
  let cfgMaxSlippageDelta1 = '0';

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
  let orderFees: OrderFees[] = [];
  let loadingData = false;

  // ── Reference tick (from PoolManager when grid pool not initialized) ──
  let referenceTick: number | null = null;
  $: usingReferenceTick = poolState != null && !poolState.initialized && referenceTick != null;
  $: effectiveTick = poolState ? (poolState.initialized ? poolState.currentTick : (referenceTick ?? 0)) : 0;


  let deadlineMinutes = 5;

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
      orderFees = state.orderFees;
      referenceTick = state.referenceTick;
      if (state.syncedConfig) {
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
    }
  }

  // ── Profile navigation ──

  function openPosition(pos: DeployedPosition) {
    currency0 = pos.preset.currency0;
    currency1 = pos.preset.currency1;
    fee = pos.preset.fee;
    tickSpacing = pos.preset.tickSpacing;
    currency0Symbol = pos.preset.currency0Symbol;
    currency1Symbol = pos.preset.currency1Symbol;
    currency0Decimals = pos.preset.currency0Decimals;
    currency1Decimals = pos.preset.currency1Decimals;
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
    push('/wizard');
  }

  function goBackToPositions() {
    view = 'positions';
  }

  // ── Position sorting ──
  $: sortedPositions = [...deployedPositions].sort((a, b) => {
    if (sortBy === 'apr') return (b.apr ?? -1) - (a.apr ?? -1);
    if (sortBy === 'liquidity') {
      if (a.totalLiquidity > b.totalLiquidity) return -1;
      if (a.totalLiquidity < b.totalLiquidity) return 1;
      return 0;
    }
    return b.poolState.swapCount - a.poolState.swapCount;
  });

  // ── Estimated token amounts for on-chain grid orders ──
  $: gridAmounts = (gridOrders.length > 0 && poolState)
    ? getTokenAmountsForOrders(gridOrders, effectiveTick)
    : { totalAmount0: 0n, totalAmount1: 0n };

  // ── Accumulated fees totals ──
  $: totalFees0 = orderFees.reduce((sum, f) => sum + f.fees0, 0n);
  $: totalFees1 = orderFees.reduce((sum, f) => sum + f.fees1, 0n);

  // ── Rebalance cost estimate (pure math, no RPC calls) ──
  $: rebalanceEstimate = (
    userState?.deployed &&
    gridOrders.length > 0 &&
    gridConfig &&
    plannedWeights.length > 0 &&
    poolState
  )
    ? (() => {
        try {
          return estimateRebalanceDelta({
            gridOrders,
            gridConfig,
            plannedWeights,
            currentTick: effectiveTick,
            oldCenter: userState!.gridCenterTick,
            tickSpacing,
          });
        } catch {
          return null;
        }
      })()
    : null as RebalanceEstimate | null;

  function formatSignedDelta(delta: bigint, decimals: number): string {
    const abs = delta < 0n ? -delta : delta;
    const formatted = formatTokenAmount(abs, decimals);
    return delta > 0n ? `+${formatted}` : delta < 0n ? `\u2212${formatted}` : '0';
  }

  // ── APR calculation ──
  $: aprData = (
    userState?.deployed &&
    gridOrders.length > 0 &&
    poolState &&
    userState.lastActionTimestamp > 0
  )
    ? computeGridApr({
        totalFees0,
        totalFees1,
        gridOrders,
        currentTick: effectiveTick,
        lastActionTimestamp: userState.lastActionTimestamp,
        currency0Decimals,
        currency1Decimals,
      })
    : null as GridAprResult | null;

  function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const h = Math.floor(seconds / 3600);
    if (h < 24) return `${h}h ${Math.floor((seconds % 3600) / 60)}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }

  function orderAmounts(order: GridOrder, currentTick: number): { amount0: bigint; amount1: bigint } {
    if (order.liquidity === 0n) return { amount0: 0n, amount1: 0n };
    const sqrtPriceX96 = getSqrtPriceAtTick(currentTick);
    const sqrtPriceAX96 = getSqrtPriceAtTick(order.tickLower);
    const sqrtPriceBX96 = getSqrtPriceAtTick(order.tickUpper);
    return getAmountsForLiquidity(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, order.liquidity);
  }

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


  // ── Total value in token0 for position cards ──
  function totalValueInToken0(pos: DeployedPosition): string {
    const rawPrice = tickToPrice(pos.poolState.currentTick);
    const dec0 = pos.preset.currency0Decimals;
    const dec1 = pos.preset.currency1Decimals;
    const amt0 = Number(pos.totalAmount0) / 10 ** dec0;
    const amt1 = Number(pos.totalAmount1) / 10 ** dec1;
    // tickToPrice returns raw price (token1_raw / token0_raw); adjust for decimals
    const humanPrice = rawPrice * (10 ** dec0) / (10 ** dec1);
    const amt1InToken0 = humanPrice > 0 ? amt1 / humanPrice : 0;
    const total = amt0 + amt1InToken0;
    if (total < 0.01) {
      const digits = Math.max(2, -Math.floor(Math.log10(total)) + 3);
      const fixed = total.toFixed(Math.min(digits, 18));
      return formatSmallDecimal(fixed) ?? fixed;
    }
    return total.toFixed(total < 1 ? 4 : 2);
  }

  // ── Native currency helper ──
  function isNativeCurrency(addr: string): boolean {
    return isNativeToken(addr as Address);
  }

  // ── Management actions ──
  let pendingRebalance = false;
  let rebalanceStepLabel = '';
  let pendingClose = false;

  async function handleRebalance() {
    const user = $signerAddress as Address;
    if (!user) return;
    pendingRebalance = true;
    rebalanceStepLabel = '';
    try {
      // Compute native ETH value and approval tokens from the estimate
      let nativeValue = 0n;
      const approvalTokens: { addr: Address; label: string }[] = [];

      if (rebalanceEstimate && rebalanceEstimate.thresholdMet) {
        nativeValue = computeNativeRebalanceValue({
          currency0,
          currency1,
          netDelta0: rebalanceEstimate.netDelta0,
          netDelta1: rebalanceEstimate.netDelta1,
          maxSlippageDelta0: gridConfig?.maxSlippageDelta0 ?? 0n,
          maxSlippageDelta1: gridConfig?.maxSlippageDelta1 ?? 0n,
          isNativeCurrency,
        });

        // Only request approvals for ERC20 tokens where user owes more
        if (rebalanceEstimate.netDelta0 > 0n && !isNativeCurrency(currency0)) {
          approvalTokens.push({ addr: currency0 as Address, label: tokenLabel(currency0Symbol, currency0) });
        }
        if (rebalanceEstimate.netDelta1 > 0n && !isNativeCurrency(currency1)) {
          approvalTokens.push({ addr: currency1 as Address, label: tokenLabel(currency1Symbol, currency1) });
        }
      }

      await runRebalance({
        hookAddress,
        poolKey: buildPoolKey(),
        user,
        deadlineMinutes,
        nativeValue,
        approvalTokens: approvalTokens.length > 0 ? approvalTokens : undefined,
        onStep: (msg) => { rebalanceStepLabel = msg; },
      });
    } finally {
      pendingRebalance = false;
      rebalanceStepLabel = '';
    }
    await fetchPoolData();
  }

  async function handleCloseGrid() {
    pendingClose = true;
    await runCloseGrid(hookAddress, buildPoolKey(), deadlineMinutes);
    pendingClose = false;
    poolState = null;
    userState = null;
    gridConfig = null;
    gridOrders = [];
    plannedWeights = [];
    orderFees = [];
    await scanDeployedPositions();
    view = 'positions';
  }

  // ── Keeper ──
  let keeperAddress = '';
  let keeperAuthorized = true;
  let pendingKeeper = false;
  let showKeeper = false;
  let showGridOrdersTable = false;

  async function handleSetKeeper() {
    if (!keeperAddress) return;
    pendingKeeper = true;
    await runSetKeeper(hookAddress, keeperAddress as Address, keeperAuthorized);
    pendingKeeper = false;
  }

  // Advanced: manual config
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

</script>

<div class="max-w-[1080px] mx-auto px-4 pt-8 pb-16 flex flex-col gap-6">
  <!-- Page switch + advanced mode toggle -->
  <div class="flex items-center justify-between gap-3 flex-wrap">
    <div class="flex items-center gap-2">
      <a
        href="/wizard"
        use:link
        class="px-3 py-1.5 text-[0.78rem] font-bold rounded-lg border transition-colors duration-150 border-line text-muted"
      >
        Wizard
      </a>
      <a
        href="/profile"
        use:link
        class="px-3 py-1.5 text-[0.78rem] font-bold rounded-lg border transition-colors duration-150 border-accent text-accent bg-glow"
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

  {#if view === 'positions'}
    <!-- ═══════════════════════════════════════ -->
    <!-- ═══ POSITIONS VIEW ═══ -->
    <!-- ═══════════════════════════════════════ -->

    <div class="flex items-center justify-between flex-wrap gap-2">
      <h2 class="text-[1.3rem] font-extrabold">Your Grids</h2>
      <div class="flex items-center gap-2 flex-wrap">
        {#if deployedPositions.length > 1}
          <div class="flex items-center gap-1 text-[0.72rem] font-bold text-muted uppercase tracking-wider">
            <span>Sort:</span>
            <button
              class="px-2 py-0.5 rounded-md border transition-colors duration-150 {sortBy === 'default' ? 'border-accent text-accent bg-glow' : 'border-line text-muted hover:border-accent'}"
              on:click={() => sortBy = 'default'}
            >Default</button>
            <button
              class="px-2 py-0.5 rounded-md border transition-colors duration-150 {sortBy === 'apr' ? 'border-accent text-accent bg-glow' : 'border-line text-muted hover:border-accent'}"
              on:click={() => sortBy = 'apr'}
            >APR</button>
            <button
              class="px-2 py-0.5 rounded-md border transition-colors duration-150 {sortBy === 'liquidity' ? 'border-accent text-accent bg-glow' : 'border-line text-muted hover:border-accent'}"
              on:click={() => sortBy = 'liquidity'}
            >Liquidity</button>
          </div>
        {/if}
        <button class={btnPrimary} on:click={startNewGrid}>
          <span class="inline-flex items-center gap-1.5">&#x1FA84; Deploy a new Grid</span>
        </button>
      </div>
    </div>

    {#if scanningPositions}
      <div class="flex items-center gap-3 p-6">
        <div class="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full flex-shrink-0"></div>
        <span class="text-sm text-muted">Scanning pools&hellip;</span>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each sortedPositions as pos}
          <button
            class="text-left p-4 sm:p-5 rounded-[var(--radius-card)] border border-line bg-surface shadow-card hover:border-accent transition-colors duration-150 cursor-pointer"
            on:click={() => openPosition(pos)}
          >
            <div class="flex justify-between items-center mb-3">
              <div class="flex items-center gap-1">
              <TokenIcon symbol={pos.preset.currency0Symbol} size={20} />
              <TokenIcon symbol={pos.preset.currency1Symbol} size={20} />
              <span class="font-extrabold text-text text-[1.05rem]">{pos.preset.label}</span>
              </div>
              {#if pos.totalAmount0 > 0n || pos.totalAmount1 > 0n}
                <span class="text-sm font-semibold font-mono">~{totalValueInToken0(pos)}({pos.preset.currency0Symbol})</span>
              {/if}
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
              <div class="flex flex-col gap-0.5">
                <span class={statLabel}>Swaps</span>
                <span class="text-sm font-semibold font-mono">{pos.poolState.swapCount}</span>
              </div>
              {#if pos.apr != null}
                <div class="flex flex-col gap-0.5" title="APR = (fees ÷ capital) × (365d ÷ elapsed) × 100&#10;Both fees and capital are converted to token1 using the current tick price.">
                  <span class={statLabel}>APR</span>
                  <span class="text-sm font-extrabold font-mono text-success">{pos.apr.toFixed(2)}%</span>
                </div>
              {/if}
            </div>
            <div class="mt-3 pt-3 border-t border-line flex items-center justify-between">
              <span class="text-[0.72rem] text-muted">Fee: {(pos.preset.fee / 10000).toFixed(4)}%</span>
              <span class="text-[0.75rem] text-accent font-bold">Manage &rarr;</span>
            </div>
          </button>
        {/each}
      </div>
    {/if}

  {:else}
    <!-- ═══════════════════════════════════════ -->
    <!-- ═══ MANAGEMENT VIEW ═══ -->
    <!-- ═══════════════════════════════════════ -->

    <!-- Pool header -->
    <div class="flex items-center justify-between flex-wrap gap-2">
    <button
        class="text-[0.8rem] text-accent hover:underline bg-transparent border-none cursor-pointer"
        on:click={goBackToPositions}
      >
        &larr; {deployedPositions.length > 0 ? 'Your Grids' : 'Change Pool'}
      </button>
      <h2 class="text-[1.3rem] font-extrabold inline-flex items-center gap-1.5">
        <TokenIcon symbol={currency0Symbol} size={22} />
        <TokenIcon symbol={currency1Symbol} size={22} />
        {tokenLabel(currency0Symbol, currency0)} / {tokenLabel(currency1Symbol, currency1)}
      </h2>
    </div>

    <!-- Status cards -->
    <section class={card}>
      <div class="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <h2 class="text-[1.15rem] font-extrabold">Grid Status</h2>
        <div class="flex items-center gap-2 flex-wrap justify-end">
          {#if advancedMode}
            <label class="flex items-center gap-2">
              <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Deadline</span>
              <input class={inputCls} type="number" bind:value={deadlineMinutes} min="1" max="60" />
            </label>
          {/if}

          <button
            class={actionBtnPrimary}
            on:click={handleRebalance}
            disabled={pendingRebalance || (rebalanceEstimate != null && !rebalanceEstimate.thresholdMet)}
            aria-label={pendingRebalance ? 'Rebalancing' : rebalanceEstimate && !rebalanceEstimate.thresholdMet ? 'Threshold not met' : 'Rebalance grid'}
            title={pendingRebalance ? 'Rebalancing' : rebalanceEstimate && !rebalanceEstimate.thresholdMet ? 'Price hasn\u2019t moved enough to rebalance' : 'Rebalance grid'}
          >
            <span class:animate-spin={pendingRebalance}>
              <RefreshCw size={15} />
            </span>
          </button>
          <button
            class={actionBtnNeutral}
            on:click={() => fetchPoolData()}
            disabled={loadingData}
            aria-label={loadingData ? 'Refreshing' : 'Refresh data'}
            title={loadingData ? 'Refreshing' : 'Refresh data'}
          >
            <span class:animate-spin={loadingData}>
              <RotateCcw size={15} />
            </span>
          </button>
          <button
            class={actionBtnDanger}
            on:click={handleCloseGrid}
            disabled={pendingClose}
            aria-label={pendingClose ? 'Closing grid' : 'Close grid'}
            title={pendingClose ? 'Closing grid' : 'Close grid'}
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {#if rebalanceStepLabel}
        <p class="text-[0.8rem] text-accent mb-3 animate-pulse">{rebalanceStepLabel}</p>
      {/if}
      <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {#if poolState}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>{usingReferenceTick ? 'Market Tick (approx.)' : 'Current Tick'}</span>
            <span class="text-base font-semibold font-mono">{effectiveTick}{#if usingReferenceTick} <span class="text-[0.68rem] text-warning font-normal">via canonical pool</span>{/if}</span>
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
        {#if orderFees.length > 0 && (totalFees0 > 0n || totalFees1 > 0n)}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>{currency0Symbol || 'Token0'} Fees</span>
            <span class="text-base font-semibold font-mono text-success" title={formatRawTokenAmount(totalFees0, currency0Decimals)}>~{formatTokenAmount(totalFees0, currency0Decimals)}</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>{currency1Symbol || 'Token1'} Fees</span>
            <span class="text-base font-semibold font-mono text-success" title={formatRawTokenAmount(totalFees1, currency1Decimals)}>~{formatTokenAmount(totalFees1, currency1Decimals)}</span>
          </div>
        {/if}
        {#if aprData}
          <div class="flex flex-col gap-0.5" title="APR = (fees ÷ capital) × (365d ÷ elapsed) × 100&#10;Both fees and capital are converted to {currency1Symbol || 'Token1'} using the current tick price.">
            <span class={statLabel}>APR</span>
            <span class="text-base font-extrabold font-mono text-success">{aprData.apr.toFixed(2)}%</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Period</span>
            <span class="text-base font-semibold text-muted">{formatElapsed(aprData.elapsedSeconds)} ago</span>
          </div>
        {/if}
        {#if userState && userState.deployed}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Rebalances</span>
            <span class="text-base font-semibold font-mono">{userState.rebalanceCount}</span>
          </div>
        {/if}
      </div>
    </section>

    <!-- Rebalance Preview -->
    {#if rebalanceEstimate}
      <section class="{card} border-l-4 {rebalanceEstimate.thresholdMet ? 'border-l-accent' : 'border-l-warning'}">
        <h2 class="text-[1rem] font-extrabold mb-3">Rebalance Preview</h2>
        {#if !rebalanceEstimate.thresholdMet}
          <p class="text-[0.82rem] text-muted mb-2">
            Price hasn't moved enough to trigger a rebalance. The grid center would remain near tick {rebalanceEstimate.oldCenter}
            (current aligned tick: {rebalanceEstimate.newCenter}).
          </p>
        {:else}
          <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 text-[0.85rem]">
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>Center Tick Shift</span>
              <span class="font-semibold font-mono">{rebalanceEstimate.oldCenter} &rarr; {rebalanceEstimate.newCenter}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>{currency0Symbol || 'Token0'} Net</span>
              <span class="font-semibold font-mono {rebalanceEstimate.netDelta0 > 0n ? 'text-danger' : rebalanceEstimate.netDelta0 < 0n ? 'text-success' : 'text-text'}">
                {formatSignedDelta(rebalanceEstimate.netDelta0, currency0Decimals)}
              </span>
              {#if rebalanceEstimate.netDelta0 > 0n}
                <span class="text-[0.7rem] text-muted">additional needed</span>
              {:else if rebalanceEstimate.netDelta0 < 0n}
                <span class="text-[0.7rem] text-muted">returned to you</span>
              {/if}
            </div>
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>{currency1Symbol || 'Token1'} Net</span>
              <span class="font-semibold font-mono {rebalanceEstimate.netDelta1 > 0n ? 'text-danger' : rebalanceEstimate.netDelta1 < 0n ? 'text-success' : 'text-text'}">
                {formatSignedDelta(rebalanceEstimate.netDelta1, currency1Decimals)}
              </span>
              {#if rebalanceEstimate.netDelta1 > 0n}
                <span class="text-[0.7rem] text-muted">additional needed</span>
              {:else if rebalanceEstimate.netDelta1 < 0n}
                <span class="text-[0.7rem] text-muted">returned to you</span>
              {/if}
            </div>
          </div>
        {/if}
      </section>
    {/if}

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
        <button
          class="mb-4 flex items-center justify-between w-full text-left bg-transparent border-none cursor-pointer p-0"
          on:click={() => (showGridOrdersTable = !showGridOrdersTable)}
          aria-label={showGridOrdersTable ? 'Collapse grid orders table' : 'Expand grid orders table'}
        >
          <h2 class="text-[1.15rem] font-extrabold">Grid Orders ({gridOrders.length})</h2>
          <span class="text-muted text-lg">{showGridOrdersTable ? '\u25BE' : '\u25B8'}</span>
        </button>
        {#if showGridOrdersTable}
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">#</th>
                  <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">Tick Lower</th>
                  <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">Tick Upper</th>
                  <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">{currency0Symbol || 'Token0'}</th>
                  <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">{currency1Symbol || 'Token1'}</th>
                  <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">Fees {currency0Symbol || 'T0'}</th>
                  <th class="text-left text-[0.72rem] font-bold uppercase tracking-wider text-muted py-2 px-3 border-b border-line">Fees {currency1Symbol || 'T1'}</th>
                </tr>
              </thead>
              <tbody>
                {#each gridOrders as order, i}
                  {@const amounts = poolState ? orderAmounts(order, effectiveTick) : { amount0: 0n, amount1: 0n }}
                  {@const fees = orderFees[i] ?? { fees0: 0n, fees1: 0n }}
                  <tr>
                    <td class="py-2 px-3 border-b border-line">{i + 1}</td>
                    <td class="py-2 px-3 border-b border-line font-mono">{order.tickLower}</td>
                    <td class="py-2 px-3 border-b border-line font-mono">{order.tickUpper}</td>
                    <td class="py-2 px-3 border-b border-line font-mono">~{formatTokenAmount(amounts.amount0, currency0Decimals)}</td>
                    <td class="py-2 px-3 border-b border-line font-mono">~{formatTokenAmount(amounts.amount1, currency1Decimals)}</td>
                    <td class="py-2 px-3 border-b border-line font-mono text-success">~{formatTokenAmount(fees.fees0, currency0Decimals)}</td>
                    <td class="py-2 px-3 border-b border-line font-mono text-success">~{formatTokenAmount(fees.fees1, currency1Decimals)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </section>
    {/if}

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
