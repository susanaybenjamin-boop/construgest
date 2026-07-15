// Puente seguro entre el frontend (web) y el shell de Electron.
// Expone `window.construgest`: sirve para que el frontend detecte que corre
// dentro de la app de escritorio y para lanzar la autoactualización.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('construgest', {
  isDesktop: true,
  // Descarga el .msi indicado y lanza el instalador (la app se cierra).
  installUpdate: (downloadUrl) => ipcRenderer.invoke('update:install', downloadUrl),
  // Progreso de la descarga (pct 0..100; pct=-1 → intento de cierre bloqueado).
  onUpdateProgress: (cb) => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('update:progress', h)
    return () => ipcRenderer.removeListener('update:progress', h)
  },
  // Error durante la descarga de la actualización.
  onUpdateError: (cb) => {
    const h = (_e, msg) => cb(msg)
    ipcRenderer.on('update:error', h)
    return () => ipcRenderer.removeListener('update:error', h)
  },
})
