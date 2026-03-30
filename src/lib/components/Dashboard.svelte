<script lang="ts">
  import { connected } from '$lib/stores/wallet';
  import { GRIDHOOK_ADDRESS } from '$lib/contracts/config';
  import { executeTransaction } from '$lib/contracts/txWrapper';
  import { addToast } from '$lib/stores/toasts';
  import {
    getPoolConfig,
    getPoolState,
    getGridOrders,
    getPlannedWeights,
    previewWeights,
    setPoolConfig as writeSetPoolConfig,
    deployGrid as writeDeployGrid,
    rebalance as writeRebalance,
    type PoolKey,
    type GridConfig,
    type PoolRuntimeState,
    type GridOrder,
  } from '$lib/contracts/gridHook';

  // ── Pool Key inputs ──
  let currency0 = '';
  let currency1 = '';
  let fee = 3000;
  let tickSpacing = 60;

  function buildPoolKey(): PoolKey {
    return {
      currency0: currency0 as `0x${string}`,
      currency1: currency1 as `0x${string}`,
      fee,
      tickSpacing,
      hooks: GRIDHOOK_ADDRESS,
    };
  }

  // ── Read state ──
  let poolConfig: GridConfig | null = null;
  let poolState: PoolRuntimeState | null = null;
  let gridOrders: GridOrder[] = [];
  let plannedWeights: bigint[] = [];
  let previewedWeights: bigint[] = [];
  let loadingReads = false;

  async function fetchAll() {
    if (!currency0 || !currency1) {
      addToast('error', 'Please enter both token addresses');
      return;
    }
    loadingReads = true;
    try {
      const key = buildPoolKey();
      const [cfg, state, orders, weights] = await Promise.all([
        getPoolConfig(key),
        getPoolState(key),
        getGridOrders(key),
        getPlannedWeights(key),
      ]);
      poolConfig = cfg;
      poolState = state;
      gridOrders = orders;
      plannedWeights = weights;
    } catch (e: any) {
      addToast('error', `Read failed: ${e.shortMessage || e.message}`);
    } finally {
      loadingReads = false;
    }
  }

  // ── Preview weights ──
  let previewGridLength = 10;
  let previewDistType = 0;
  let loadingPreview = false;

  async function handlePreviewWeights() {
    loadingPreview = true;
    try {
      previewedWeights = await previewWeights(previewGridLength, previewDistType);
    } catch (e: any) {
      addToast('error', `Preview failed: ${e.shortMessage || e.message}`);
    } finally {
      loadingPreview = false;
    }
  }

  // ── Set Pool Config (write) ──
  let cfgGridSpacing = 60;
  let cfgMaxOrders = 10;
  let cfgRebalanceBps = 500;
  let cfgDistType = 0;
  let cfgAutoRebalance = true;
  let pendingSetConfig = false;

  async function handleSetPoolConfig() {
    pendingSetConfig = true;
    await executeTransaction('Set Pool Config', () =>
      writeSetPoolConfig(buildPoolKey(), {
        gridSpacing: cfgGridSpacing,
        maxOrders: cfgMaxOrders,
        rebalanceThresholdBps: cfgRebalanceBps,
        distributionType: cfgDistType,
        autoRebalance: cfgAutoRebalance,
      })
    );
    pendingSetConfig = false;
  }

  // ── Deploy Grid (write) ──
  let deployLiquidity = '';
  let pendingDeploy = false;

  async function handleDeployGrid() {
    if (!deployLiquidity) return;
    pendingDeploy = true;
    await executeTransaction('Deploy Grid', () =>
      writeDeployGrid(buildPoolKey(), BigInt(deployLiquidity))
    );
    pendingDeploy = false;
  }

  // ── Rebalance (write) ──
  let pendingRebalance = false;

  async function handleRebalance() {
    pendingRebalance = true;
    await executeTransaction('Rebalance', () =>
      writeRebalance(buildPoolKey())
    );
    pendingRebalance = false;
  }

  const DIST_LABELS = ['Flat', 'Linear', 'Reverse Linear', 'Fibonacci'];
</script>

<div class="max-w-[1080px] mx-auto px-4 pt-8 pb-16 flex flex-col gap-6">
  <!-- Pool Key -->
  <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
    <h2 class="mb-4 text-[1.15rem] font-extrabold">Pool Key</h2>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4">
      <label class="flex flex-col gap-1">
        <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Currency 0</span>
        <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="text" bind:value={currency0} placeholder="0x…" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Currency 1</span>
        <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="text" bind:value={currency1} placeholder="0x…" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Fee (bps)</span>
        <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="number" bind:value={fee} />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Tick Spacing</span>
        <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="number" bind:value={tickSpacing} />
      </label>
    </div>
    <button class="cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-white hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150" on:click={fetchAll} disabled={loadingReads}>
      {loadingReads ? 'Loading…' : 'Fetch Pool Data'}
    </button>
  </section>

  <!-- Pool State (read-only display) -->
  {#if poolState}
    <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Pool State</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Initialized</span>
          <span class="text-base font-semibold">{poolState.initialized ? 'Yes' : 'No'}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Grid Deployed</span>
          <span class="text-base font-semibold">{poolState.gridDeployed ? 'Yes' : 'No'}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Current Tick</span>
          <span class="text-base font-semibold font-mono">{poolState.currentTick}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Grid Center Tick</span>
          <span class="text-base font-semibold font-mono">{poolState.gridCenterTick}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Swap Count</span>
          <span class="text-base font-semibold">{poolState.swapCount}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Liquidity Ops</span>
          <span class="text-base font-semibold">{poolState.liquidityOperations}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- Pool Config (read + write) -->
  {#if poolConfig}
    <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Current Config</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Grid Spacing</span>
          <span class="text-base font-semibold font-mono">{poolConfig.gridSpacing}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Max Orders</span>
          <span class="text-base font-semibold">{poolConfig.maxOrders}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Rebalance Threshold</span>
          <span class="text-base font-semibold">{poolConfig.rebalanceThresholdBps} bps</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Distribution</span>
          <span class="text-base font-semibold">{DIST_LABELS[poolConfig.distributionType] ?? poolConfig.distributionType}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class="text-[0.72rem] font-bold text-muted uppercase tracking-wider">Auto Rebalance</span>
          <span class="text-base font-semibold">{poolConfig.autoRebalance ? 'On' : 'Off'}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- Set Pool Config -->
  {#if $connected}
    <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Set Pool Config</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4">
        <label class="flex flex-col gap-1">
          <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Grid Spacing</span>
          <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="number" bind:value={cfgGridSpacing} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Max Orders</span>
          <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="number" bind:value={cfgMaxOrders} min="1" max="1000" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Rebalance Threshold (bps)</span>
          <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="number" bind:value={cfgRebalanceBps} min="0" max="10000" />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Distribution Type</span>
          <select class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" bind:value={cfgDistType}>
            {#each DIST_LABELS as label, i}
              <option value={i}>{label}</option>
            {/each}
          </select>
        </label>
        <label class="flex flex-row items-center gap-2">
          <input class="w-[1.1rem] h-[1.1rem]" type="checkbox" bind:checked={cfgAutoRebalance} />
          <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Auto Rebalance</span>
        </label>
      </div>
      <button class="cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-white hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150" on:click={handleSetPoolConfig} disabled={pendingSetConfig}>
        {pendingSetConfig ? 'Sending…' : 'Set Config'}
      </button>
    </section>

    <!-- Deploy Grid -->
    <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Deploy Grid</h2>
      <label class="flex flex-col gap-1">
        <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Total Liquidity</span>
        <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="text" bind:value={deployLiquidity} placeholder="e.g. 1000000000000000000" />
      </label>
      <button class="cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-white hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150 mt-4" on:click={handleDeployGrid} disabled={pendingDeploy || !deployLiquidity}>
        {pendingDeploy ? 'Sending…' : 'Deploy Grid'}
      </button>
    </section>

    <!-- Rebalance -->
    <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Rebalance</h2>
      <p class="mb-4 text-muted text-[0.9rem]">Trigger a grid rebalance around the current tick.</p>
      <button class="cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-white hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150" on:click={handleRebalance} disabled={pendingRebalance}>
        {pendingRebalance ? 'Sending…' : 'Rebalance'}
      </button>
    </section>
  {/if}

  <!-- Grid Orders (read-only) -->
  {#if gridOrders.length > 0}
    <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
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

  <!-- Planned Weights -->
  {#if plannedWeights.length > 0}
    <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Planned Weights ({plannedWeights.length})</h2>
      <div class="flex items-end gap-[3px] h-[120px] mt-4 px-1">
        {#each plannedWeights as w, i}
          <div class="flex-1 flex flex-col items-center h-full justify-end" title="Order {i + 1}: {w.toString()} bps">
            <div class="w-full min-h-[2px] rounded-t bg-accent transition-[height] duration-300 ease-in-out" style="height: {Number(w) / 100}%"></div>
            <span class="text-[0.6rem] text-muted mt-0.5">{i + 1}</span>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Preview Weights -->
  <section class="bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card">
    <h2 class="mb-4 text-[1.15rem] font-extrabold">Preview Weights</h2>
    <div class="flex items-end gap-4 flex-wrap mb-4">
      <label class="flex flex-col gap-1">
        <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Grid Length</span>
        <input class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" type="number" bind:value={previewGridLength} min="1" max="1000" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[0.78rem] font-bold text-muted uppercase tracking-wide">Distribution</span>
        <select class="py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1" bind:value={previewDistType}>
          {#each DIST_LABELS as label, i}
            <option value={i}>{label}</option>
          {/each}
        </select>
      </label>
      <button class="cursor-pointer rounded-xl py-2.5 px-5 font-bold text-sm bg-transparent text-accent border border-accent hover:bg-glow disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150" on:click={handlePreviewWeights} disabled={loadingPreview}>
        {loadingPreview ? 'Loading…' : 'Preview'}
      </button>
    </div>
    {#if previewedWeights.length > 0}
      <div class="flex items-end gap-[3px] h-[120px] mt-4 px-1">
        {#each previewedWeights as w, i}
          <div class="flex-1 flex flex-col items-center h-full justify-end" title="Order {i + 1}: {w.toString()} bps">
            <div class="w-full min-h-[2px] rounded-t bg-accent transition-[height] duration-300 ease-in-out" style="height: {Number(w) / 100}%"></div>
            <span class="text-[0.6rem] text-muted mt-0.5">{i + 1}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>


