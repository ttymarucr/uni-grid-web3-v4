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
  } from '$lib/contracts/permit2';
  import { getPresetsForChain, isNativeToken } from '$lib/contracts/poolPresets';
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
  let view: 'wizard' | 'manage' = 'wizard';
  let wizardStep = 1;
  let advancedMode = false;
  const WIZARD_STEPS = ['Pool', 'Strategy', 'Preview', 'Deploy'];

  // ── Hook address ──
  $: hookAddress = getGridHookAddress($chainIdStore);

  // ── Pool preset state ──
  let selectedPresetIdx = -1;
  let currency0 = '';
  let currency1 = '';
  let fee = 3000;
  let tickSpacing = 60;
  let currency0Symbol = '';
  let currency1Symbol = '';

  $: presets = getPresetsForChain($chainIdStore ?? 0);

  function selectPreset(idx: number) {
    selectedPresetIdx = idx;
    const p = presets[idx];
    if (p) {
      currency0 = p.currency0;
      currency1 = p.currency1;
      fee = p.fee;
      tickSpacing = p.tickSpacing;
      currency0Symbol = p.currency0Symbol;
      currency1Symbol = p.currency1Symbol;
    }
  }

  function tokenLabel(symbol: string, addr: string): string {
    if (symbol) return symbol;
    if (!addr) return '\u2014';
    return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
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
    poolState = null;
    userState = null;
    gridConfig = null;
    gridOrders = [];
    plannedWeights = [];
    view = 'wizard';
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

  // ── Read state ──
  let poolState: PoolState | null = null;
  let userState: UserGridState | null = null;
  let gridConfig: GridConfig | null = null;
  let gridOrders: GridOrder[] = [];
  let plannedWeights: bigint[] = [];
  let loadingData = false;

  // ── Preview state ──
  let previewedWeights: bigint[] = [];
  let previewedOrders: GridOrder[] = [];
  let loadingPreview = false;

  // ── Deploy state ──
  let deployLiquidity = '';
  let deployMaxDelta0 = '0';
  let deployMaxDelta1 = '0';
  let deploying = false;
  let deployStepLabel = '';
  let deadlineMinutes = 5;

  const MAX_UINT160 = (1n << 160n) - 1n;
  const permit2Expiration = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;

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
        cfgMaxSlippageDelta0 = cfg.maxSlippageDelta0.toString();
        cfgMaxSlippageDelta1 = cfg.maxSlippageDelta1.toString();
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
    const ok = await fetchPoolData();
    if (!ok) return;
    if (userState?.deployed) {
      view = 'manage';
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
    wizardStep = 3;
    triggerWeightPreview();
  }

  async function handlePreviewNext() {
    if (!deployLiquidity) {
      addToast('error', 'Please enter total liquidity');
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
        poolState.currentTick,
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

  // ── Unified deploy flow ──
  async function handleUnifiedDeploy() {
    const user = $signerAddress as Address;
    if (!user) return;
    deploying = true;
    try {
      // 1. Set grid config
      deployStepLabel = 'Setting grid configuration\u2026';
      await executeTransaction('Set Grid Config', () =>
        writeSetGridConfig(hookAddress, buildPoolKey(), {
          gridSpacing: cfgGridSpacing,
          maxOrders: cfgMaxOrders,
          rebalanceThresholdBps: cfgRebalanceBps,
          distributionType: cfgDistType,
          autoRebalance: cfgAutoRebalance,
          maxSlippageDelta0: BigInt(cfgMaxSlippageDelta0 || '0'),
          maxSlippageDelta1: BigInt(cfgMaxSlippageDelta1 || '0'),
        }),
      );

      // 2. Token approvals (skip native)
      const tokens = [
        { addr: currency0, label: tokenLabel(currency0Symbol, currency0) },
        { addr: currency1, label: tokenLabel(currency1Symbol, currency1) },
      ];
      for (const tok of tokens) {
        if (isNativeToken(tok.addr)) continue;

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
      await executeTransaction('Deploy Grid', () =>
        writeDeployGrid(
          hookAddress,
          buildPoolKey(),
          BigInt(deployLiquidity),
          BigInt(deployMaxDelta0 || '0'),
          BigInt(deployMaxDelta1 || '0'),
          getDeadline(deadlineMinutes),
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
    view = 'wizard';
    wizardStep = 1;
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
    await executeTransaction('Set Grid Config', () =>
      writeSetGridConfig(hookAddress, buildPoolKey(), {
        gridSpacing: cfgGridSpacing,
        maxOrders: cfgMaxOrders,
        rebalanceThresholdBps: cfgRebalanceBps,
        distributionType: cfgDistType,
        autoRebalance: cfgAutoRebalance,
        maxSlippageDelta0: BigInt(cfgMaxSlippageDelta0 || '0'),
        maxSlippageDelta1: BigInt(cfgMaxSlippageDelta1 || '0'),
      }),
    );
    pendingSetConfig = false;
  }

  let pendingManualDeploy = false;
  async function handleManualDeploy() {
    if (!deployLiquidity) return;
    pendingManualDeploy = true;
    await executeTransaction('Deploy Grid', () =>
      writeDeployGrid(hookAddress, buildPoolKey(), BigInt(deployLiquidity), BigInt(deployMaxDelta0 || '0'), BigInt(deployMaxDelta1 || '0'), getDeadline(deadlineMinutes)),
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

  {#if view === 'wizard'}
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
                <span class="block text-[0.72rem] text-muted mt-0.5">Fee: {preset.fee} bps &middot; Tick Spacing: {preset.tickSpacing}</span>
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
              <span class={labelCls}>Fee (bps)</span>
              <input class={inputCls} type="number" bind:value={fee} />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Tick Spacing</span>
              <input class={inputCls} type="number" bind:value={tickSpacing} />
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
              <input class={inputCls} type="number" bind:value={cfgGridSpacing} min="1" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Max Orders</span>
              <input class={inputCls} type="number" bind:value={cfgMaxOrders} min="1" max="500" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Rebalance Threshold (bps)</span>
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
                <span class={labelCls}>Max Slippage Token 0</span>
                <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta0} placeholder="0" />
              </label>
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Max Slippage Token 1</span>
                <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta1} placeholder="0" />
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
            <span class="text-sm font-semibold">{cfgRebalanceBps} bps</span>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Auto Rebalance</span>
            <span class="text-sm font-semibold">{cfgAutoRebalance ? 'On' : 'Off'}</span>
          </div>
          {#if poolState}
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>Current Tick</span>
              <span class="text-sm font-semibold font-mono">{poolState.currentTick}</span>
            </div>
            <div class="flex flex-col gap-0.5">
              <span class={statLabel}>Pool Initialized</span>
              <span class="text-sm font-semibold">{poolState.initialized ? 'Yes' : 'No'}</span>
            </div>
          {/if}
        </div>

        <!-- Liquidity & slippage inputs -->
        <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-5">
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Total Liquidity</span>
            <input class={inputCls} type="text" bind:value={deployLiquidity} placeholder="e.g. 1000000000000000000" />
          </label>
          {#if advancedMode}
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Max Delta 0 (slippage)</span>
              <input class={inputCls} type="text" bind:value={deployMaxDelta0} placeholder="0 = no limit" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Max Delta 1 (slippage)</span>
              <input class={inputCls} type="text" bind:value={deployMaxDelta1} placeholder="0 = no limit" />
            </label>
            <label class="flex flex-col gap-1">
              <span class={labelCls}>Deadline (min from now)</span>
              <input class={inputCls} type="number" bind:value={deadlineMinutes} min="1" max="60" />
            </label>
          {/if}
        </div>

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
              currentTick={poolState?.currentTick ?? null}
              centerTick={poolState?.currentTick ?? null}
            />
          </div>
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
          <div class="flex items-start gap-2">
            <span class="text-accent font-bold min-w-[1.2rem]">1.</span>
            <span>Set grid configuration on-chain</span>
          </div>
          {#if !isNativeToken(currency0)}
            <div class="flex items-start gap-2">
              <span class="text-accent font-bold min-w-[1.2rem]">2.</span>
              <span>Approve {tokenLabel(currency0Symbol, currency0)} (ERC-20 + Permit2, if needed)</span>
            </div>
          {/if}
          {#if !isNativeToken(currency1)}
            <div class="flex items-start gap-2">
              <span class="text-accent font-bold min-w-[1.2rem]">{isNativeToken(currency0) ? '2' : '3'}.</span>
              <span>Approve {tokenLabel(currency1Symbol, currency1)} (ERC-20 + Permit2, if needed)</span>
            </div>
          {/if}
          <div class="flex items-start gap-2">
            <span class="text-accent font-bold min-w-[1.2rem]">&rArr;</span>
            <span>Deploy grid with <span class="font-mono">{deployLiquidity || '0'}</span> total liquidity</span>
          </div>
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
                <button class={btnOutline} on:click={() => handleApprovePermit2(currency0, true)} disabled={pendingPermit2_0 || !currency0 || isNativeToken(currency0)}>
                  {pendingPermit2_0 ? 'Sending\u2026' : 'Approve for Permit2'}
                </button>
                <button class={btnOutline} on:click={() => handleGrantAllowance(currency0, true)} disabled={pendingAllow_0 || !currency0 || isNativeToken(currency0)}>
                  {pendingAllow_0 ? 'Sending\u2026' : 'Grant Hook Allowance'}
                </button>
              </div>
              <div class="flex flex-col gap-2">
                <span class={labelCls}>{tokenLabel(currency1Symbol, currency1)}</span>
                <button class={btnOutline} on:click={() => handleApprovePermit2(currency1, false)} disabled={pendingPermit2_1 || !currency1 || isNativeToken(currency1)}>
                  {pendingPermit2_1 ? 'Sending\u2026' : 'Approve for Permit2'}
                </button>
                <button class={btnOutline} on:click={() => handleGrantAllowance(currency1, false)} disabled={pendingAllow_1 || !currency1 || isNativeToken(currency1)}>
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
                <input class={inputCls} type="text" bind:value={deployMaxDelta0} placeholder="0" />
              </label>
              <label class="flex flex-col gap-1">
                <span class={labelCls}>Max Delta 1</span>
                <input class={inputCls} type="text" bind:value={deployMaxDelta1} placeholder="0" />
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
        on:click={() => { view = 'wizard'; wizardStep = 1; }}
      >
        &larr; Change Pool
      </button>
    </div>

    <!-- Status cards -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Grid Status</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {#if poolState}
          <div class="flex flex-col gap-0.5">
            <span class={statLabel}>Current Tick</span>
            <span class="text-base font-semibold font-mono">{poolState.currentTick}</span>
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
      </div>
    </section>

    <!-- Grid Orders Chart -->
    {#if gridOrders.length > 0}
      <section class={card}>
        <GridOrdersChart
          orders={gridOrders}
          currentTick={poolState?.currentTick ?? null}
          centerTick={userState?.gridCenterTick ?? null}
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
              </tr>
            </thead>
            <tbody>
              {#each gridOrders as order, i}
                <tr>
                  <td class="py-2 px-3 border-b border-line">{i + 1}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">{order.tickLower}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">{order.tickUpper}</td>
                  <td class="py-2 px-3 border-b border-line font-mono">{order.liquidity.toString()}</td>
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
            <span class={labelCls}>Rebalance Threshold (bps)</span>
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
            <span class={labelCls}>Max Slippage Token 0</span>
            <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta0} placeholder="0" />
          </label>
          <label class="flex flex-col gap-1">
            <span class={labelCls}>Max Slippage Token 1</span>
            <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta1} placeholder="0" />
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
