<script lang="ts">
  import { connected } from '$lib/stores/wallet';
  import SwapForm from './SwapForm.svelte';
</script>

<div class="max-w-[860px] mx-auto px-4 py-10">
  <h1 class="text-xl sm:text-2xl font-extrabold mb-1">Swap</h1>
  <p class="text-sm text-muted mb-6">Swap tokens through hooked pools to generate fee revenue for grid positions.</p>

  {#if $connected}
    <SwapForm />
  {:else}
    <div class="text-center py-16">
      <p class="text-3xl text-accent mb-4">◈</p>
      <h2 class="mb-2 text-xl font-bold">Connect your wallet</h2>
      <p class="text-muted text-sm">Connect a wallet to access the swap interface.</p>
    </div>
  {/if}
</div>
