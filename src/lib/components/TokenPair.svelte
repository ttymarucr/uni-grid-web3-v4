<script lang="ts">
  import TokenIcon from './TokenIcon.svelte';

  /** Symbol for the first token. */
  export let symbol0: string;
  /** Symbol for the second token. */
  export let symbol1: string;
  /** Icon size in pixels. Defaults to 20. */
  export let size: number = 20;
  /** Extra CSS classes forwarded to the wrapper. */
  let className: string = '';
  export { className as class };

  $: pad = Math.round(size * 0.15);
  $: gap = Math.round(size * 0.1);
  $: capsuleW = size * 2 + gap + pad * 2;
  $: capsuleH = size + pad * 2;
  $: radius = capsuleH / 2;
</script>

<span
  class="inline-flex items-center justify-center shrink-0 bg-surface-strong border border-line rounded-full {className}"
  style="width:{capsuleW}px;height:{capsuleH}px;border-radius:{radius}px;gap:{gap}px;padding:0 {pad}px"
  aria-label="{symbol0}/{symbol1} pair"
>
  <TokenIcon symbol={symbol0} {size} />
  <TokenIcon symbol={symbol1} {size} />
</span>
