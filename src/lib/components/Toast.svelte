<script lang="ts">
  import { toasts, removeToast } from '$lib/stores/toasts';
  import { txUrl } from '$lib/contracts/config';
</script>

{#if $toasts.length > 0}
  <div class="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-[380px]" role="status" aria-live="polite">
    {#each $toasts as toast (toast.id)}
      <div class="toast flex items-start gap-2.5 py-3 px-4 rounded-[14px] bg-surface-strong border border-line shadow-card animate-slide-in
        {toast.type === 'pending' ? 'border-l-3 border-l-accent' : ''}
        {toast.type === 'success' ? 'border-l-3 border-l-[#2a9d5c]' : ''}
        {toast.type === 'error' ? 'border-l-3 border-l-[#c44]' : ''}
        {toast.type === 'info' ? 'border-l-3 border-l-muted' : ''}">
        <div class="shrink-0 w-[1.4rem] h-[1.4rem] flex items-center justify-center font-extrabold text-[0.9rem]
          {toast.type === 'success' ? 'text-[#2a9d5c]' : ''}
          {toast.type === 'error' ? 'text-[#c44]' : ''}
          {toast.type === 'pending' ? 'text-accent' : ''}">
          {#if toast.type === 'pending'}
            <span class="inline-block w-4 h-4 border-2 border-line border-t-accent rounded-full animate-spin" />
          {:else if toast.type === 'success'}
            ✓
          {:else if toast.type === 'error'}
            ✕
          {:else}
            ℹ
          {/if}
        </div>
        <div class="flex-1 min-w-0">
          <p class="m-0 text-sm leading-relaxed break-words">{toast.message}</p>
          {#if toast.txHash}
            <a class="inline-block mt-1 text-[0.78rem] text-accent no-underline hover:underline" href={txUrl(toast.txHash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          {/if}
        </div>
        <button class="shrink-0 bg-transparent border-none cursor-pointer text-[1.1rem] text-muted p-0 leading-none hover:text-text" on:click={() => removeToast(toast.id)} aria-label="Dismiss">×</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  @keyframes slide-in {
    from { opacity: 0; transform: translateX(1rem); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .animate-slide-in {
    animation: slide-in 0.25s ease-out;
  }
</style>
