<script lang="ts">
  import { connected, signerAddress, chainId as chainIdStore, loading, disconnectWagmi, shortAddress, chainName, onSupportedChain } from '$lib/stores/wallet';
  import { supportedChains } from '$lib/wagmi/config';
  import { config } from '$lib/wagmi/client';
  import { connect, switchChain } from '@wagmi/core';
  import { injected } from '@wagmi/connectors';
  import ChainIcon from './ChainIcon.svelte';
  import { link } from 'svelte-spa-router';

  let connecting = false;

  async function handleConnect() {
    connecting = true;
    try {
      await connect(config, { connector: injected() });
    } catch {
      // user rejected or other error
    } finally {
      connecting = false;
    }
  }

  async function handleSwitchChain(id: number) {
    try {
      await switchChain(config, { chainId: id });
    } catch {
      // user rejected
    }
  }
</script>

<header class="sticky top-0 z-100 backdrop-blur-lg bg-surface border-b border-line">
  <div class="flex items-center justify-between max-w-[1080px] mx-auto py-3 px-4">
    <div class="flex items-center gap-2">
      <span class="w-6 h-6 bg-accent rounded-full"><img src="/logo.svg" alt="Uni Grid Logo" /></span>
      <span class="font-extrabold text-[1.1rem]">Uni Grid</span>
    </div>

    <nav class="flex items-center gap-4 text-sm font-semibold">
      <a href="/wizard" use:link class="text-muted hover:text-text transition-colors">Wizard</a>
      <a href="/swap" use:link class="text-muted hover:text-text transition-colors">Swap</a>
      <a href="/profile" use:link class="text-muted hover:text-text transition-colors">Profile</a>
    </nav>

    <div class="flex items-center gap-3">
      {#if $connected}
        <ChainIcon chainId={$chainIdStore ?? 0} name={$chainName} size={18} />
        <select
          class="text-xs font-bold py-1 px-2.5 rounded-full border border-line bg-surface-strong text-text cursor-pointer focus:outline-accent"
          value={$chainIdStore}
          on:change={(e) => handleSwitchChain(Number(e.currentTarget.value))}
        >
          {#if !$onSupportedChain}
            <option disabled selected>Unsupported Network</option>
          {/if}
          {#each supportedChains as chain}
            <option value={chain.id}>{chain.name}</option>
          {/each}
        </select>
        <span class="font-mono text-sm text-muted">{$shortAddress}</span>
        <button class="cursor-pointer border border-line rounded-xl py-2 px-4 font-bold text-sm bg-transparent text-muted hover:bg-surface-strong transition-opacity duration-150" on:click={disconnectWagmi}>Disconnect</button>
      {:else}
        <button class="cursor-pointer border-none rounded-xl py-2 px-4 font-bold text-sm bg-accent text-white hover:bg-accent-strong transition-opacity duration-150 disabled:opacity-50 disabled:cursor-not-allowed" on:click={handleConnect} disabled={connecting || $loading}>
          {connecting || $loading ? 'Connecting…' : 'Connect Wallet'}
        </button>
      {/if}
    </div>
  </div>
</header>


