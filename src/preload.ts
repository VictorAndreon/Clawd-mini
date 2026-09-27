const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('clawd', {
  onSprite: (cb: (file: string) => void): void => {
    ipcRenderer.on('sprite', (_e, file: string) => cb(file));
  },
  themeInfo: (): Promise<{ files: string[]; drag: string }> => ipcRenderer.invoke('theme:info'),
  dragStart: (): void => ipcRenderer.send('drag:start'),
  dragMove: (): void => ipcRenderer.send('drag:move'),
  dragEnd: (): void => ipcRenderer.send('drag:end'),
});
