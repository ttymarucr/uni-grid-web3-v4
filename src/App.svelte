<script lang="ts">
    import { onMount } from 'svelte';
    import { reconnect } from '@wagmi/core';
    import { config } from '$lib/wagmi/client';
    import { wagmiLoaded } from '$lib/stores/wallet';
    import Router from 'svelte-spa-router';
    import { routes } from '$lib/routes';
    import Header from '$lib/components/Header.svelte';
    import Footer from '$lib/components/Footer.svelte';
    import Toast from '$lib/components/Toast.svelte';

    onMount(async () => {
        await reconnect(config);
        wagmiLoaded.set(true);
    });
</script>

<svelte:head>
    <title>Uni Grid</title>
    <meta name="description" content="Uni Grid — Manage grid liquidity positions across multiple chains.">
</svelte:head>

<div class="flex flex-col min-h-screen">
    <Header />

    <main class="flex-1">
        {#if !$wagmiLoaded}
            <div class="text-center py-24 px-4">
                <p class="text-muted m-0">Loading…</p>
            </div>
        {:else}
            <Router {routes} />
        {/if}
    </main>

    <Footer />
    <Toast />
</div>

