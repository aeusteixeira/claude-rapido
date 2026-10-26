const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rapido', {
  launch: (payload) => ipcRenderer.invoke('launch', payload),
  hide: () => ipcRenderer.send('hide'),
  forget: (i) => ipcRenderer.send('forget', i),
  onOpen: (cb) => ipcRenderer.on('open', (_e, data) => cb(data)),
  onClose: (cb) => ipcRenderer.on('close', () => cb()),
});
