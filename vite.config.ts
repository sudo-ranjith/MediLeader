import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'

// vite-plugin-electron 0.29.x ignores rollupOptions.output.format for preloads
// when "type":"module" is set — it forces ESM and adds `export default require_preload()`
// which crashes the CJS loader. Fix: keep preload as a static .cjs file and copy it.
const copyPreloadPlugin = (): Plugin => ({
  name: 'copy-preload-cjs',
  configResolved() {
    fs.mkdirSync('dist-electron', { recursive: true });
    fs.copyFileSync('src/main/preload.cjs', 'dist-electron/preload.cjs');
  },
});

export default defineConfig({
  plugins: [
    react(),
    copyPreloadPlugin(),
    electron([
      {
        entry: 'src/main/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            sourcemap: true,
            rollupOptions: {
              external: ['electron', 'electron/main', 'better-sqlite3', 'bcryptjs', 'jsonwebtoken', 'uuid', 'path', 'fs', 'os', 'crypto'],
              output: { format: 'esm', entryFileNames: 'main.mjs' },
            },
          },
        },
        onstart(options) {
          const env = { ...process.env };
          delete env.ELECTRON_RUN_AS_NODE;
          options.startup(['.', '--no-sandbox'], { env });
        },
      },
    ]),
    renderer(),
  ],
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
      external: ['electron', 'better-sqlite3', 'bcryptjs', 'jsonwebtoken', 'path', 'fs', 'os', 'crypto']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer')
    }
  },
  server: {
    port: 5300,
    strictPort: false
  }
})
