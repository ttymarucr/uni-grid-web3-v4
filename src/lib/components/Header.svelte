<script lang="ts">
  import { connected, signerAddress, chainId as chainIdStore, loading, disconnectWagmi, shortAddress, chainName, onSupportedChain } from '$lib/stores/wallet';
  import { supportedChains } from '$lib/wagmi/config';
  import { config } from '$lib/wagmi/client';
  import { connect, switchChain } from '@wagmi/core';
  import { injected } from '@wagmi/connectors';
  import ChainIcon from './ChainIcon.svelte';
  import { link } from 'svelte-spa-router';

  let connecting = false;
  let menuOpen = false;

  const baseUrl = import.meta.env.BASE_URL;

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
      <span class="w-6 h-6"><img src="{baseUrl}logo.svg" alt="inGrid Logo" /></span>
      <span class="font-extrabold text-[1.1rem]">inGrid</span>
    </div>

    <!-- Desktop nav -->
    <nav class="hidden sm:flex items-center gap-4 text-sm font-semibold">
      <a href="/wizard" use:link class="text-muted hover:text-text transition-colors">Wizard</a>
      <a href="/swap" use:link class="text-muted hover:text-text transition-colors">Swap</a>
      <a href="/profile" use:link class="text-muted hover:text-text transition-colors">Profile</a>
    </nav>

    <!-- Desktop wallet controls -->
    <div class="hidden sm:flex items-center gap-3">
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

    <!-- Mobile hamburger button -->
    <button
      class="sm:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 bg-transparent border-none cursor-pointer"
      on:click={() => (menuOpen = !menuOpen)}
      aria-label="Toggle menu"
    >
      <span class="block w-5 h-0.5 bg-text rounded transition-transform duration-150" class:translate-y-[4px]={menuOpen} class:rotate-45={menuOpen}></span>
      <span class="block w-5 h-0.5 bg-text rounded transition-opacity duration-150" class:opacity-0={menuOpen}></span>
      <span class="block w-5 h-0.5 bg-text rounded transition-transform duration-150" class:-translate-y-[4px]={menuOpen} class:-rotate-45={menuOpen}></span>
    </button>
  </div>

  <!-- Mobile dropdown -->
  {#if menuOpen}
    <div class="sm:hidden border-t border-line bg-surface px-4 py-3 flex flex-col gap-3">
      <nav class="flex flex-col gap-2 text-sm font-semibold">
        <a href="/wizard" use:link class="text-muted hover:text-text transition-colors py-1" on:click={() => (menuOpen = false)}>Wizard</a>
        <a href="/swap" use:link class="text-muted hover:text-text transition-colors py-1" on:click={() => (menuOpen = false)}>Swap</a>
        <a href="/profile" use:link class="text-muted hover:text-text transition-colors py-1" on:click={() => (menuOpen = false)}>Profile</a>
      </nav>
      <div class="border-t border-line pt-3 flex flex-wrap items-center gap-2">
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
          <button class="cursor-pointer border border-line rounded-xl py-2 px-4 font-bold text-sm bg-transparent text-muted hover:bg-surface-strong transition-opacity duration-150" on:click={() => { disconnectWagmi(); menuOpen = false; }}>Disconnect</button>
        {:else}
          <button class="cursor-pointer border-none rounded-xl py-2 px-4 font-bold text-sm bg-accent text-white hover:bg-accent-strong transition-opacity duration-150 disabled:opacity-50 disabled:cursor-not-allowed" on:click={handleConnect} disabled={connecting || $loading}>
            {connecting || $loading ? 'Connecting…' : 'Connect Wallet'}
          </button>
        {/if}
      </div>
    </div>
  {/if}
</header>


