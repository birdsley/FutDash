import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

// GitHub Pages serves 404.html for unknown paths; a copy of the SPA shell lets
// deep links like /FutDash/match/15973 load and route client-side.
const spaFallback = {
  name: 'spa-404-fallback',
  apply: 'build' as const,
  closeBundle() {
    copyFileSync(resolve(__dirname, 'dist/index.html'), resolve(__dirname, 'dist/404.html'))
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), spaFallback],
  base: '/FutDash/',   // must match your GitHub repo name exactly (case-sensitive)
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          plotly: ['plotly.js-dist-min'],
          react:  ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
})
