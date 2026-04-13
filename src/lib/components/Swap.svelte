<script lang="ts">
  import { connected } from '$lib/stores/wallet';
  import SwapForm from './SwapForm.svelte';
  const baseUrl = import.meta.env.BASE_URL;
</script>

<div class="max-w-[860px] mx-auto px-4 py-10 flex flex-col items-center">
  <h1 class="text-xl sm:text-2xl font-extrabold mb-1">Swap</h1>
  <p class="text-sm text-muted mb-6">Swap tokens through hooked pools to generate fee revenue for grid positions.</p>

  {#if $connected}
    <SwapForm />
  {:else}
    <div class="text-center py-16">
      <p class="w-24 h-24 mx-auto"><img src="{baseUrl}logo.svg" alt="inGrid Logo" /></p>
      <h2 class="mb-2 text-xl font-bold">Connect your wallet</h2>
      <p class="text-muted text-sm">Connect a wallet to access the swap interface.</p>
    </div>
  {/if}
</div>
