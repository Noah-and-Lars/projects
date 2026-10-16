const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neonApp', {
  isApp: true,
  launch: (opts) => ipcRenderer.invoke('neon:launch', opts),
  fullscreen: (on) => ipcRenderer.invoke('neon:fullscreen', on),
  launcher: () => ipcRenderer.invoke('neon:launcher'),
  quit: () => ipcRenderer.invoke('neon:quit'),
  info: () => ipcRenderer.invoke('neon:info'),
});
