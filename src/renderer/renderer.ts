interface ThemeInfo {
  files: string[];
  drag: string;
}
interface ClawdApi {
  onSprite(cb: (file: string) => void): void;
  themeInfo(): Promise<ThemeInfo>;
  dragStart(): void;
  dragMove(): void;
  dragEnd(): void;
}
interface Window {
  clawd: ClawdApi;
}

const THEME_BASE = '../../themes/clawd/';
const pet = document.getElementById('pet') as HTMLImageElement;
const preloaded: HTMLImageElement[] = []; // referência mantida para o cache não ser coletado
let currentFile = '';
let dragFile = '';
let dragging = false;

function showSprite(file: string): void {
  const src = THEME_BASE + file;
  // Trocar o src reinicia a animação CSS do SVG, que é o comportamento desejado.
  if (pet.getAttribute('src') !== src) pet.src = src;
}

window.clawd.onSprite((file) => {
  currentFile = file;
  if (!dragging) showSprite(file);
});

void window.clawd.themeInfo().then((info) => {
  dragFile = info.drag;
  for (const f of info.files) {
    const img = new Image();
    img.src = THEME_BASE + f;
    preloaded.push(img);
  }
});

pet.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  dragging = true;
  pet.setPointerCapture(e.pointerId);
  window.clawd.dragStart();
  if (dragFile) showSprite(dragFile);
});

pet.addEventListener('pointermove', () => {
  if (dragging) window.clawd.dragMove();
});

function endDrag(): void {
  if (!dragging) return;
  dragging = false;
  window.clawd.dragEnd();
  if (currentFile) showSprite(currentFile);
}
pet.addEventListener('pointerup', endDrag);
pet.addEventListener('pointercancel', endDrag);
pet.addEventListener('lostpointercapture', endDrag);
pet.addEventListener('contextmenu', (e) => e.preventDefault()); // clique-direito desligado na v1
