const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('clawd', {
  onState: (cb: (label: string) => void): void => {
    ipcRenderer.on('state', (_e, label: string) => cb(label));
  },
});
