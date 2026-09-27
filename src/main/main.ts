import { app, screen } from 'electron';
import { createPetWindow } from './window';
import { watchSessions } from './watcher';
import { aggregate, SessionRecord } from './state-machine';
import { SESSIONS_DIR } from './paths';
import { degradedDisplayWarning } from './platform';

const TICK_MS = 250;
const SIZE = 160;

if (!app.requestSingleInstanceLock()) app.quit();
else void app.whenReady().then(start);

function start(): void {
  const warning = degradedDisplayWarning();
  if (warning) console.warn(warning);
  const wa = screen.getPrimaryDisplay().workArea;
  const win = createPetWindow({ x: wa.x + wa.width - SIZE - 16, y: wa.y + wa.height - SIZE - 16, size: SIZE });

  let records: SessionRecord[] = [];
  let shown = '';
  const render = (): void => {
    if (win.isDestroyed()) return;
    const label = aggregate(records, Date.now()).key;
    if (label !== shown) {
      shown = label;
      win.webContents.send('state', label);
    }
  };
  win.webContents.on('did-finish-load', () => { shown = ''; render(); });
  watchSessions(SESSIONS_DIR, (r) => { records = r; render(); });
  setInterval(render, TICK_MS);
}
