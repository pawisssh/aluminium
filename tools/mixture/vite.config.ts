import { execFileSync } from 'node:child_process'
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

// "branch · hash" at server start or build, shown in the header so a screenshot names its code.
// Vercel's build has no .git, so it falls back to Vercel's own git variables.
function buildLabel(): string {
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  try {
    return `${git('rev-parse', '--abbrev-ref', 'HEAD')} · ${git('rev-parse', '--short', 'HEAD')}${git('status', '--porcelain') ? '+' : ''}`
  } catch {
    const { VERCEL_GIT_COMMIT_REF: ref, VERCEL_GIT_COMMIT_SHA: sha } = process.env
    return ref && sha ? `${ref} · ${sha.slice(0, 7)}` : 'unknown build'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), logRoot()],
  define: { __BUILD__: JSON.stringify(buildLabel()) },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
