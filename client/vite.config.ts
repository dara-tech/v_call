import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tailwind runs via postcss.config.js (@tailwindcss/postcss) — avoids Vite plugin scan hangs.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    reportCompressedSize: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/hls.js')) return 'hls';
        },
      },
    },
  },
})
