const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Invoke (Two-way communication, expects return)
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  
  // Send (One-way Frontend -> Backend)
  send: (channel, data) => ipcRenderer.send(channel, data),
  
  // Receive (One-way Backend -> Frontend)
  onBackendEvent: (callback) => ipcRenderer.on('backend-event', (event, payload) => callback(payload)),
  
  // Store Handlers
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  openHistorico: () => ipcRenderer.invoke('shell:openHistorico'),
  // Auto-updater
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
});
