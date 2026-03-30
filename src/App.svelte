<script>
    import { onMount } from 'svelte';

    const highlights = [
        'Client-rendered build with no server runtime',
        'Static assets ready for GitHub Pages publishing',
        'Base-path aware production output'
    ];

    let loading = true;

    onMount(() => {
        const timer = window.setTimeout(() => {
            loading = false;
        }, 700);

        return () => window.clearTimeout(timer);
    });
</script>

<svelte:head>
    <title>Uni Grid Web3 v4</title>
    <meta name="description" content="Static client-side deployment target for Uni Grid Web3 v4.">
</svelte:head>
    
<main class="shell">
    <section class="hero">
        <p class="eyebrow">Static deployment target</p>
        <h1>Uni Grid Web3 v4 is configured for GitHub Pages.</h1>
        <p class="lede">
            This build now runs entirely in the browser and emits static files only, which is the constraint GitHub Pages needs.
        </p>

        <div class="actions">
            <a class="button primary" href="https://pages.github.com/" target="_blank" rel="noreferrer">GitHub Pages docs</a>
            <a class="button secondary" href="https://vite.dev/guide/static-deploy.html" target="_blank" rel="noreferrer">Vite static deploy guide</a>
        </div>
    </section>

    <section class="panel status">
        <div>
            <p class="label">Render mode</p>
            <strong>Client-side SPA</strong>
        </div>
        <div>
            <p class="label">Output</p>
            <strong>dist/</strong>
        </div>
        <div>
            <p class="label">GitHub Pages base</p>
            <strong>/uni-grid-web3-v4/</strong>
        </div>
    </section>

    <section class="panel checklist">
        <div class="panel-head">
            <p class="label">Build readiness</p>
            <h2>{loading ? 'Checking static deployment constraints...' : 'Static deployment ready'}</h2>
        </div>

        <ul>
            {#each highlights as item}
                <li>{item}</li>
            {/each}
        </ul>
    </section>
</main>

<style>
    .shell {
        width: min(1080px, calc(100vw - 2rem));
        margin: 0 auto;
        padding: 3rem 0 4rem;
    }

    .hero {
        padding: 2rem 0 2.5rem;
    }

    .eyebrow,
    .label {
        margin: 0 0 0.75rem;
        color: var(--accent-strong);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-size: 0.78rem;
        font-weight: 800;
    }

    h1,
    h2,
    p {
        margin: 0;
    }

    h1 {
        max-width: 12ch;
        font-size: clamp(3.4rem, 7vw, 6.5rem);
        line-height: 0.95;
        letter-spacing: -0.05em;
    }

    .lede {
        max-width: 42rem;
        margin-top: 1.5rem;
        font-size: 1.1rem;
        color: var(--muted);
    }

    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.9rem;
        margin-top: 2rem;
    }

    .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 3.2rem;
        padding: 0.85rem 1.2rem;
        border-radius: 999px;
        text-decoration: none;
        font-weight: 700;
        transition: transform 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
    }

    .button:hover {
        transform: translateY(-1px);
    }

    .primary {
        color: #f6f2ea;
        background: var(--accent);
        box-shadow: 0 14px 30px var(--glow);
    }

    .secondary {
        color: var(--text);
        background: rgba(255, 255, 255, 0.52);
        border: 1px solid var(--line);
    }

    .panel {
        margin-top: 1.4rem;
        padding: 1.4rem;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--surface);
        backdrop-filter: blur(12px);
        box-shadow: var(--shadow);
    }

    .status {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .status strong {
        font-size: 1.05rem;
    }

    .panel-head {
        margin-bottom: 1rem;
    }

    .checklist ul {
        display: grid;
        gap: 0.8rem;
        padding: 0;
        margin: 0;
        list-style: none;
    }

    .checklist li {
        padding: 1rem 1.1rem;
        border-radius: 18px;
        background: var(--surface-strong);
        border: 1px solid rgba(29, 38, 31, 0.08);
    }

    @media (max-width: 760px) {
        .shell {
            width: min(100vw - 1.2rem, 1080px);
            padding-top: 1.6rem;
        }

        h1 {
            font-size: clamp(2.8rem, 14vw, 4.4rem);
        }

        .status {
            grid-template-columns: 1fr;
        }
    }
</style>