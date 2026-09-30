import { app, BrowserWindow, dialog, ipcMain, Menu, screen } from 'electron'
import type { OpenDialogOptions } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { ControlLayout, DisplayInfo, SoundPickResult, SoundSlot, TimerSettings, TimerState } from '../shared'

const COMPACT_WINDOW = { width: 980, height: 820, minWidth: 760, minHeight: 640 }
const EXPANDED_WINDOW = { width: 1440, height: 900, minWidth: 1100, minHeight: 720 }

// Electron 43 can crash while starting its GPU process on macOS 15 before the
// first window is created. This timer does not need GPU acceleration, so use
// the stable software-rendering path on macOS before Electron becomes ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
if (process.platform === 'darwin') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
}

let controlWindow: BrowserWindow | null = null
const outputWindows = new Map<number, BrowserWindow>()
let liveTimer: TimerState | null = null
let liveDisplayIds: number[] = []
let pendingSettings: TimerSettings | null = null
let settingsWriteTimer: NodeJS.Timeout | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'event-timer-settings.json')
}

function legacySettingsPaths(): string[] {
  const folder = app.getPath('userData')
  const appData = app.getPath('appData')
  return [
    join(folder, 'timer-plus-settings.json'),
    join(appData, 'timer-plus', 'event-timer-settings.json'),
    join(appData, 'timer-plus', 'timer-plus-settings.json'),
    join(appData, 'EventTimer', 'event-timer-settings.json')
  ]
}

function migrateSettings(): void {
  const next = settingsPath()
  if (existsSync(next)) return
  const previous = legacySettingsPaths().find((path) => existsSync(path))
  if (!previous) return
  try {
    mkdirSync(dirname(next), { recursive: true })
    writeFileSync(next, readFileSync(previous))
  } catch (error) {
    console.error('[settings] migrate failed', error)
  }
}

function flushSettings(): void {
  if (!pendingSettings) return
  try {
    writeFileSync(settingsPath(), JSON.stringify(pendingSettings, null, 2), 'utf8')
  } catch (error) {
    console.error('[settings] save failed', error)
  }
  pendingSettings = null
  if (settingsWriteTimer) clearTimeout(settingsWriteTimer)
  settingsWriteTimer = null
}

function queueSettings(settings: TimerSettings): void {
  pendingSettings = settings
  if (settingsWriteTimer) clearTimeout(settingsWriteTimer)
  settingsWriteTimer = setTimeout(flushSettings, 700)
}

function loadSettings(): unknown {
  migrateSettings()
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8')) as unknown
  } catch {
    return null
  }
}

function displayList(): DisplayInfo[] {
  const primaryId = screen.getPrimaryDisplay().id
  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: display.label?.trim() || `Дисплей ${index}`,
    isPrimary: display.id === primaryId,
    width: display.bounds.width,
    height: display.bounds.height,
    scaleFactor: display.scaleFactor
  }))
}

function loadRenderer(window: BrowserWindow, query?: Record<string, string>): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    const url = new URL(devUrl)
    for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value)
    void window.loadURL(url.toString())
    return
  }
  void window.loadFile(join(__dirname, '../renderer/index.html'), { query })
}

function bindEmergencyEscape(window: BrowserWindow): void {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'Escape' || outputWindows.size === 0) return
    event.preventDefault()
    closeAllOutputs()
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.show()
      controlWindow.focus()
    }
  })
}

function applyControlLayout(mode: ControlLayout, animate = true): void {
  const window = controlWindow
  if (!window || window.isDestroyed()) return
  const target = mode === 'compact' ? COMPACT_WINDOW : EXPANDED_WINDOW
  window.setMinimumSize(COMPACT_WINDOW.minWidth, COMPACT_WINDOW.minHeight)
  const area = screen.getDisplayMatching(window.getBounds()).workArea
  const current = window.getBounds()
  const width = Math.min(target.width, area.width)
  const height = Math.min(target.height, area.height)
  let x = current.x
  let y = current.y
  if (x + width > area.x + area.width) x = area.x + area.width - width
  if (y + height > area.y + area.height) y = area.y + area.height - height
  window.setBounds({
    x: Math.max(area.x, Math.round(x)),
    y: Math.max(area.y, Math.round(y)),
    width,
    height
  }, animate)
  window.setMinimumSize(Math.min(target.minWidth, width), Math.min(target.minHeight, height))
}

function createControlWindow(): void {
  const window = new BrowserWindow({
    width: EXPANDED_WINDOW.width,
    height: EXPANDED_WINDOW.height,
    minWidth: EXPANDED_WINDOW.minWidth,
    minHeight: EXPANDED_WINDOW.minHeight,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b1110',
    title: 'EventTimer',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  controlWindow = window
  bindEmergencyEscape(window)
  window.once('ready-to-show', () => {
    applyControlLayout('expanded', false)
    window.show()
  })
  window.on('closed', () => {
    controlWindow = null
    closeAllOutputs()
  })
  loadRenderer(window)
}

function createOutputWindow(displayId: number): BrowserWindow | null {
  const display = screen.getAllDisplays().find((item) => item.id === displayId)
  if (!display) return null

  const window = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    fullscreen: process.platform !== 'darwin',
    simpleFullscreen: process.platform === 'darwin',
    show: false,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#000000',
    title: `EventTimer — ${display.label || displayId}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  outputWindows.set(displayId, window)
  bindEmergencyEscape(window)
  window.setAlwaysOnTop(true, process.platform === 'darwin' ? 'screen-saver' : 'normal')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.once('ready-to-show', () => {
    window.setBounds(display.bounds)
    window.showInactive()
  })
  window.on('closed', () => {
    if (outputWindows.get(displayId) === window) outputWindows.delete(displayId)
  })
  loadRenderer(window, { mode: 'output', displayId: String(displayId) })
  return window
}

function closeAllOutputs(): void {
  for (const window of outputWindows.values()) {
    if (!window.isDestroyed()) window.destroy()
  }
  outputWindows.clear()
  liveTimer = null
  liveDisplayIds = []
}

function reconcileOutputs(): void {
  const desired = new Set(liveDisplayIds)
  for (const [displayId, window] of outputWindows) {
    if (!desired.has(displayId)) {
      window.destroy()
      outputWindows.delete(displayId)
    }
  }
  for (const displayId of desired) {
    if (!outputWindows.has(displayId)) createOutputWindow(displayId)
  }
}

function broadcastLiveTimer(): void {
  for (const window of outputWindows.values()) {
    if (!window.isDestroyed() && !window.webContents.isLoading()) {
      window.webContents.send('live-state', liveTimer)
    }
  }
}

function sendDisplayList(): void {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('displays-changed', displayList())
  }
  const available = new Set(screen.getAllDisplays().map((display) => display.id))
  const filtered = liveDisplayIds.filter((id) => available.has(id))
  if (filtered.length !== liveDisplayIds.length) {
    liveDisplayIds = filtered
    reconcileOutputs()
  }
}

const MAX_SOUND_BYTES = 20 * 1024 * 1024
const SOUND_EXTENSIONS = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'aiff', 'aif', 'caf']

function soundsDir(): string {
  return join(app.getPath('userData'), 'sounds')
}

function isSoundSlot(value: unknown): value is SoundSlot {
  return value === 'warning' || value === 'finish'
}

function soundFileName(slot: SoundSlot, extension: string): string {
  return `${slot}${extension}`
}

function isStoredSoundName(fileName: string): boolean {
  return /^(warning|finish)\.(mp3|wav|m4a|aac|ogg|aiff|aif|caf)$/.test(fileName)
}

function soundMime(extension: string): string {
  switch (extension) {
    case '.mp3': return 'audio/mpeg'
    case '.wav': return 'audio/wav'
    case '.m4a': return 'audio/mp4'
    case '.aac': return 'audio/aac'
    case '.ogg': return 'audio/ogg'
    case '.aif':
    case '.aiff': return 'audio/aiff'
    default: return 'audio/x-caf'
  }
}

function removeSlotFiles(slot: SoundSlot): void {
  const folder = soundsDir()
  if (!existsSync(folder)) return
  for (const name of readdirSync(folder)) {
    if (isStoredSoundName(name) && name.startsWith(`${slot}.`)) {
      try {
        unlinkSync(join(folder, name))
      } catch (error) {
        console.error('[sound] remove failed', error)
      }
    }
  }
}

function registerIpc(): void {
  ipcMain.handle('window:layout', (event, mode: unknown) => {
    if (!controlWindow || event.sender !== controlWindow.webContents) return
    if (mode !== 'compact' && mode !== 'expanded') return
    applyControlLayout(mode)
  })
  ipcMain.handle('displays:list', () => displayList())
  ipcMain.handle('settings:load', () => loadSettings())
  ipcMain.on('settings:save', (_event, settings: TimerSettings) => queueSettings(settings))

  ipcMain.handle('background:select', async () => {
    const options: OpenDialogOptions = {
      title: 'Выберите фон таймера',
      properties: ['openFile'],
      filters: [
        { name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    }
    const result = controlWindow
      ? await dialog.showOpenDialog(controlWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const extension = extname(path).toLowerCase()
    const mime = extension === '.png'
      ? 'image/png'
      : extension === '.webp'
        ? 'image/webp'
        : extension === '.gif'
          ? 'image/gif'
          : 'image/jpeg'
    try {
      return `data:${mime};base64,${readFileSync(path).toString('base64')}`
    } catch (error) {
      console.error('[background] read failed', error)
      return null
    }
  })

  ipcMain.handle('sound:pick', async (_event, slot: unknown): Promise<SoundPickResult> => {
    if (!isSoundSlot(slot)) return { ok: false, reason: 'failed' }
    const options: OpenDialogOptions = {
      title: slot === 'warning' ? 'Звук за 1 минуту' : 'Звук на нуле',
      properties: ['openFile'],
      filters: [{ name: 'Звук', extensions: SOUND_EXTENSIONS }]
    }
    const result = controlWindow
      ? await dialog.showOpenDialog(controlWindow, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return { ok: false, reason: 'canceled' }
    const source = result.filePaths[0]
    const extension = extname(source).toLowerCase()
    if (!SOUND_EXTENSIONS.includes(extension.slice(1))) return { ok: false, reason: 'failed' }
    try {
      if (statSync(source).size > MAX_SOUND_BYTES) return { ok: false, reason: 'too-large' }
      const folder = soundsDir()
      mkdirSync(folder, { recursive: true })
      removeSlotFiles(slot)
      const fileName = soundFileName(slot, extension)
      copyFileSync(source, join(folder, fileName))
      const label = basename(source).replace(/[\\/]/g, '').slice(0, 80) || fileName
      return { ok: true, fileName, label }
    } catch (error) {
      console.error('[sound] pick failed', error)
      return { ok: false, reason: 'failed' }
    }
  })

  ipcMain.handle('sound:read', (_event, fileName: unknown) => {
    if (typeof fileName !== 'string' || !isStoredSoundName(fileName)) return null
    const path = join(soundsDir(), fileName)
    if (!existsSync(path)) return null
    try {
      return {
        mime: soundMime(extname(path).toLowerCase()),
        base64: readFileSync(path).toString('base64')
      }
    } catch (error) {
      console.error('[sound] read failed', error)
      return null
    }
  })

  ipcMain.handle('sound:clear', (_event, slot: unknown) => {
    if (!isSoundSlot(slot)) return
    removeSlotFiles(slot)
  })

  ipcMain.handle('output:go-live', (_event, displayIds: number[], timer: TimerState) => {
    liveDisplayIds = [...new Set(displayIds.map(Number).filter(Number.isFinite))]
    liveTimer = timer
    reconcileOutputs()
    broadcastLiveTimer()
  })
  ipcMain.on('output:update', (_event, timer: TimerState) => {
    liveTimer = timer
    broadcastLiveTimer()
  })
  ipcMain.handle('output:stop', () => closeAllOutputs())
  ipcMain.on('output:ready', (event, displayId: number) => {
    const window = outputWindows.get(Number(displayId))
    if (!window || window.webContents.id !== event.sender.id) return
    event.sender.send('live-state', liveTimer)
  })
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') Menu.setApplicationMenu(null)
  registerIpc()
  createControlWindow()
  screen.on('display-added', sendDisplayList)
  screen.on('display-removed', sendDisplayList)
  screen.on('display-metrics-changed', sendDisplayList)

  app.on('activate', () => {
    if (!controlWindow) createControlWindow()
  })
})

app.on('before-quit', flushSettings)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
