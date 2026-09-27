interface ThemeInfo {
  files: string[];
  drag: string;
}
interface ClawdApi {
  onSprite(cb: (file: string) => void): void;
  themeInfo(): Promise<ThemeInfo>;
}
interface Window {
  clawd: ClawdApi;
}

const THEME_BASE = '../../themes/clawd/';
const pet = document.getElementById('pet') as HTMLImageElement;
const preloaded: HTMLImageElement[] = []; // referência mantida para o cache não ser coletado

function showSprite(file: string): void {
  const src = THEME_BASE + file;
  // Trocar o src reinicia a animação CSS do SVG, que é o comportamento desejado.
  if (pet.getAttribute('src') !== src) pet.src = src;
}

window.clawd.onSprite(showSprite);

void window.clawd.themeInfo().then((info) => {
  for (const f of info.files) {
    const img = new Image();
    img.src = THEME_BASE + f;
    preloaded.push(img);
  }
});
