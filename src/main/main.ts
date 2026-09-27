import { app, dialog, ipcMain, screen } from 'electron';
import * as path from 'node:path';
import { createPetWindow } from './window';
import { watchSessions } from './watcher';
import { aggregate, SessionRecord } from './state-machine';
import { Presenter } from './presenter';
import { loadTheme, themeFiles, Theme } from './theme';
import { loadPrefs, Prefs, Rect, resolvePosition, savePrefs } from './prefs';
import { installDrag } from './drag';
import { createTray, TrayHandle } from './tray';
import { APP_ROOT, PREFS_FILE, SESSIONS_DIR } from './paths';
import { degradedDisplayWarning } from './platform';

const TICK_MS = 250;
let tray: TrayHandle | null = null;

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);

function workAreas(): Rect[] {
  return screen.getAllDisplays().map((d) => d.workArea);
}

function persist(prefs: Prefs): void {
  try {
    savePrefs(PREFS_FILE, prefs);
  } catch (err) {
    console.warn('clawd-mini: não consegui salvar prefs', err);
  }
}

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

  let prefs = loadPrefs(PREFS_FILE);
  const pos = resolvePosition(prefs, workAreas(), screen.getPrimaryDisplay().workArea);
  const win = createPetWindow({ ...pos, size: prefs.size });
  const presenter = new Presenter(theme, Date.now());

  ipcMain.handle('theme:info', () => ({ files: themeFiles(theme), drag: theme.states.drag }));
  installDrag(win, (x, y) => {
    prefs = { ...prefs, x, y };
    persist(prefs);
  });

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

  let dnd = false;
  tray = createTray(path.join(APP_ROOT, 'assets', 'tray.png'), {
    isVisible: () => win.isVisible(),
    toggleVisible: () => (win.isVisible() ? win.hide() : win.showInactive()),
    isDnd: () => dnd,
    setDnd: (on) => {
      dnd = on;
      presenter.setDnd(on);
      render();
    },
    resetPosition: () => {
      prefs = { size: prefs.size };
      persist(prefs);
      const p = resolvePosition(prefs, workAreas(), screen.getPrimaryDisplay().workArea);
      win.setPosition(p.x, p.y);
    },
    quit: () => app.quit(),
  }, warning ?? 'clawd-mini');
  // O menu é montado antes do ready-to-show; o rótulo Esconder/Mostrar precisa acompanhar.
  win.on('show', () => tray?.refresh());
  win.on('hide', () => tray?.refresh());
}
