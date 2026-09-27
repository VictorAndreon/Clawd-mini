import { Menu, nativeImage, Tray } from 'electron';

export interface TrayActions {
  isVisible(): boolean;
  toggleVisible(): void;
  isDnd(): boolean;
  setDnd(on: boolean): void;
  resetPosition(): void;
  quit(): void;
}

export interface TrayHandle {
  tray: Tray;
  refresh(): void; // remonta o menu (rótulos dependem do estado atual)
}

// No GNOME o tray depende da extensão AppIndicator. Sem ela, o app segue sem tray.
export function createTray(iconPath: string, a: TrayActions, tooltip = 'clawd-mini'): TrayHandle | null {
  let tray: Tray;
  try {
    tray = new Tray(nativeImage.createFromPath(iconPath));
  } catch (err) {
    console.warn('clawd-mini: tray indisponível', err);
    return null;
  }
  tray.setToolTip(tooltip);
  const rebuild = (): void => {
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: a.isVisible() ? 'Esconder' : 'Mostrar', click: () => { a.toggleVisible(); rebuild(); } },
      { label: 'Não perturbe', type: 'checkbox', checked: a.isDnd(), click: (item) => { a.setDnd(item.checked); rebuild(); } },
      { label: 'Resetar posição', click: () => a.resetPosition() },
      { type: 'separator' },
      { label: 'Sair', click: () => a.quit() },
    ]));
  };
  rebuild();
  return { tray, refresh: rebuild };
}
