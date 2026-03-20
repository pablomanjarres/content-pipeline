import { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { fork, type ChildProcess } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged

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
    vibrancy: 'under-window',
    visualEffectState: 'active',
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

function createTray() {
  // 18x18 template image for menu bar (macOS standard)
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png')
  let trayIcon: Electron.NativeImage

  try {
    trayIcon = nativeImage.createFromPath(iconPath)
    trayIcon = trayIcon.resize({ width: 18, height: 18 })
    trayIcon.setTemplateImage(true)
  } catch {
    // Fallback: create a simple icon programmatically
    trayIcon = nativeImage.createEmpty()
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('Content Pipeline')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Open the-project-videos',
      click: () => shell.openPath(MEDIA_DIR),
    },
    {
      label: 'Open This Week\'s Folder',
      click: () => {
        const weekKey = getWeekKey()
        shell.openPath(path.join(MEDIA_DIR, weekKey))
      },
    },
    { type: 'separator' },
    {
      label: 'New Video...',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.executeJavaScript('window.location.hash = "pipeline"')
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    } else {
      createWindow()
    }
  })
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
