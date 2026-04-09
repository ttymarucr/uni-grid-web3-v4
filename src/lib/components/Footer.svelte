<script lang="ts">
  import { chainId } from '$lib/stores/wallet';
  import { getGridHookAddress, addressUrl } from '$lib/contracts/config';

  $: hookAddress = getGridHookAddress($chainId);
  $: explorerLink = addressUrl($chainId, hookAddress);
</script>

<footer class="border-t border-line py-6 px-4 mt-auto">
  <div class="max-w-[1080px] mx-auto flex justify-between items-center text-[0.8rem]">
    <span class="text-muted">inGrid v4</span>
    {#if hookAddress !== '0x0000000000000000000000000000000000000000'}
      <a class="font-mono text-[0.78rem] text-accent no-underline hover:underline" href={explorerLink} target="_blank" rel="noreferrer">
        Contract: {hookAddress.slice(0, 6)}…{hookAddress.slice(-4)}
      </a>
    {:else}
      <span class="text-muted text-[0.78rem]">No contract deployed on this chain</span>
    {/if}
  </div>
</footer>


