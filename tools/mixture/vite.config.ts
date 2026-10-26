import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Every worktree's dev server listens on 5180, so the dev page says in the browser console which checkout it is served from.
const logRoot = (): Plugin => ({
  name: 'mixture-log-root',
  apply: 'serve',
  transformIndexHtml: () => [{ tag: 'script', children: `console.info(${JSON.stringify(`mixture dev: ${import.meta.dirname}`)})`, injectTo: 'head' }],
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), logRoot()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
