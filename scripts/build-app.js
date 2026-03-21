import { build } from 'esbuild'
import { execSync } from 'child_process'

// 1. Build Vite frontend
console.log('Building frontend...')
execSync('npx vite build', { stdio: 'inherit' })

// 2. Compile Electron main + server to CJS
console.log('Compiling Electron + server...')

const commonOpts = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  banner: {
    // Provide __dirname and __filename for CJS, handle import.meta.url
    js: `const __bundled_dirname = __dirname; const __bundled_filename = __filename;`,
  },
  // Replace import.meta references
  define: {
    'import.meta.url': 'require("url").pathToFileURL(__filename).toString()',
  },
}

// Can't use complex expressions in define — use a plugin instead
const importMetaPlugin = {
  name: 'import-meta',
  setup(build) {
    build.onResolve({ filter: /.*/ }, () => null)
    // Replace import.meta.url in the source
  },
}

await build({
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.mjs',
  external: ['electron'],
  banner: { js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);' },
})

await build({
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  entryPoints: ['server/index.ts'],
  outfile: 'dist-electron/server.mjs',
  external: ['electron'],
})

console.log('Build complete.')
