import { BrowserWindow } from 'electron';
import * as path from 'node:path';
import { APP_ROOT } from './paths';

export function createPetWindow(bounds: { x: number; y: number; size: number }): BrowserWindow {
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.size,
    height: bounds.size,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    type: 'toolbar',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(APP_ROOT, 'dist', 'src', 'preload.js'),
    },
  });
  // Se 'floating' ficar atrás de alguma janela, trocar para 'screen-saver' (spec, seção 4).
  win.setAlwaysOnTop(true, 'floating');
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win.showInactive());
  void win.loadFile(path.join(APP_ROOT, 'src', 'renderer', 'index.html'));
  return win;
}
