<script lang="ts">
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import Footer from '$lib/components/Footer.svelte';

  let isLoading = true;

  onMount(() => {
    // Simulate loading data
    setTimeout(() => {
      isLoading = false;
    }, 1000);
  });
</script>

<Header />

{#if isLoading}
  <div class="loading">Loading...</div>
{:else}
  <slot />
{/if}

<Footer />

<style>
  .loading {
    text-align: center;
    font-size: 1.5rem;
    margin: 2rem 0;
  }
</style>