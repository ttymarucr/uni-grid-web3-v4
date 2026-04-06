<script lang="ts">
  import Icon from '@iconify/svelte';
  import { getChainIconId } from '$lib/icons/iconMap';

  /** Numeric chain ID (130 — Unichain). */
  export let chainId: number;
  /** Chain display name — used for fallback & aria-label. */
  export let name: string = '';
  /** Optional pixel size. Defaults to 20. */
  export let size: number = 20;
  /** Extra CSS classes forwarded to the wrapper. */
  let className: string = '';
  export { className as class };

  $: iconId = getChainIconId(chainId);
  $: initial = (name || String(chainId)).slice(0, 2).toUpperCase();
</script>

{#if iconId}
  <span class="inline-flex items-center justify-center shrink-0 {className}" style="width:{size}px;height:{size}px" aria-label="{name || chainId} icon">
    <Icon icon={iconId} width={size} height={size} />
  </span>
{:else}
  <span
    class="inline-flex items-center justify-center shrink-0 rounded-full bg-surface-strong text-muted font-bold select-none {className}"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.45)}px;line-height:1"
    aria-label="{name || chainId} icon"
  >
    {initial}
  </span>
{/if}
