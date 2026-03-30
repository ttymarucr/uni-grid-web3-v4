<script lang="ts">
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import Dashboard from '$lib/components/Dashboard.svelte';

  let isLoading = true;

  // Simulate data fetching
  setTimeout(() => {
    isLoading = false;
  }, 1000);
</script>

<Header />

{#if isLoading}
  <div class="loading">Loading...</div>
{:else}
  <Dashboard />
{/if}

<Footer />

<style>
  .loading {
    text-align: center;
    font-size: 1.5rem;
    margin-top: 2rem;
  }
</style>