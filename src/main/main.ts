import { app, dialog, ipcMain, screen } from 'electron';
import * as path from 'node:path';
import { createPetWindow } from './window';
import { watchSessions } from './watcher';
import { aggregate, SessionRecord } from './state-machine';
import { Presenter } from './presenter';
import { loadTheme, themeFiles, Theme } from './theme';
import { APP_ROOT, SESSIONS_DIR } from './paths';
import { degradedDisplayWarning } from './platform';

const TICK_MS = 250;
const SIZE = 160;

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);

function start(): void {
  const warning = degradedDisplayWarning();
  if (warning) console.warn(warning);
  let theme: Theme;
  try {
    theme = loadTheme(path.join(APP_ROOT, 'themes', 'clawd'));
  } catch (err) {
    dialog.showErrorBox('clawd-mini', err instanceof Error ? err.message : String(err));
    app.quit();
    return;
  }

  const wa = screen.getPrimaryDisplay().workArea;
  const win = createPetWindow({ x: wa.x + wa.width - SIZE - 16, y: wa.y + wa.height - SIZE - 16, size: SIZE });
  const presenter = new Presenter(theme, Date.now());
  ipcMain.handle('theme:info', () => ({ files: themeFiles(theme), drag: theme.states.drag }));

  let records: SessionRecord[] = [];
  let shown = '';
  const render = (): void => {
    if (win.isDestroyed()) return;
    const now = Date.now();
    const file = presenter.tick(aggregate(records, now), now);
    if (file !== shown) {
      shown = file;
      win.webContents.send('sprite', file);
    }
  };
  win.webContents.on('did-finish-load', () => { shown = ''; render(); });
  watchSessions(SESSIONS_DIR, (r) => { records = r; render(); });
  setInterval(render, TICK_MS);
}
