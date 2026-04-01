<script lang="ts">
    import { onMount } from 'svelte';
    import { reconnect } from '@wagmi/core';
    import { config } from '$lib/wagmi/client';
    import { connected, wagmiLoaded } from '$lib/stores/wallet';
    import Header from '$lib/components/Header.svelte';
    import Footer from '$lib/components/Footer.svelte';
    import Dashboard from '$lib/components/Dashboard.svelte';
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
        {:else if $connected}
            <Dashboard />
        {:else}
            <div class="text-center py-24 px-4">
                <div class="mb-4 flex justify-center"><img class="w-24 h-24 bg-accent rounded-full" src="/logo.svg" alt="Uni Grid Logo"/></div>
                <h2 class="mb-2 text-2xl font-bold">Connect your wallet</h2>
                <p class="text-muted m-0">Connect a wallet to view and manage your grid positions.</p>
            </div>
        {/if}
    </main>

    <Footer />
    <Toast />
</div>

