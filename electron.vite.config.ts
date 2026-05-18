import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: path.resolve(rootDir, 'electron/main.ts'),
          piSidecar: path.resolve(rootDir, 'electron/piSidecar.ts'),
        },
        external: [
          'better-sqlite3',
          '@earendil-works/pi-coding-agent',
        ],
        output: {
          entryFileNames: '[name].js',
        },
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: path.resolve(rootDir, 'electron/preload.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.js',
        },
      },
    },
  },
  renderer: {
    root: '.',
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: path.resolve(rootDir, 'index.html'),
        },
      },
    },
  },
})
