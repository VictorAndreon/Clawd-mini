import { BrowserWindow, ipcMain, screen } from 'electron';

interface DragStart {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
}

export function dragTarget(start: DragStart, sx: number, sy: number): { x: number; y: number } {
  return { x: Math.round(start.wx + sx - start.sx), y: Math.round(start.wy + sy - start.sy) };
}

export interface DragDeps {
  getCursor(): { x: number; y: number };
  getWindowPos(): [number, number];
  setWindowPos(x: number, y: number): void;
  onDrop(x: number, y: number): void;
}

export interface DragController {
  start(): void;
  move(): void;
  end(): void;
}

// O cursor vem do sistema, nunca do renderer: no X11 o screenX do Chromium usa a origem
// da janela em cache, que atrasa enquanto a própria janela é movida e realimenta o erro.
export function createDragController(d: DragDeps): DragController {
  let start: DragStart | null = null;
  return {
    start() {
      const c = d.getCursor();
      const [wx, wy] = d.getWindowPos();
      start = { sx: c.x, sy: c.y, wx, wy };
    },
    move() {
      if (!start) return;
      const c = d.getCursor();
      const p = dragTarget(start, c.x, c.y);
      d.setWindowPos(p.x, p.y);
    },
    end() {
      if (!start) return;
      start = null;
      const [x, y] = d.getWindowPos();
      d.onDrop(x, y);
    },
  };
}

// -webkit-app-region: drag não gera eventos de mouse no renderer, então o arraste é manual.
export function installDrag(win: BrowserWindow, onDrop: (x: number, y: number) => void): void {
  const ctl = createDragController({
    getCursor: () => screen.getCursorScreenPoint(),
    getWindowPos: () => win.getPosition() as [number, number],
    setWindowPos: (x, y) => win.setPosition(x, y),
    onDrop,
  });
  const fromPet = (e: Electron.IpcMainEvent): boolean => e.sender === win.webContents;
  ipcMain.on('drag:start', (e) => { if (fromPet(e)) ctl.start(); });
  ipcMain.on('drag:move', (e) => { if (fromPet(e)) ctl.move(); });
  ipcMain.on('drag:end', (e) => { if (fromPet(e)) ctl.end(); });
}
