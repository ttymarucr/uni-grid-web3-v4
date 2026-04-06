<script lang="ts">
  import Icon from '@iconify/svelte';
  import { getTokenIconId, getMonogram } from '$lib/icons/iconMap';

  /** Token ticker symbol, e.g. "ETH", "USDC". */
  export let symbol: string;
  /** Optional pixel size. Defaults to 20. */
  export let size: number = 20;
  /** Extra CSS classes forwarded to the wrapper. */
  let className: string = '';
  export { className as class };

  $: iconId = getTokenIconId(symbol);
  $: monogram = getMonogram(symbol);
</script>

{#if iconId}
  <span class="inline-flex items-center justify-center shrink-0 {className}" style="width:{size}px;height:{size}px" aria-label="{symbol} icon">
    <Icon icon={iconId} width={size} height={size} />
  </span>
{:else}
  <span
    class="inline-flex items-center justify-center shrink-0 rounded-full bg-surface-strong text-muted font-bold select-none {className}"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.45)}px;line-height:1"
    aria-label="{symbol} icon"
  >
    {monogram}
  </span>
{/if}
