<script lang="ts">
  import { connected, signerAddress, chainId as chainIdStore } from '$lib/stores/wallet';
  import { getGridHookAddress, getSwapRouterAddress, PERMIT2_ADDRESS } from '$lib/contracts/config';
  import { executeTransaction, ensureChain, executeBatchTransaction, walletSupportsBatching, parseError, type BatchCall } from '$lib/contracts/txWrapper';
  import { addToast } from '$lib/stores/toasts';
  import { getPoolManagerSlot0, getPoolState, getDeadline, type PoolKey, type PoolState } from '$lib/contracts/gridHook';
  import {
    approveTokenForPermit2,
    erc20ApproveAbi,
    getTokenAllowanceForPermit2,
    grantPermit2Allowance,
    getPermit2Allowance,
    getTokenBalance,
  } from '$lib/contracts/permit2';
  import { getPresetsForChain, isNativeToken, type PoolPreset } from '$lib/contracts/poolPresets';
  import { getStoredPositions } from '$lib/contracts/customPositions';
  import { formatTokenAmount, formatRawTokenAmount, formatSmallDecimal, parseTokenAmount, getSqrtPriceAtTick, tickToPrice } from '$lib/contracts/tickMath';
  import { SLIPPAGE_OPTIONS } from '$lib/contracts/gridUiShared';
  import { executeSwap, simulateSwap, estimateSwapOutput, poolFeeToBps, SWAP_ROUTER_ABI } from '$lib/contracts/swapRouter';
  import TokenIcon from './TokenIcon.svelte';
  import TokenPair from './TokenPair.svelte';
  import type { Address } from 'viem';

  const inputCls = 'w-full py-3 px-4 border border-line rounded-[10px] bg-surface-strong text-text text-lg focus:outline-2 focus:outline-accent focus:-outline-offset-1';
  const btnPrimary = 'w-full cursor-pointer border-none rounded-xl py-3 px-5 font-bold text-sm bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150';
  const card = 'bg-surface border border-line rounded-[var(--radius-card)] p-4 sm:p-5 shadow-card';
  const labelCls = 'text-[0.78rem] font-bold text-muted uppercase tracking-wide';

  // ── Reactive state ──
  $: hookAddress = getGridHookAddress($chainIdStore);
  $: routerAddress = getSwapRouterAddress($chainIdStore);
  $: builtInPresets = getPresetsForChain($chainIdStore ?? 0);
  $: customPools = getStoredPositions($chainIdStore, $signerAddress);
  $: presets = deduplicatePools(builtInPresets, customPools);
  $: hasRouter = routerAddress !== '0x0000000000000000000000000000000000000000';

  let selectedPresetIdx = -1;
  let amountIn = '';
  let slippageBps = '50'; // 0.5% default
  let swapping = false;
  let approving = false;
  let direction: 'zeroForOne' | 'oneForZero' = 'zeroForOne';
  let invertPrice = false;

  // Pool data
  let currentTick = 0;
  let sqrtPriceX96 = 0n;
  let poolLoaded = false;
  let poolLoading = false;
  let swapPoolState: PoolState | null = null;

  // Balance
  let inputBalance = 0n;
  let balanceLoaded = false;

  // Batch swap (AA wallet)
  let walletCanBatch = false;
  let showSwapDropdown = false;
  const MAX_UINT160 = (1n << 160n) - 1n;

  $: if ($connected) {
    walletSupportsBatching().then(v => walletCanBatch = v);
  }

  function deduplicatePools(base: PoolPreset[], custom: PoolPreset[]): PoolPreset[] {
    const seen = new Set(base.map(p => `${p.currency0.toLowerCase()}-${p.currency1.toLowerCase()}-${p.fee}-${p.tickSpacing}`));
    const unique = custom.filter(p => !seen.has(`${p.currency0.toLowerCase()}-${p.currency1.toLowerCase()}-${p.fee}-${p.tickSpacing}`));
    return [...base, ...unique];
  }

  $: presetDivider = builtInPresets.length;
  $: selectedPreset = selectedPresetIdx >= 0 ? presets[selectedPresetIdx] : null;

  $: inputSymbol = selectedPreset
    ? (direction === 'zeroForOne' ? selectedPreset.currency0Symbol : selectedPreset.currency1Symbol)
    : '';
  $: outputSymbol = selectedPreset
    ? (direction === 'zeroForOne' ? selectedPreset.currency1Symbol : selectedPreset.currency0Symbol)
    : '';
  $: inputDecimals = selectedPreset
    ? (direction === 'zeroForOne' ? selectedPreset.currency0Decimals : selectedPreset.currency1Decimals)
    : 18;
  $: outputDecimals = selectedPreset
    ? (direction === 'zeroForOne' ? selectedPreset.currency1Decimals : selectedPreset.currency0Decimals)
    : 18;
  $: inputToken = selectedPreset
    ? (direction === 'zeroForOne' ? selectedPreset.currency0 : selectedPreset.currency1) as Address
    : null;
  $: isInputNative = inputToken ? isNativeToken(inputToken) : false;

  $: parsedAmountIn = parseTokenAmount(amountIn, inputDecimals);

  // Estimate output
  $: estimatedOutput = (selectedPreset && sqrtPriceX96 > 0n && parsedAmountIn > 0n)
    ? estimateSwapOutput(
        parsedAmountIn,
        sqrtPriceX96,
        direction === 'zeroForOne',
        poolFeeToBps(selectedPreset.fee),
        selectedPreset.currency0Decimals,
        selectedPreset.currency1Decimals,
      )
    : 0n;

  $: slippageNum = Number(slippageBps);
  $: minOutput = estimatedOutput > 0n
    ? estimatedOutput - (estimatedOutput * BigInt(slippageNum)) / 10000n
    : 0n;

  // Current price display
  $: currentPrice = poolLoaded && currentTick !== 0 ? tickToPrice(currentTick) : null;
  $: decimalAdjustment = selectedPreset ? Math.pow(10, selectedPreset.currency0Decimals - selectedPreset.currency1Decimals) : 1;
  $: displayPrice = currentPrice !== null ? (invertPrice ? 1 / (currentPrice * decimalAdjustment) : currentPrice * decimalAdjustment) : null;
  $: priceBaseSymbol = invertPrice ? selectedPreset?.currency1Symbol : selectedPreset?.currency0Symbol;
  $: priceQuoteSymbol = invertPrice ? selectedPreset?.currency0Symbol : selectedPreset?.currency1Symbol;

  function formatPrice(p: number): string {
    if (!isFinite(p) || p === 0) return '0';
    if (p >= 1e9) return p.toExponential(2);
    if (p >= 1) return p.toPrecision(6).replace(/\.?0+$/, '');
    if (p >= 0.0001) return p.toPrecision(4).replace(/\.?0+$/, '');
    const digits = Math.max(2, -Math.floor(Math.log10(p)) + 3);
    const fixed = p.toFixed(Math.min(digits, 18));
    return formatSmallDecimal(fixed) ?? fixed;
  }

  // ── Chain/preset reset ──
  let prevChainId: number | null = null;
  $: if ($chainIdStore !== prevChainId) {
    prevChainId = $chainIdStore;
    selectedPresetIdx = -1;
    amountIn = '';
    poolLoaded = false;
    inputBalance = 0n;
    balanceLoaded = false;
    swapPoolState = null;
  }

  async function selectPreset(idx: number) {
    selectedPresetIdx = idx;
    amountIn = '';
    poolLoaded = false;
    balanceLoaded = false;
    inputBalance = 0n;

    const preset = presets[idx];
    if (!preset) return;

    // Fetch pool data
    poolLoading = true;
    try {
      const key = buildPoolKey(preset);
      const [slot0, ps] = await Promise.all([
        getPoolManagerSlot0(hookAddress, key),
        getPoolState(hookAddress, key).catch(() => null),
      ]);
      sqrtPriceX96 = slot0.sqrtPriceX96;
      currentTick = slot0.tick;
      swapPoolState = ps;
      poolLoaded = true;
    } catch (err) {
      addToast('error', 'Failed to load pool data. Pool may not be initialized.');
      poolLoaded = false;
    } finally {
      poolLoading = false;
    }

    // Fetch balance
    await fetchBalance();
  }

  async function fetchBalance() {
    const user = $signerAddress;
    if (!user || !inputToken) return;
    try {
      inputBalance = await getTokenBalance(inputToken, user as Address);
      balanceLoaded = true;
    } catch {
      inputBalance = 0n;
      balanceLoaded = false;
    }
  }

  // Re-fetch balance when direction changes
  $: if (inputToken && $signerAddress && selectedPreset) {
    fetchBalance();
  }

  function flipDirection() {
    direction = direction === 'zeroForOne' ? 'oneForZero' : 'zeroForOne';
    amountIn = '';
  }

  function buildPoolKey(preset: PoolPreset): PoolKey {
    return {
      currency0: preset.currency0,
      currency1: preset.currency1,
      fee: preset.fee,
      tickSpacing: preset.tickSpacing,
      hooks: hookAddress,
    };
  }

  function setMaxAmount() {
    if (balanceLoaded && inputBalance > 0n) {
      amountIn = formatRawTokenAmount(inputBalance, inputDecimals);
    }
  }

  async function handleSwap() {
    if (!selectedPreset || !$signerAddress || parsedAmountIn === 0n) return;
    const user = $signerAddress as Address;

    swapping = true;

    const key = buildPoolKey(selectedPreset);
    const zeroForOne = direction === 'zeroForOne';

    // For exact-input swaps, amountSpecified is negative in v4
    const amountSpecified = -parsedAmountIn;

    try {
      await ensureChain();
      // Step 1: Approve token for Permit2 (if ERC-20)
      if (!isInputNative) {
        const allowance = await getTokenAllowanceForPermit2(inputToken!, user);
        if (allowance < parsedAmountIn) {
          approving = true;
          await executeTransaction('Approve token for Permit2', () =>
            approveTokenForPermit2(inputToken!, parsedAmountIn)
          );
          approving = false;
        }

        // Step 2: Grant Permit2 allowance to SwapRouter
        const permit2Allowance = await getPermit2Allowance(user, inputToken!, routerAddress);
        if (BigInt(permit2Allowance.amount) < parsedAmountIn) {
          approving = true;
          const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
          await executeTransaction('Approve SwapRouter via Permit2', () =>
            grantPermit2Allowance(inputToken!, routerAddress, parsedAmountIn, expiration)
          );
          approving = false;
        }
      }

      // Step 3: Simulate swap (catches reverts before wallet popup)
      const value = isInputNative ? parsedAmountIn : 0n;

      try {
        await simulateSwap(routerAddress, key, {
          zeroForOne,
          amountSpecified,
        }, value, user);
      } catch (simErr: any) {
        addToast('error', `Swap would fail: ${parseError(simErr)}`);
        return;
      }

      // Step 4: Execute swap

      await executeTransaction('Swap', () =>
        executeSwap(routerAddress, key, {
          zeroForOne,
          amountSpecified,
        }, value)
      );

      // Refresh balance after swap
      await fetchBalance();
      amountIn = '';

      // Refresh pool data
      try {
        const [slot0, ps] = await Promise.all([
          getPoolManagerSlot0(hookAddress, key),
          getPoolState(hookAddress, key).catch(() => null),
        ]);
        sqrtPriceX96 = slot0.sqrtPriceX96;
        currentTick = slot0.tick;
        swapPoolState = ps;
      } catch {}
    } catch (err: any) {
      // Error already handled by executeTransaction
    } finally {
      swapping = false;
      approving = false;
    }
  }

  async function handleBatchSwap() {
    if (!selectedPreset || !$signerAddress || parsedAmountIn === 0n) return;
    const user = $signerAddress as Address;

    swapping = true;
    showSwapDropdown = false;

    const key = buildPoolKey(selectedPreset);
    const zeroForOne = direction === 'zeroForOne';
    const amountSpecified = -parsedAmountIn;
    const sqrtPriceLimitX96 = zeroForOne
      ? 4295128740n   // MIN_SQRT_PRICE + 1
      : 1461446703485210103287273052203988822378723970341n; // MAX_SQRT_PRICE - 1

    try {
      await ensureChain();

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

      // Approvals (skip for native input)
      let approvalsAlreadySufficient = isInputNative;
      if (!isInputNative) {
        const erc20Allowance = await getTokenAllowanceForPermit2(inputToken!, user);
        if (erc20Allowance < MAX_UINT160 / 2n) {
          calls.push({
            to: inputToken!,
            abi: erc20ApproveAbi,
            functionName: 'approve',
            args: [PERMIT2_ADDRESS, MAX_UINT160],
          });
        }

        const p2 = await getPermit2Allowance(user, inputToken!, routerAddress);
        if (p2.amount < MAX_UINT160 / 2n) {
          const expiration = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
          calls.push({
            to: PERMIT2_ADDRESS,
            abi: permit2ApproveAbi,
            functionName: 'approve',
            args: [inputToken!, routerAddress, MAX_UINT160, expiration],
          });
        }

        approvalsAlreadySufficient = erc20Allowance >= MAX_UINT160 / 2n && p2.amount >= MAX_UINT160 / 2n;
      }

      // Simulate swap (only reliable when approvals are already on-chain)
      if (approvalsAlreadySufficient) {
        try {
          await simulateSwap(routerAddress, key, {
            zeroForOne,
            amountSpecified,
            sqrtPriceLimitX96,
          }, isInputNative ? parsedAmountIn : 0n, user);
        } catch (simErr: any) {
          addToast('error', `Swap would fail: ${parseError(simErr)}`);
          return;
        }
      }

      // Swap call
      const value = isInputNative ? parsedAmountIn : 0n;
      calls.push({
        to: routerAddress,
        abi: SWAP_ROUTER_ABI as readonly any[],
        functionName: 'swap',
        args: [key, { zeroForOne, amountSpecified, sqrtPriceLimitX96 }, '0x'],
        value,
      });

      await executeBatchTransaction('Swap', calls);

      // Refresh balance & pool data
      await fetchBalance();
      amountIn = '';
      try {
        const [slot0, ps] = await Promise.all([
          getPoolManagerSlot0(hookAddress, key),
          getPoolState(hookAddress, key).catch(() => null),
        ]);
        sqrtPriceX96 = slot0.sqrtPriceX96;
        currentTick = slot0.tick;
        swapPoolState = ps;
      } catch {}
    } catch (err: any) {
      // Error already handled by executeBatchTransaction
    } finally {
      swapping = false;
    }
  }

  $: canSwap =
    $connected &&
    hasRouter &&
    selectedPreset &&
    poolLoaded &&
    parsedAmountIn > 0n &&
    !swapping &&
    !approving;

  $: buttonLabel = !$connected
    ? 'Connect Wallet'
    : !hasRouter
    ? 'SwapRouter not deployed'
    : !selectedPreset
    ? 'Select a pool'
    : !poolLoaded
    ? 'Loading pool…'
    : parsedAmountIn === 0n
    ? 'Enter an amount'
    : approving
    ? 'Approving…'
    : swapping
    ? 'Swapping…'
    : 'Swap';
</script>

<div class="max-w-[480px] mx-auto space-y-4">
  <!-- Pool selector -->
  <div class={card}>
    <p class={labelCls + ' mb-3'}>Pool</p>
    <div class="flex flex-wrap gap-2">
      {#each presets as preset, i}
        {#if i === presetDivider && presetDivider > 0 && presets.length > presetDivider}
          <div class="w-full border-t border-line my-1"></div>
          <p class="w-full text-[0.68rem] text-muted font-semibold uppercase tracking-wide">Your pools</p>
        {/if}
        <button
          class="cursor-pointer text-xs font-semibold py-1.5 px-3 rounded-full border transition-colors duration-150
            {selectedPresetIdx === i
              ? 'border-accent bg-glow text-accent'
              : 'border-line bg-surface-strong text-muted hover:border-accent'}"
          on:click={() => selectPreset(i)}
        >
          <span class="inline-flex items-center gap-1">
            <TokenPair symbol0={preset.currency0Symbol} symbol1={preset.currency1Symbol} size={14} />
            {preset.label}
            <span class="text-[0.65rem] text-muted">({(preset.fee / 10000).toFixed(4)}%)</span>
          </span>
        </button>
      {/each}
    </div>
    {#if presets.length === 0}
      <p class="text-sm text-muted mt-2">No pools available on this chain.</p>
    {/if}
  </div>

  {#if selectedPreset}
    <!-- Pool info -->
    {#if poolLoading}
      <div class={card + ' text-center'}>
        <p class="text-sm text-muted">Loading pool data…</p>
      </div>
    {:else if poolLoaded}
      <div class={card + ' space-y-1 text-sm'}>
        <div class="flex justify-between">
          <span class="text-muted">Current Price</span>
          <span class="font-mono flex items-center gap-1">
            {#if displayPrice !== null}
              {formatPrice(displayPrice)}
              <span class="text-muted text-xs">{priceQuoteSymbol}/{priceBaseSymbol}</span>
              <button
                class="ml-1 text-muted hover:text-accent cursor-pointer bg-transparent border-none text-xs leading-none"
                title="Invert price"
                on:click={() => invertPrice = !invertPrice}
              >⇄</button>
            {:else}
              -
            {/if}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Fee</span>
          <span class="font-mono">{(selectedPreset.fee / 10000).toFixed(4)}%</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">Hook</span>
          <span class="font-mono text-xs">{hookAddress.slice(0, 8)}…{hookAddress.slice(-6)}</span>
        </div>
        {#if swapPoolState && swapPoolState.swapsThisBlock > 0}
          <div class="mt-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">
            This pool has had {swapPoolState.swapsThisBlock} swap{swapPoolState.swapsThisBlock > 1 ? 's' : ''} this block. Large swaps may be rejected by anti-sandwich protection.
          </div>
        {/if}
      </div>

      <!-- Input -->
      <div class={card}>
        <div class="flex items-center justify-between mb-2">
          <span class={labelCls}>You pay</span>
          {#if balanceLoaded}
            <button class="text-xs text-muted hover:text-accent cursor-pointer bg-transparent border-none" on:click={setMaxAmount}>
              Balance: {formatRawTokenAmount(inputBalance, inputDecimals)}
            </button>
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <TokenIcon symbol={inputSymbol} size={24} />
          <span class="font-bold text-sm min-w-[50px]">{inputSymbol}</span>
          <input
            type="text"
            class={inputCls + ' text-right'}
            placeholder="0.0"
            bind:value={amountIn}
            inputmode="decimal"
          />
        </div>
      </div>

      <!-- Flip button -->
      <div class="flex justify-center -my-1">
        <button
          class="cursor-pointer w-8 h-8 rounded-full border border-line bg-surface-strong text-muted hover:text-accent hover:border-accent transition-colors duration-150 flex items-center justify-center text-lg"
          on:click={flipDirection}
          title="Flip direction"
        >↕</button>
      </div>

      <!-- Output -->
      <div class={card}>
        <p class={labelCls + ' mb-2'}>You receive (estimated)</p>
        <div class="flex items-center gap-2">
          <TokenIcon symbol={outputSymbol} size={24} />
          <span class="font-bold text-sm min-w-[50px]">{outputSymbol}</span>
          <p class="flex-1 text-right text-lg font-mono text-text">
            {estimatedOutput > 0n ? formatRawTokenAmount(estimatedOutput, outputDecimals) : '0.0'}
          </p>
        </div>
        {#if estimatedOutput > 0n && slippageNum > 0}
          <p class="text-xs text-muted mt-2 text-right">
            Min. received: {formatRawTokenAmount(minOutput, outputDecimals)} {outputSymbol}
          </p>
        {/if}
      </div>

      <!-- Slippage -->
      <div class="flex items-center gap-2 text-xs">
        <span class="text-muted font-bold">Slippage:</span>
        {#each SLIPPAGE_OPTIONS as opt}
          <button
            class="cursor-pointer py-1 px-2.5 rounded-full border text-xs font-semibold transition-colors duration-150
              {slippageBps === opt.value
                ? 'border-accent bg-glow text-accent'
                : 'border-line bg-surface-strong text-muted hover:border-accent'}"
            on:click={() => (slippageBps = opt.value)}
          >{opt.label}</button>
        {/each}
      </div>

      <!-- Swap button -->
      {#if walletCanBatch}
        <div class="relative">
          <div class="flex">
            <button
              class="flex-1 cursor-pointer border-none rounded-l-xl rounded-r-none py-3 px-5 font-bold text-sm bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150"
              disabled={!canSwap}
              on:click={handleSwap}
            >
              {buttonLabel}
            </button>
            <button
              class="cursor-pointer border-none rounded-r-xl rounded-l-none py-3 px-2.5 font-bold text-sm bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150 border-l border-l-on-accent/20"
              disabled={!canSwap}
              on:click|stopPropagation={() => showSwapDropdown = !showSwapDropdown}
            >
              <span class="text-xs">▾</span>
            </button>
          </div>
          {#if showSwapDropdown}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="fixed inset-0 z-40" on:click={() => showSwapDropdown = false}></div>
            <div class="absolute right-0 mt-1 z-50 bg-surface border border-line rounded-xl shadow-card py-1 min-w-[200px]">
              <button
                class="w-full text-left cursor-pointer bg-transparent border-none px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface-strong transition-colors duration-150"
                on:click={handleBatchSwap}
              >
                Swap (Batched)
                <span class="block text-[0.68rem] text-muted font-normal mt-0.5">Approvals + swap in one call</span>
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <button class={btnPrimary} disabled={!canSwap} on:click={handleSwap}>
          {buttonLabel}
        </button>
      {/if}
    {/if}
  {:else if $connected}
    <div class={card + ' text-center'}>
      <p class="text-muted text-sm">Select a pool above to start swapping.</p>
    </div>
  {/if}
</div>
