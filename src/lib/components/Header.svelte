<script lang="ts">
  import { connected, signerAddress, chainId as chainIdStore, loading, disconnectWagmi, shortAddress } from '$lib/stores/wallet';
  import { unichain } from '$lib/wagmi/config';
  import { config } from '$lib/wagmi/client';
  import { connect } from '@wagmi/core';
  import { injected } from '@wagmi/connectors';

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

  $: wrongChain = $connected && $chainIdStore !== unichain.id;
</script>

<header class="sticky top-0 z-100 backdrop-blur-lg bg-surface border-b border-line">
  <div class="flex items-center justify-between max-w-[1080px] mx-auto py-3 px-4">
    <div class="flex items-center gap-2">
      <span class="w-6 h-6 bg-accent rounded-full"><img src="/logo.svg" alt="Uni Grid Logo" /></span>
      <span class="font-extrabold text-[1.1rem]">Uni Grid</span>
    </div>

    <div class="flex items-center gap-3">
      {#if $connected}
        {#if wrongChain}
          <span class="text-xs font-bold py-1 px-2.5 rounded-full bg-[rgba(200,50,50,0.15)] text-[#a33]">Wrong Network</span>
        {:else}
          <span class="text-xs font-bold py-1 px-2.5 rounded-full bg-glow text-accent-strong">{unichain.name}</span>
        {/if}
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


