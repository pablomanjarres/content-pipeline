import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  pickMedia: (weekKey: string, date: string) =>
    ipcRenderer.invoke('pick-media', weekKey, date),
})
