import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ mode }) => ({
  plugins: [svelte()],
  base: mode === 'production' ? process.env.BASE_PATH || '/uni-grid-web3-v4/' : '/',
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      $lib: '/src/lib',
      $routes: '/src/routes',
    },
  },
}));