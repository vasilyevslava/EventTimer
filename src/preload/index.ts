import { contextBridge, ipcRenderer } from 'electron'
import type { ControlLayout, DisplayInfo, TimerPlusApi, TimerSettings, TimerState } from '../shared'

const api: TimerPlusApi = {
  listDisplays: () => ipcRenderer.invoke('displays:list') as Promise<DisplayInfo[]>,
  setLayout: (layout: ControlLayout) => ipcRenderer.invoke('window:layout', layout) as Promise<void>,
  onDisplaysChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, displays: DisplayInfo[]): void => callback(displays)
    ipcRenderer.on('displays-changed', listener)
    return () => ipcRenderer.removeListener('displays-changed', listener)
  },
  selectBackground: () => ipcRenderer.invoke('background:select') as Promise<string | null>,
  loadSettings: () => ipcRenderer.invoke('settings:load') as Promise<unknown>,
  saveSettings: (settings: TimerSettings) => ipcRenderer.send('settings:save', settings),
  goLive: (displayIds: number[], timer: TimerState) => (
    ipcRenderer.invoke('output:go-live', displayIds, timer) as Promise<void>
  ),
  updateLive: (timer: TimerState) => ipcRenderer.send('output:update', timer),
  stopLive: () => ipcRenderer.invoke('output:stop') as Promise<void>,
  onLiveState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, timer: TimerState | null): void => callback(timer)
    ipcRenderer.on('live-state', listener)
    return () => ipcRenderer.removeListener('live-state', listener)
  },
  outputReady: (displayId: number) => ipcRenderer.send('output:ready', displayId)
}

contextBridge.exposeInMainWorld('timerPlus', api)
