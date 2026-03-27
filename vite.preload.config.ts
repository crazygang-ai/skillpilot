import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist-electron/electron/preload',
    emptyOutDir: false,
    sourcemap: true,
    minify: false,
    target: 'node20',
    lib: {
      entry: path.resolve(__dirname, 'electron/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['electron'],
    },
  },
})
