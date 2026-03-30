<script lang="ts">
  import { GRIDHOOK_ADDRESS, addressUrl } from '$lib/contracts/config';
</script>

<footer class="border-t border-line py-6 px-4 mt-auto">
  <div class="max-w-[1080px] mx-auto flex justify-between items-center text-[0.8rem]">
    <span class="text-muted">Uni Grid v4</span>
    <a class="font-mono text-[0.78rem] text-accent no-underline hover:underline" href={addressUrl(GRIDHOOK_ADDRESS)} target="_blank" rel="noreferrer">
      Contract: {GRIDHOOK_ADDRESS.slice(0, 6)}…{GRIDHOOK_ADDRESS.slice(-4)}
    </a>
  </div>
</footer>


