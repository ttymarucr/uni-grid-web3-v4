<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  export let weights: bigint[] = [];
  export let label = 'Weight Distribution';
  export let highlightCenter = true;

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  const ACCENT = '#176b52';
  const ACCENT_STRONG = '#0d4f3c';
  const MUTED = '#5e695f';

  function buildChart() {
    if (!canvas) return;
    if (chart) chart.destroy();

    const centerIdx = Math.floor(weights.length / 2);
    const labels = weights.map((_, i) => String(i + 1));
    const data = weights.map((w) => Number(w));
    const bgColors = weights.map((_, i) =>
      highlightCenter && i === centerIdx ? ACCENT_STRONG : ACCENT
    );

    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: bgColors,
          borderRadius: 2,
          barPercentage: 0.9,
          categoryPercentage: 0.95,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => `Order ${items[0].label}`,
              label: (item) => `${item.raw} bps`,
            },
          },
        },
        scales: {
          x: {
            display: true,
            ticks: {
              color: MUTED,
              font: { size: 9 },
              maxTicksLimit: 20,
              autoSkip: true,
            },
            grid: { display: false },
          },
          y: {
            display: true,
            beginAtZero: true,
            ticks: {
              color: MUTED,
              font: { size: 9 },
              maxTicksLimit: 5,
              callback: (v) => `${v}`,
            },
            grid: {
              color: 'rgba(29,38,31,0.08)',
            },
          },
        },
      },
    });
  }

  onMount(() => {
    if (weights.length > 0) buildChart();
  });

  afterUpdate(() => {
    buildChart();
  });

  onDestroy(() => {
    if (chart) chart.destroy();
  });
</script>

<div class="w-full">
  <p class="text-[0.72rem] font-bold text-muted uppercase tracking-wider mb-2">{label}</p>
  <div class="relative h-[160px]">
    <canvas bind:this={canvas}></canvas>
    {#if weights.length === 0}
      <div class="absolute inset-0 flex items-center justify-center text-sm text-muted">No data</div>
    {/if}
  </div>
</div>
