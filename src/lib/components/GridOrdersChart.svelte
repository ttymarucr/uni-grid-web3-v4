<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte';
  import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js';
  import type { Plugin } from 'chart.js';

  Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

  export let orders: Array<{ tickLower: number; tickUpper: number; liquidity: bigint }> = [];
  export let currentTick: number | null = null;
  export let centerTick: number | null = null;

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  const ACCENT = '#176b52';
  const RED = '#cc4444';
  const ACCENT_STRONG = '#0d4f3c';
  const MUTED = '#5e695f';

  // Custom plugin to draw vertical marker lines
  const tickLinesPlugin: Plugin = {
    id: 'tickLines',
    afterDraw(ch) {
      if (orders.length === 0) return;
      const ctx = ch.ctx;
      const xScale = ch.scales.x;
      const yScale = ch.scales.y;
      const top = yScale.top;
      const bottom = yScale.bottom;

      function drawLine(idx: number, color: string, labelText: string) {
        if (idx < 0 || idx >= orders.length) return;
        const x = xScale.getPixelForValue(idx);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label
        ctx.fillStyle = color;
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, x, top - 4);
        ctx.restore();
      }

      // Find the order index closest to currentTick
      if (currentTick != null) {
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < orders.length; i++) {
          const mid = (orders[i].tickLower + orders[i].tickUpper) / 2;
          const d = Math.abs(mid - currentTick);
          if (d < closestDist) { closestDist = d; closestIdx = i; }
        }
        drawLine(closestIdx, RED, `Tick: ${currentTick}`);
      }

      if (centerTick != null && centerTick !== currentTick) {
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < orders.length; i++) {
          const mid = (orders[i].tickLower + orders[i].tickUpper) / 2;
          const d = Math.abs(mid - centerTick);
          if (d < closestDist) { closestDist = d; closestIdx = i; }
        }
        drawLine(closestIdx, ACCENT_STRONG, `Center: ${centerTick}`);
      }
    },
  };

  function buildChart() {
    if (!canvas) return;
    if (chart) chart.destroy();
    if (orders.length === 0) return;

    const labels = orders.map((o) => `${o.tickLower}..${o.tickUpper}`);
    const data = orders.map((o) => Number(o.liquidity));

    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ACCENT,
          borderRadius: 2,
          barPercentage: 0.9,
          categoryPercentage: 0.95,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        layout: { padding: { top: 16 } },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => {
                const i = items[0].dataIndex;
                return `Order ${i + 1}`;
              },
              label: (item) => {
                const o = orders[item.dataIndex];
                return [
                  `Ticks: [${o.tickLower}, ${o.tickUpper}]`,
                  `Liquidity: ${o.liquidity.toString()}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            display: true,
            ticks: {
              color: MUTED,
              font: { size: 8 },
              maxTicksLimit: 15,
              autoSkip: true,
              maxRotation: 45,
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
            },
            grid: {
              color: 'rgba(29,38,31,0.08)',
            },
          },
        },
      },
      plugins: [tickLinesPlugin],
    });
  }

  onMount(() => {
    if (orders.length > 0) buildChart();
  });

  afterUpdate(() => {
    buildChart();
  });

  onDestroy(() => {
    if (chart) chart.destroy();
  });
</script>

<div class="w-full">
  <p class="text-[0.72rem] font-bold text-muted uppercase tracking-wider mb-2">Grid Orders — Tick Ranges</p>
  <div class="relative h-[200px]">
    <canvas bind:this={canvas}></canvas>
    {#if orders.length === 0}
      <div class="absolute inset-0 flex items-center justify-center text-sm text-muted">No orders</div>
    {/if}
  </div>
  {#if currentTick != null || centerTick != null}
    <div class="flex gap-4 mt-2 text-[0.7rem]">
      {#if currentTick != null}
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-0.5" style="background:{RED}"></span>
          <span class="text-muted">Current Tick: <span class="font-mono font-semibold">{currentTick}</span></span>
        </span>
      {/if}
      {#if centerTick != null}
        <span class="flex items-center gap-1">
          <span class="inline-block w-3 h-0.5" style="background:{ACCENT_STRONG}"></span>
          <span class="text-muted">Grid Center: <span class="font-mono font-semibold">{centerTick}</span></span>
        </span>
      {/if}
    </div>
  {/if}
</div>
