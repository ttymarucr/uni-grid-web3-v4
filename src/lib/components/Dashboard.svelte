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
    grantPermit2Allowance,
  } from '$lib/contracts/permit2';
  import type { Address } from 'viem';

  const inputCls = 'py-2 px-3 border border-line rounded-[10px] bg-surface-strong text-text text-[0.9rem] focus:outline-2 focus:outline-accent focus:-outline-offset-1';
  const btnPrimary = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-accent text-white hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnOutline = 'cursor-pointer rounded-xl py-2.5 px-5 font-bold text-sm bg-transparent text-accent border border-accent hover:bg-glow disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const btnDanger = 'cursor-pointer border-none rounded-xl py-2.5 px-5 font-bold text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const card = 'bg-surface border border-line rounded-[var(--radius-card)] p-6 shadow-card';
  const labelCls = 'text-[0.78rem] font-bold text-muted uppercase tracking-wide';
  const statLabel = 'text-[0.72rem] font-bold text-muted uppercase tracking-wider';

  // ── Pool Key inputs ──
  let currency0 = '';
  let currency1 = '';
  let fee = 3000;
  let tickSpacing = 60;

  $: hookAddress = getGridHookAddress($chainIdStore);

  function buildPoolKey(): PoolKey {
    return {
      currency0: currency0 as Address,
      currency1: currency1 as Address,
      fee,
      tickSpacing,
      hooks: hookAddress,
    };
  }

  // ── Read state ──
  let gridConfig: GridConfig | null = null;
  let poolState: PoolState | null = null;
  let userState: UserGridState | null = null;
  let gridOrders: GridOrder[] = [];
  let plannedWeights: bigint[] = [];
  let previewedWeights: bigint[] = [];
  let loadingReads = false;

  async function fetchAll() {
    if (!currency0 || !currency1) {
      addToast('error', 'Please enter both token addresses');
      return;
    }
    const user = $signerAddress as Address;
    if (!user) {
      addToast('error', 'Wallet not connected');
      return;
    }
    loadingReads = true;
    try {
      const key = buildPoolKey();
      const [cfg, pState, uState, orders, weights] = await Promise.all([
        getGridConfig(hookAddress, key, user),
        getPoolState(hookAddress, key),
        getUserState(hookAddress, key, user),
        getGridOrders(hookAddress, key, user),
        getPlannedWeights(hookAddress, key, user),
      ]);
      gridConfig = cfg;
      poolState = pState;
      userState = uState;
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
      previewedWeights = await previewWeights(hookAddress, previewGridLength, previewDistType);
    } catch (e: any) {
      addToast('error', `Preview failed: ${e.shortMessage || e.message}`);
    } finally {
      loadingPreview = false;
    }
  }

  // ── Shared deadline ──
  let deadlineMinutes = 5;

  // ── Set Grid Config (write) ──
  let cfgGridSpacing = 60;
  let cfgMaxOrders = 10;
  let cfgRebalanceBps = 500;
  let cfgDistType = 0;
  let cfgAutoRebalance = true;
  let cfgMaxSlippageDelta0 = '0';
  let cfgMaxSlippageDelta1 = '0';
  let pendingSetConfig = false;

  async function handleSetGridConfig() {
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
      })
    );
    pendingSetConfig = false;
  }

  // ── Deploy Grid (write) ──
  let deployLiquidity = '';
  let deployMaxDelta0 = '0';
  let deployMaxDelta1 = '0';
  let pendingDeploy = false;

  async function handleDeployGrid() {
    if (!deployLiquidity) return;
    pendingDeploy = true;
    await executeTransaction('Deploy Grid', () =>
      writeDeployGrid(hookAddress, buildPoolKey(), BigInt(deployLiquidity), BigInt(deployMaxDelta0 || '0'), BigInt(deployMaxDelta1 || '0'), getDeadline(deadlineMinutes))
    );
    pendingDeploy = false;
  }

  // ── Rebalance (write) ──
  let pendingRebalance = false;

  async function handleRebalance() {
    const user = $signerAddress as Address;
    if (!user) return;
    pendingRebalance = true;
    await executeTransaction('Rebalance', () =>
      writeRebalance(hookAddress, buildPoolKey(), user, getDeadline(deadlineMinutes))
    );
    pendingRebalance = false;
  }

  // ── Close Grid (write) ──
  let pendingClose = false;

  async function handleCloseGrid() {
    pendingClose = true;
    await executeTransaction('Close Grid', () =>
      writeCloseGrid(hookAddress, buildPoolKey(), getDeadline(deadlineMinutes))
    );
    pendingClose = false;
  }

  // ── Permit2 Approvals ──
  const MAX_UINT160 = (1n << 160n) - 1n;
  const DEFAULT_EXPIRATION = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  let pendingPermit2Token0 = false;
  let pendingPermit2Token1 = false;
  let pendingAllowanceToken0 = false;
  let pendingAllowanceToken1 = false;

  async function handleApprovePermit2(token: string, isToken0: boolean) {
    if (isToken0) pendingPermit2Token0 = true; else pendingPermit2Token1 = true;
    await executeTransaction(`Approve ${isToken0 ? 'Token 0' : 'Token 1'} for Permit2`, () =>
      approveTokenForPermit2(token as Address, MAX_UINT160)
    );
    if (isToken0) pendingPermit2Token0 = false; else pendingPermit2Token1 = false;
  }

  async function handleGrantAllowance(token: string, isToken0: boolean) {
    if (isToken0) pendingAllowanceToken0 = true; else pendingAllowanceToken1 = true;
    await executeTransaction(`Grant ${isToken0 ? 'Token 0' : 'Token 1'} Allowance to Hook`, () =>
      grantPermit2Allowance(token as Address, hookAddress, MAX_UINT160, DEFAULT_EXPIRATION)
    );
    if (isToken0) pendingAllowanceToken0 = false; else pendingAllowanceToken1 = false;
  }

  // ── Keeper Authorization (write) ──
  let keeperAddress = '';
  let keeperAuthorized = true;
  let pendingKeeper = false;

  async function handleSetKeeper() {
    if (!keeperAddress) return;
    pendingKeeper = true;
    await executeTransaction(keeperAuthorized ? 'Authorize Keeper' : 'Revoke Keeper', () =>
      writeSetKeeper(hookAddress, keeperAddress as Address, keeperAuthorized)
    );
    pendingKeeper = false;
  }

  const DIST_LABELS = ['Flat', 'Linear', 'Reverse Linear', 'Fibonacci', 'Sigmoid', 'Logarithmic'];
</script>

<div class="max-w-[1080px] mx-auto px-4 pt-8 pb-16 flex flex-col gap-6">
  <!-- Pool Key -->
  <section class={card}>
    <h2 class="mb-4 text-[1.15rem] font-extrabold">Pool Key</h2>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4">
      <label class="flex flex-col gap-1">
        <span class={labelCls}>Currency 0</span>
        <input class={inputCls} type="text" bind:value={currency0} placeholder="0x…" />
      </label>
      <label class="flex flex-col gap-1">
        <span class={labelCls}>Currency 1</span>
        <input class={inputCls} type="text" bind:value={currency1} placeholder="0x…" />
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
    <button class={btnPrimary} on:click={fetchAll} disabled={loadingReads}>
      {loadingReads ? 'Loading…' : 'Fetch Pool Data'}
    </button>
  </section>

  <!-- Pool State (read-only display) -->
  {#if poolState}
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Pool State</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Initialized</span>
          <span class="text-base font-semibold">{poolState.initialized ? 'Yes' : 'No'}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Current Tick</span>
          <span class="text-base font-semibold font-mono">{poolState.currentTick}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Swap Count</span>
          <span class="text-base font-semibold">{poolState.swapCount}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- User Grid State (read-only display) -->
  {#if userState}
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Your Grid State</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Grid Deployed</span>
          <span class="text-base font-semibold">{userState.deployed ? 'Yes' : 'No'}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Grid Center Tick</span>
          <span class="text-base font-semibold font-mono">{userState.gridCenterTick}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- Grid Config (read-only) -->
  {#if gridConfig}
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Current Config</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Grid Spacing</span>
          <span class="text-base font-semibold font-mono">{gridConfig.gridSpacing}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Max Orders</span>
          <span class="text-base font-semibold">{gridConfig.maxOrders}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Rebalance Threshold</span>
          <span class="text-base font-semibold">{gridConfig.rebalanceThresholdBps} bps</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Distribution</span>
          <span class="text-base font-semibold">{DIST_LABELS[gridConfig.distributionType] ?? gridConfig.distributionType}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Auto Rebalance</span>
          <span class="text-base font-semibold">{gridConfig.autoRebalance ? 'On' : 'Off'}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Max Slippage Token 0</span>
          <span class="text-base font-semibold font-mono">{gridConfig.maxSlippageDelta0.toString()}</span>
        </div>
        <div class="flex flex-col gap-0.5">
          <span class={statLabel}>Max Slippage Token 1</span>
          <span class="text-base font-semibold font-mono">{gridConfig.maxSlippageDelta1.toString()}</span>
        </div>
      </div>
    </section>
  {/if}

  <!-- Set Grid Config -->
  {#if $connected}
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Set Grid Config</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4">
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Grid Spacing</span>
          <input class={inputCls} type="number" bind:value={cfgGridSpacing} />
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Max Orders</span>
          <input class={inputCls} type="number" bind:value={cfgMaxOrders} min="1" max="500" />
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Rebalance Threshold (bps)</span>
          <input class={inputCls} type="number" bind:value={cfgRebalanceBps} min="0" max="500" />
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Distribution Type</span>
          <select class={inputCls} bind:value={cfgDistType}>
            {#each DIST_LABELS as label, i}
              <option value={i}>{label}</option>
            {/each}
          </select>
        </label>
        <label class="flex flex-row items-center gap-2">
          <input class="w-[1.1rem] h-[1.1rem]" type="checkbox" bind:checked={cfgAutoRebalance} />
          <span class={labelCls}>Auto Rebalance</span>
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Max Slippage Token 0</span>
          <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta0} placeholder="0 = no limit" />
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Max Slippage Token 1</span>
          <input class={inputCls} type="text" bind:value={cfgMaxSlippageDelta1} placeholder="0 = no limit" />
        </label>
      </div>
      <button class={btnPrimary} on:click={handleSetGridConfig} disabled={pendingSetConfig}>
        {pendingSetConfig ? 'Sending…' : 'Set Config'}
      </button>
    </section>

    <!-- Shared Deadline -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Transaction Settings</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Deadline (minutes from now)</span>
          <input class={inputCls} type="number" bind:value={deadlineMinutes} min="1" max="60" />
        </label>
      </div>
    </section>

    <!-- Permit2 Token Approvals -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Permit2 Token Approvals</h2>
      <p class="mb-4 text-muted text-[0.9rem]">Approve your tokens for Permit2, then grant the hook spending allowance. Required before deploying a grid.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="flex flex-col gap-2">
          <span class={labelCls}>Token 0{currency0 ? `: ${currency0.slice(0, 6)}…${currency0.slice(-4)}` : ''}</span>
          <button class={btnOutline} on:click={() => handleApprovePermit2(currency0, true)} disabled={pendingPermit2Token0 || !currency0}>
            {pendingPermit2Token0 ? 'Sending…' : 'Approve for Permit2'}
          </button>
          <button class={btnOutline} on:click={() => handleGrantAllowance(currency0, true)} disabled={pendingAllowanceToken0 || !currency0}>
            {pendingAllowanceToken0 ? 'Sending…' : 'Grant Hook Allowance'}
          </button>
        </div>
        <div class="flex flex-col gap-2">
          <span class={labelCls}>Token 1{currency1 ? `: ${currency1.slice(0, 6)}…${currency1.slice(-4)}` : ''}</span>
          <button class={btnOutline} on:click={() => handleApprovePermit2(currency1, false)} disabled={pendingPermit2Token1 || !currency1}>
            {pendingPermit2Token1 ? 'Sending…' : 'Approve for Permit2'}
          </button>
          <button class={btnOutline} on:click={() => handleGrantAllowance(currency1, false)} disabled={pendingAllowanceToken1 || !currency1}>
            {pendingAllowanceToken1 ? 'Sending…' : 'Grant Hook Allowance'}
          </button>
        </div>
      </div>
    </section>

    <!-- Deploy Grid -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Deploy Grid</h2>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4">
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Total Liquidity</span>
          <input class={inputCls} type="text" bind:value={deployLiquidity} placeholder="e.g. 1000000000000000000" />
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Max Delta 0 (slippage)</span>
          <input class={inputCls} type="text" bind:value={deployMaxDelta0} placeholder="0 = no limit" />
        </label>
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Max Delta 1 (slippage)</span>
          <input class={inputCls} type="text" bind:value={deployMaxDelta1} placeholder="0 = no limit" />
        </label>
      </div>
      <button class="{btnPrimary} mt-2" on:click={handleDeployGrid} disabled={pendingDeploy || !deployLiquidity}>
        {pendingDeploy ? 'Sending…' : 'Deploy Grid'}
      </button>
    </section>

    <!-- Rebalance -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Rebalance</h2>
      <p class="mb-4 text-muted text-[0.9rem]">Trigger a grid rebalance around the current tick. Slippage is controlled by your grid config.</p>
      <button class={btnPrimary} on:click={handleRebalance} disabled={pendingRebalance}>
        {pendingRebalance ? 'Sending…' : 'Rebalance'}
      </button>
    </section>

    <!-- Close Grid -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Close Grid</h2>
      <p class="mb-4 text-muted text-[0.9rem]">Remove all grid orders and withdraw liquidity back to your wallet.</p>
      <button class={btnDanger} on:click={handleCloseGrid} disabled={pendingClose}>
        {pendingClose ? 'Sending…' : 'Close Grid'}
      </button>
    </section>

    <!-- Keeper Authorization -->
    <section class={card}>
      <h2 class="mb-4 text-[1.15rem] font-extrabold">Keeper Authorization</h2>
      <p class="mb-3 text-muted text-[0.9rem]">Authorize or revoke a keeper address to rebalance your grid on your behalf.</p>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 mb-4">
        <label class="flex flex-col gap-1">
          <span class={labelCls}>Keeper Address</span>
          <input class={inputCls} type="text" bind:value={keeperAddress} placeholder="0x…" />
        </label>
        <label class="flex flex-row items-center gap-2">
          <input class="w-[1.1rem] h-[1.1rem]" type="checkbox" bind:checked={keeperAuthorized} />
          <span class={labelCls}>Authorize</span>
        </label>
      </div>
      <button class={btnOutline} on:click={handleSetKeeper} disabled={pendingKeeper || !keeperAddress}>
        {pendingKeeper ? 'Sending…' : keeperAuthorized ? 'Authorize Keeper' : 'Revoke Keeper'}
      </button>
    </section>
  {/if}

  <!-- Grid Orders (read-only) -->
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

  <!-- Planned Weights -->
  {#if plannedWeights.length > 0}
    <section class={card}>
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
  <section class={card}>
    <h2 class="mb-4 text-[1.15rem] font-extrabold">Preview Weights</h2>
    <div class="flex items-end gap-4 flex-wrap mb-4">
      <label class="flex flex-col gap-1">
        <span class={labelCls}>Grid Length</span>
        <input class={inputCls} type="number" bind:value={previewGridLength} min="1" max="500" />
      </label>
      <label class="flex flex-col gap-1">
        <span class={labelCls}>Distribution</span>
        <select class={inputCls} bind:value={previewDistType}>
          {#each DIST_LABELS as label, i}
            <option value={i}>{label}</option>
          {/each}
        </select>
      </label>
      <button class={btnOutline} on:click={handlePreviewWeights} disabled={loadingPreview}>
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


