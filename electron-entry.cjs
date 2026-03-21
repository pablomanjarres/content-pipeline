// Electron entry point
// In dev: loads electron/main.ts via tsx register
// In production: loads dist-electron/main.cjs (pre-compiled)

const path = require('path')
const fs = require('fs')

const compiled = path.join(__dirname, 'dist-electron', 'main.mjs')
if (fs.existsSync(compiled)) {
  import(require('url').pathToFileURL(compiled).href)
} else {
  // Dev mode — use tsx to load TypeScript
  require('tsx/cjs')
  require('./electron/main.ts')
}
