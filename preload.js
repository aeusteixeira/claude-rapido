const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rapido', {
  launch: (payload) => ipcRenderer.invoke('launch', payload),
  hide: () => ipcRenderer.send('hide'),
  forget: (i) => ipcRenderer.send('forget', i),
  onOpen: (cb) => ipcRenderer.on('open', (_e, data) => cb(data)),
  onClose: (cb) => ipcRenderer.on('close', () => cb()),
  transcrever: (audio) => ipcRenderer.invoke('transcrever', audio),
  copiar: (texto) => ipcRenderer.send('copiar', texto),
  esconderDitado: () => ipcRenderer.send('ditado:esconder'),
  colarDitado: (texto) => ipcRenderer.send('ditado:colar', texto),
  perguntarDitado: (texto) => ipcRenderer.invoke('ditado:perguntar', texto),
  onDitado: (evento, cb) => ipcRenderer.on(`ditado:${evento}`, () => cb()),
});
