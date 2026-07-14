// Puente seguro entre el frontend (web) y el shell de Electron.
// Expone `window.construgest`: sirve para que el frontend detecte que corre
// dentro de la app de escritorio y para lanzar la autoactualización.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('construgest', {
  isDesktop: true,
  // Descarga el .msi indicado y lanza el instalador (la app se cierra).
  installUpdate: (downloadUrl) => ipcRenderer.invoke('update:install', downloadUrl),
})
