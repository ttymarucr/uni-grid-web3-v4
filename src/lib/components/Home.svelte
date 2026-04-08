<script lang="ts">
  import { connected } from '$lib/stores/wallet';
  import { link } from 'svelte-spa-router';
</script>

{#if $connected}
  <div class="max-w-[860px] mx-auto px-4 py-14">
    <h1 class="text-2xl sm:text-3xl font-extrabold mb-2">Uni Grid</h1>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <a
        href="/wizard"
        use:link
        class="block rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-6 shadow-card glass hover:border-accent transition-colors duration-150"
      >
        <h2 class="text-xl font-bold mb-2">Wizard</h2>
        <p class="text-sm text-muted">Create and deploy a new grid with the step-by-step flow.</p>
      </a>
      <a
        href="/profile"
        use:link
        class="block rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-6 shadow-card glass hover:border-accent transition-colors duration-150"
      >
        <h2 class="text-xl font-bold mb-2">Profile</h2>
        <p class="text-sm text-muted">View your deployed grids, manage positions, and run actions.</p>
      </a>
      <a
        href="/swap"
        use:link
        class="block rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-6 shadow-card glass hover:border-accent transition-colors duration-150"
      >
        <h2 class="text-xl font-bold mb-2">Swap</h2>
        <p class="text-sm text-muted">Swap tokens directly through hooked pools, generating fee revenue for grid positions.</p>
      </a>
    </div>
  </div>
{:else}
  <div class="text-center py-24 px-4">
    <p class="text-3xl text-accent mb-4">◈</p>
    <h2 class="mb-2 text-2xl font-bold">Connect your wallet</h2>
    <p class="text-muted m-0">Connect a wallet to access the Wizard and Profile pages.</p>
  </div>
{/if}
