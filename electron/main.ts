import { app, BrowserWindow, Tray, Menu, nativeImage, shell, clipboard, dialog, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { fork, type ChildProcess } from 'child_process'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

// Set app name for Spotlight, dock, and menu bar
app.name = 'Content Pipeline'
if (process.platform === 'darwin') {
  app.setName('Content Pipeline')
}

// Enforce single instance — quit if another is already running
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverProcess: ChildProcess | null = null
let isQuitting = false
let localhostServerRunning = false
let autoReloadOnFileChanges = false
let autoReloadWatchers: fs.FSWatcher[] = []
let autoReloadTimer: NodeJS.Timeout | null = null

const SERVER_PORT = parseInt(process.env.CONTENT_PIPELINE_PORT || '3001', 10)
const DEV_URL = `http://localhost:${process.env.VITE_PORT || '5173'}`
const DATA_FILES = [
  'videos',
  'ideas',
  'clips',
  'posts',
  'actions',
  'templates',
  'sent-dms',
  'generator-runs',
]
const DEFAULT_FROZEN_TASKS = ['ig-short', 'tiktok-short', 'yt-short', 'reddit-post', 'yt-video']

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function getICloudDocumentsDir(): string | null {
  const dir = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
  return fs.existsSync(dir) ? dir : null
}

function getLocalProjectRoot(): string | null {
  const dir = path.join(os.homedir(), 'Projects', 'content-pipeline')
  return fs.existsSync(path.join(dir, 'data')) ? dir : null
}

function getLocalMediaRoot(): string {
  return path.join(os.homedir(), 'Projects', 'media')
}

function getSyncRoot(): string {
  const syncRoot = getICloudDocumentsDir() || app.getPath('documents')
  return path.join(syncRoot, 'Content Pipeline')
}

function getRuntimeRoot(): string {
  if (process.env.CONTENT_PIPELINE_ROOT) return process.env.CONTENT_PIPELINE_ROOT
  return getLocalProjectRoot() || getSyncRoot()
}

function copyDirIfUseful(from: string | undefined, to: string) {
  if (!from || from === to || !fs.existsSync(from) || fs.existsSync(to)) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false })
}

function ensureJsonArrayFile(filePath: string) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]')
}

function syncLocalDataToICloud(runtimeRoot: string) {
  const syncRoot = getSyncRoot()
  if (runtimeRoot === syncRoot) return

  const localDataRoot = path.join(runtimeRoot, 'data')
  const cloudDataRoot = path.join(syncRoot, 'data')
  if (!fs.existsSync(localDataRoot)) return

  const copyDataTree = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (name === '.DS_Store' || name.endsWith('.tmp')) continue
      const src = path.join(dir, name)
      const stat = fs.statSync(src)
      if (stat.isDirectory()) {
        copyDataTree(src)
        continue
      }
      if (!stat.isFile()) continue
      const rel = path.relative(localDataRoot, src)
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue
      const dst = path.join(cloudDataRoot, rel)
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
    }
  }

  copyDataTree(localDataRoot)
}

function normalizeProjectStorage(config: any, runtimeRoot: string) {
  const mediaRoot = getLocalProjectRoot() ? getLocalMediaRoot() : path.join(runtimeRoot, 'Media')
  fs.mkdirSync(mediaRoot, { recursive: true })

  let changed = false
  for (const project of config.projects || []) {
    const id = project.id || 'default'
    const videosDir = id === 'default'
      ? path.join(mediaRoot, 'videos')
      : path.join(mediaRoot, `${id}-videos`)
    const imagesDir = id === 'default'
      ? path.join(mediaRoot, 'images')
      : path.join(mediaRoot, `${id}-images`)

    const shouldUseLocalMedia = getLocalProjectRoot() && !isWithin(mediaRoot, project.mediaDir || '')
    if (!project.mediaDir || shouldUseLocalMedia) {
      copyDirIfUseful(project.mediaDir, videosDir)
      project.mediaDir = videosDir
      changed = true
    }
    if (!project.imagesDir || (getLocalProjectRoot() && !isWithin(mediaRoot, project.imagesDir || ''))) {
      copyDirIfUseful(project.imagesDir, imagesDir)
      project.imagesDir = imagesDir
      changed = true
    }
    if (!project.frozenTasks) {
      project.frozenTasks = DEFAULT_FROZEN_TASKS
      changed = true
    }

    fs.mkdirSync(project.mediaDir, { recursive: true })
    fs.mkdirSync(project.imagesDir, { recursive: true })
  }

  return changed
}

function ensureRuntimeStorage(): string {
  const runtimeRoot = getRuntimeRoot()
  const dataRoot = path.join(runtimeRoot, 'data')
  const bundledDataRoot = path.join(__dirname, '..', 'data')

  fs.mkdirSync(dataRoot, { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'projects', 'default'), { recursive: true })

  for (const file of DATA_FILES) {
    const topLevelPath = path.join(dataRoot, `${file}.json`)
    const projectPath = path.join(dataRoot, 'projects', 'default', `${file}.json`)
    const bundledTopLevel = path.join(bundledDataRoot, `${file}.json`)
    const bundledProject = path.join(bundledDataRoot, 'projects', 'default', `${file}.json`)

    if (!fs.existsSync(topLevelPath) && fs.existsSync(bundledTopLevel)) {
      fs.copyFileSync(bundledTopLevel, topLevelPath)
    }
    if (!fs.existsSync(projectPath) && fs.existsSync(bundledProject)) {
      fs.copyFileSync(bundledProject, projectPath)
    }
    ensureJsonArrayFile(topLevelPath)
    ensureJsonArrayFile(projectPath)
  }

  const topLevelWeekly = path.join(dataRoot, 'weekly.json')
  const projectWeekly = path.join(dataRoot, 'projects', 'default', 'weekly.json')
  const bundledWeekly = path.join(bundledDataRoot, 'weekly.json')
  const bundledProjectWeekly = path.join(bundledDataRoot, 'projects', 'default', 'weekly.json')
  if (!fs.existsSync(topLevelWeekly) && fs.existsSync(bundledWeekly)) fs.copyFileSync(bundledWeekly, topLevelWeekly)
  if (!fs.existsSync(projectWeekly) && fs.existsSync(bundledProjectWeekly)) fs.copyFileSync(bundledProjectWeekly, projectWeekly)
  if (!fs.existsSync(topLevelWeekly)) fs.writeFileSync(topLevelWeekly, '{}')
  if (!fs.existsSync(projectWeekly)) fs.writeFileSync(projectWeekly, '{}')

  const configPath = path.join(dataRoot, 'config.json')
  const bundledConfig = path.join(bundledDataRoot, 'config.json')
  if (!fs.existsSync(configPath) && fs.existsSync(bundledConfig)) {
    fs.copyFileSync(bundledConfig, configPath)
  }
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({
      activeProject: 'default',
      projects: [{
        id: 'default',
        name: 'Default',
        color: '#8b5cf6',
        mediaDir: path.join(getLocalProjectRoot() ? getLocalMediaRoot() : path.join(runtimeRoot, 'Media'), 'videos'),
        imagesDir: path.join(getLocalProjectRoot() ? getLocalMediaRoot() : path.join(runtimeRoot, 'Media'), 'images'),
        frozenTasks: DEFAULT_FROZEN_TASKS,
        createdAt: new Date().toISOString(),
      }],
    }, null, 2))
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  if (normalizeProjectStorage(config, runtimeRoot)) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  }
  syncLocalDataToICloud(runtimeRoot)

  return runtimeRoot
}

function mirrorChangedFileToICloud(filePath: string) {
  const syncRoot = getSyncRoot()
  const localDataRoot = path.resolve(getRuntimeRoot(), 'data')
  const source = path.resolve(filePath)
  if (!isWithin(localDataRoot, source)) return
  if (!fs.existsSync(source)) return

  const rel = path.relative(localDataRoot, source)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return
  const dest = path.join(syncRoot, 'data', rel)
  if (fs.statSync(source).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(source, dest)
  }
}

function scheduleAutoReload(changedPath?: string) {
  if (changedPath) {
    try { mirrorChangedFileToICloud(changedPath) } catch (e) { console.warn('Mirror changed file failed:', e) }
  }
  if (!autoReloadOnFileChanges) return
  if (autoReloadTimer) clearTimeout(autoReloadTimer)
  autoReloadTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.reloadIgnoringCache()
  }, 900)
}

function stopAutoReloadWatchers() {
  for (const watcher of autoReloadWatchers) watcher.close()
  autoReloadWatchers = []
  if (autoReloadTimer) {
    clearTimeout(autoReloadTimer)
    autoReloadTimer = null
  }
}

function startAutoReloadWatchers() {
  stopAutoReloadWatchers()
  const roots = [
    path.join(getRuntimeRoot(), 'data'),
  ].filter((p) => fs.existsSync(p))
  for (const root of roots) {
    try {
      autoReloadWatchers.push(fs.watch(root, { recursive: true }, (_event, filename) => {
        const changedPath = filename ? path.join(root, String(filename)) : root
        scheduleAutoReload(changedPath)
      }))
    } catch (e) {
      console.warn('Auto reload watcher failed:', root, e)
    }
  }
}

function setAutoReloadOnFileChanges(enabled: boolean) {
  autoReloadOnFileChanges = enabled
  if (autoReloadWatchers.length === 0) startAutoReloadWatchers()
  buildTrayMenu()
  createAppMenu()
}

function getLanIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return 'localhost'
}

function createWindow() {
  const appIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon-512.png'))

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Content Pipeline',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#000000',
    icon: appIcon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: isDev
        ? path.join(__dirname, '..', 'dist-electron', 'preload.js')
        : path.join(__dirname, 'preload.js'),
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Route ALL external links (target="_blank", window.open(_, '_blank'), etc.)
  // to the system default browser instead of opening a new BrowserWindow that
  // has no cookies / login state.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Belt and suspenders: also catch in-window navigations to off-app URLs and
  // redirect them to the system browser, keeping the app on its own origin.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() || ''
    try {
      const target = new URL(url)
      const here = new URL(current)
      const sameOrigin = target.origin === here.origin
      const isHttp = target.protocol === 'http:' || target.protocol === 'https:'
      if (isHttp && !sameOrigin) {
        event.preventDefault()
        shell.openExternal(url)
      }
    } catch {
      // ignore unparseable
    }
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
  } else {
    // Load from Express — it serves both API and static frontend
    // Retry until server is ready
    const loadWithRetry = async () => {
      for (let i = 0; i < 30; i++) {
        try {
          await mainWindow!.loadURL(`http://localhost:${SERVER_PORT}`)
          return
        } catch {
          await new Promise(r => setTimeout(r, 500))
        }
      }
    }
    loadWithRetry()
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting && process.platform === 'darwin') {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showWindow(hash?: string) {
  if (mainWindow) {
    mainWindow.show()
    mainWindow.focus()
    if (hash) mainWindow.webContents.executeJavaScript(`window.location.hash = "${hash}"`)
  } else {
    createWindow()
    if (hash) mainWindow!.webContents.once('did-finish-load', () => {
      mainWindow!.webContents.executeJavaScript(`window.location.hash = "${hash}"`)
    })
  }
}

async function getStats(): Promise<{ totalVideos: number; totalPosts: number; totalIdeas: number; byStatus: Record<string, number>; postsByStatus: Record<string, number> }> {
  try {
    const res = await fetch(`http://localhost:${SERVER_PORT}/api/stats`)
    return await res.json() as any
  } catch {
    return { totalVideos: 0, totalPosts: 0, totalIdeas: 0, byStatus: {}, postsByStatus: {} }
  }
}

async function buildTrayMenu() {
  const stats = await getStats()
  const weekKey = getWeekKey()
  const today = new Date()
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const dayName = dayNames[today.getDay()]
  const posted = stats.byStatus['posted'] || 0
  const inPipeline = stats.totalVideos - posted

  const contextMenu = Menu.buildFromTemplate([
    { label: `${dayName} — ${weekKey}`, enabled: false },
    { type: 'separator' },

    // Quick Stats
    { label: `${stats.totalVideos} Videos · ${stats.totalPosts} Posts · ${stats.totalIdeas} Ideas`, enabled: false },
    { label: `${inPipeline} in pipeline · ${posted} posted`, enabled: false },
    { type: 'separator' },

    // Navigate
    {
      label: 'Overview',
      accelerator: 'CmdOrCtrl+1',
      click: () => showWindow('dashboard'),
    },
    {
      label: 'Pipeline',
      accelerator: 'CmdOrCtrl+2',
      click: () => showWindow('pipeline'),
    },
    {
      label: 'Ideas',
      accelerator: 'CmdOrCtrl+3',
      click: () => showWindow('ideas'),
    },
    {
      label: 'Engine',
      accelerator: 'CmdOrCtrl+4',
      click: () => showWindow('engine'),
    },
    { type: 'separator' },

    // Folders
    {
      label: 'Open This Week\'s Folder',
      click: () => {
          const weekKey = getWeekKey()
          fetch(`http://localhost:${SERVER_PORT}/api/config/active`).then(r => r.json()).then((p: any) => shell.openPath(path.join(p.mediaDir, weekKey)))
        },
    },
    {
      label: 'Open Media',
      click: () => fetch(`http://localhost:${SERVER_PORT}/api/config/active`).then(r => r.json()).then((p: any) => shell.openPath(p.mediaDir)),
    },
    {
      label: 'Open Project Data',
      click: () => shell.openPath(path.join(getRuntimeRoot(), 'data')),
    },
    { type: 'separator' },

    {
      label: 'Auto Reload on CP Data Changes',
      type: 'checkbox',
      checked: autoReloadOnFileChanges,
      click: (item) => setAutoReloadOnFileChanges(item.checked),
    },
    {
      label: 'Sync CP Data to iCloud Now',
      click: () => {
        try { syncLocalDataToICloud(getRuntimeRoot()) } catch (e) { console.warn('CP data sync failed:', e) }
      },
    },
    { type: 'separator' },

    // Web — starts server if not running, then opens browser
    {
      label: 'Open in Browser',
      click: () => {
        if (isDev) {
          shell.openExternal(DEV_URL)
        } else {
          ensureServerAndOpen()
        }
      },
    },
    {
      label: 'Start Localhost',
      click: () => ensureServerAndOpen(),
    },
    {
      label: `${getLanIP()}:${SERVER_PORT}`,
      click: () => {
        clipboard.writeText(`http://${getLanIP()}:${SERVER_PORT}`)
        shell.openExternal(`http://${getLanIP()}:${SERVER_PORT}`)
      },
    },
    { type: 'separator' },

    {
      label: 'Quit Content Pipeline',
      accelerator: 'CmdOrCtrl+Q',
      click: () => app.quit(),
    },
  ])

  tray?.setContextMenu(contextMenu)
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png')
  let trayIcon: Electron.NativeImage

  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    trayIcon = trayIcon.resize({ width: 22, height: 22 })
    trayIcon.setTemplateImage(true)
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Content Pipeline')

  buildTrayMenu()

  // Refresh stats in menu every 30 seconds
  setInterval(() => buildTrayMenu(), 30000)

}

async function isServerReachable(): Promise<boolean> {
  try {
    await fetch(`http://localhost:${SERVER_PORT}/api/stats`)
    return true
  } catch {
    return false
  }
}

async function startServer() {
  if (isDev) {
    // In dev, server is already running via npm run dev
    return
  }

  // In production, import the compiled server (starts Express on PORT)
  try {
    process.env.NODE_ENV = 'production'
    process.env.CONTENT_PIPELINE_ROOT = ensureRuntimeStorage()
    process.env.CONTENT_PIPELINE_APP_ROOT = path.join(__dirname, '..')
    const serverPath = path.join(__dirname, 'server.mjs')
    await import(`file://${serverPath}`)
    console.log('Server started in-process')
  } catch (err) {
    console.error('Failed to start server:', err)
  }
}

async function ensureServerAndOpen() {
  const reachable = await isServerReachable()

  if (!reachable && !localhostServerRunning) {
    // Start the API server as a child process
    const serverScript = path.join(__dirname, '..', 'server', 'index.ts')
    serverProcess = fork(serverScript, [], {
      execArgv: ['--import', 'tsx'],
      env: {
        ...process.env,
        CONTENT_PIPELINE_ROOT: ensureRuntimeStorage(),
        CONTENT_PIPELINE_APP_ROOT: path.join(__dirname, '..'),
      },
      stdio: 'inherit',
    })
    localhostServerRunning = true

    serverProcess.on('exit', () => {
      localhostServerRunning = false
      serverProcess = null
    })

    // Wait for server to come up
    for (let i = 0; i < 20; i++) {
      if (await isServerReachable()) break
      await new Promise(r => setTimeout(r, 300))
    }
  }

  shell.openExternal(`http://localhost:${SERVER_PORT}`)
}

function getWeekKey(): string {
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  const jan1 = new Date(monday.getFullYear(), 0, 1)
  const weekNum = Math.ceil(((monday.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${monday.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

// macOS app menu
function createAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Video',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.executeJavaScript('window.location.hash = "pipeline"'),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Overview',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.executeJavaScript('window.location.hash = "dashboard"'),
        },
        {
          label: 'Pipeline',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.executeJavaScript('window.location.hash = "pipeline"'),
        },
        {
          label: 'Ideas',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.executeJavaScript('window.location.hash = "ideas"'),
        },
        {
          label: 'Engine',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.executeJavaScript('window.location.hash = "engine"'),
        },
        { type: 'separator' },
        {
          label: 'Auto Reload on CP Data Changes',
          type: 'checkbox',
          checked: autoReloadOnFileChanges,
          click: (item) => setAutoReloadOnFileChanges(item.checked),
        },
        {
          label: 'Sync CP Data to iCloud Now',
          click: () => {
            try { syncLocalDataToICloud(getRuntimeRoot()) } catch (e) { console.warn('CP data sync failed:', e) }
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// IPC: Export selected items from Photos via AppleScript
ipcMain.handle('pick-media', async (_, weekKey: string, date: string) => {
  const rootDir = process.env.CONTENT_PIPELINE_ROOT || path.join(__dirname, '..')
  const configPath = path.join(rootDir, 'data', 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const activeProject = config.projects.find((p: any) => p.id === config.activeProject)
  const destDir = path.join(activeProject.mediaDir, weekKey, `uploads-${date}`)
  fs.mkdirSync(destDir, { recursive: true })

  // Write AppleScript to a temp file to avoid shell escaping issues
  // Check if Photos is running and has a selection
  let photosRunning = false
  try {
    const check = execSync(`osascript -e 'tell application "System Events" to (name of processes) contains "Photos"'`, { encoding: 'utf-8' }).trim()
    photosRunning = check === 'true'
  } catch {}

  if (!photosRunning) {
    execSync(`open -a Photos`)
    mainWindow?.focus()
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Select media in Photos',
      message: 'Select the videos or photos you want to import in Photos, then click "Import from Photos" again.',
    })
    return { uploaded: 0 }
  }

  const scriptContent = [
    'tell application "Photos"',
    '  set sel to selection',
    '  if (count of sel) is 0 then',
    '    return "empty"',
    '  end if',
    '  set c to 0',
    '  repeat with item_ref in sel',
    '    try',
    `      export {item_ref} to POSIX file "${destDir}"`,
    '      set c to c + 1',
    '    end try',
    '  end repeat',
    '  return c as text',
    'end tell',
  ].join('\n')

  const scriptPath = path.join(destDir, '.import-script.scpt')
  fs.writeFileSync(scriptPath, scriptContent)

  try {
    const result = execSync(`osascript "${scriptPath}"`, {
      timeout: 120000,
      encoding: 'utf-8',
    }).trim()

    fs.unlinkSync(scriptPath)

    if (result === 'empty') {
      mainWindow?.focus()
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'No selection',
        message: 'Select videos or photos in the Photos app first, then click "Import from Photos" again.',
      })
      return { uploaded: 0 }
    }

    return { uploaded: parseInt(result) || 0 }
  } catch (err: any) {
    try { fs.unlinkSync(scriptPath) } catch {}
    dialog.showMessageBox(mainWindow!, {
      type: 'error',
      title: 'Import failed',
      message: 'Could not export from Photos. When macOS asks for permission, click Allow.',
    })
    return { uploaded: 0 }
  }
})

// App lifecycle
app.on('ready', async () => {
  // Set dock icon
  const dockIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon-512.png'))
  if (process.platform === 'darwin' && dockIcon && !dockIcon.isEmpty()) {
    app.dock.setIcon(dockIcon)
  }

  await startServer()

  // Wait for server to be ready in production
  if (!isDev) {
    for (let i = 0; i < 20; i++) {
      try {
        await fetch(`http://localhost:${SERVER_PORT}/api/stats`)
        break
      } catch {
        await new Promise(r => setTimeout(r, 250))
      }
    }
  }

  createAppMenu()
  createTray()
  createWindow()
  startAutoReloadWatchers()



})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
  } else {
    createWindow()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  stopAutoReloadWatchers()
  if (serverProcess) {
    serverProcess.kill()
  }
})

// Keep app running when all windows closed (menu bar app)
app.on('window-all-closed', () => {
  // Don't quit on macOS — stays in menu bar
})
