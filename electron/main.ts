import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { fork, type ChildProcess } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let serverProcess: ChildProcess | null = null

const MEDIA_DIR = path.join(app.getPath('home'), 'Projects', 'the-project-videos')
const SERVER_PORT = 3001
const DEV_URL = 'http://localhost:5173'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
  } else {
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`)
  }

  mainWindow.on('close', (e) => {
    // Hide instead of close — app stays in menu bar
    if (process.platform === 'darwin') {
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
      label: 'Strategy',
      accelerator: 'CmdOrCtrl+4',
      click: () => showWindow('strategy'),
    },
    { type: 'separator' },

    // Folders
    {
      label: 'Open This Week\'s Folder',
      click: () => shell.openPath(path.join(MEDIA_DIR, weekKey)),
    },
    {
      label: 'Open the-project-videos',
      click: () => shell.openPath(MEDIA_DIR),
    },
    {
      label: 'Open Project Data',
      click: () => shell.openPath(path.join(__dirname, '..', 'data')),
    },
    { type: 'separator' },

    // Web
    {
      label: 'Open in Browser',
      click: () => shell.openExternal(isDev ? DEV_URL : `http://localhost:${SERVER_PORT}`),
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
    trayIcon = trayIcon.resize({ width: 18, height: 18 })
    trayIcon.setTemplateImage(true)
  } catch {
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Content Pipeline')

  buildTrayMenu()

  // Refresh stats in menu every 30 seconds
  setInterval(() => buildTrayMenu(), 30000)

  tray.on('click', () => showWindow())
}

function startServer() {
  const serverPath = path.join(__dirname, '..', 'server', 'index.ts')

  if (isDev) {
    // In dev, server is already running via npm run dev
    return
  }

  // In production, start the server
  serverProcess = fork(serverPath, [], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'pipe',
  })

  serverProcess.on('error', (err) => {
    console.error('Server error:', err)
  })
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
          label: 'Strategy',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.executeJavaScript('window.location.hash = "strategy"'),
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

// App lifecycle
app.on('ready', () => {
  // Set dock icon
  const dockIcon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon-512.png'))
  if (process.platform === 'darwin' && dockIcon && !dockIcon.isEmpty()) {
    app.dock.setIcon(dockIcon)
  }

  startServer()
  createAppMenu()
  createTray()
  createWindow()
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
  } else {
    createWindow()
  }
})

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
  }
})

// Keep app running when all windows closed (menu bar app)
app.on('window-all-closed', () => {
  // Don't quit on macOS — stays in menu bar
})
