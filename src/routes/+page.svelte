<script lang="ts">
  import Dashboard from '$lib/components/Dashboard.svelte';
  import { connected } from '$lib/stores/wallet';
</script>

<svelte:head>
  <title>Uni Grid — Dashboard</title>
</svelte:head>

{#if $connected}
  <Dashboard />
{:else}
  <div class="text-center py-24 px-4">
    <p class="text-3xl text-accent mb-4">◈</p>
    <h2 class="mb-2 text-2xl font-bold">Connect your wallet</h2>
    <p class="text-muted m-0">Connect a wallet to view and manage your grid positions.</p>
  </div>
{/if}