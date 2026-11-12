// Loads a module of src/ through Vite, so a script runs the same code as the app: TypeScript, JSON
// imports and the `@/` alias all resolve as they do there.
// Usage: import { load } from './load-src.mjs'; const { generateBrick } = await load('core/brick.ts')
import path from 'node:path'
import { runnerImport } from 'vite'

export const src = path.resolve(import.meta.dirname, '../src')

/** The exports of `file`, a path under src/. */
export const load = async (file) => (await runnerImport(path.join(src, file), { configFile: false, logLevel: 'error', resolve: { alias: { '@': src } } })).module
