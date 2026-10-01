import * as fs from 'node:fs';
import * as path from 'node:path';

export const SPRITE_KEYS = [
  'idle', 'thinking', 'working', 'typing', 'building', 'juggling', 'juggling2', 'attention',
  'done', 'error', 'sweeping', 'yawning', 'dozing', 'collapsing', 'sleeping', 'waking', 'drag',
] as const;
export type SpriteKey = typeof SPRITE_KEYS[number];

export interface IdleVariation {
  file: string;
  durationMs: number;
}

// [x0, y0, x1, y1] em unidades do viewBox do tema.
export type Box = [number, number, number, number];

export interface Theme {
  name: string;
  dir: string;
  viewBox: Box;
  states: Record<SpriteKey, string>;
  idleVariations: IdleVariation[];
  // Região do sprite que recebe clique; o resto da janela fica transparente ao mouse.
  hitboxes: Record<string, Box>;
}

const FILE_RE = /^clawd-[a-z0-9-]+\.svg$/;

export function loadTheme(dir: string): Theme {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')) as {
    name?: unknown;
    states?: Record<string, unknown>;
    idleVariations?: unknown;
    viewBox?: unknown;
    hitboxes?: Record<string, unknown>;
  };

  const checkFile = (f: unknown, label: string): string => {
    if (typeof f !== 'string' || !FILE_RE.test(f)) throw new Error(`theme.json: "${label}" ausente ou inválido`);
    if (!fs.existsSync(path.join(dir, f))) {
      throw new Error(`tema: arquivo ${f} não existe em ${dir} (rode npm run import-assets)`);
    }
    return f;
  };

  const states = {} as Record<SpriteKey, string>;
  for (const k of SPRITE_KEYS) states[k] = checkFile(raw.states?.[k], k);

  const vars = Array.isArray(raw.idleVariations) ? raw.idleVariations : [];
  const idleVariations = vars.map((v: { file?: unknown; durationMs?: unknown }, i: number) => {
    if (typeof v.durationMs !== 'number' || v.durationMs <= 0) {
      throw new Error(`theme.json: idleVariations[${i}].durationMs inválido`);
    }
    return { file: checkFile(v.file, `idleVariations[${i}]`), durationMs: v.durationMs };
  });

  const nums = (v: unknown, n: number): number[] | null =>
    Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? v : null;
  const vb = typeof raw.viewBox === 'string' ? nums(raw.viewBox.trim().split(/\s+/).map(Number), 4) : null;
  if (!vb || vb[2] <= 0 || vb[3] <= 0) throw new Error('theme.json: "viewBox" ausente ou inválido');
  const viewBox: Box = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];

  const hitboxes: Record<string, Box> = {};
  for (const [f, v] of Object.entries(raw.hitboxes ?? {})) {
    const b = nums(v, 4);
    if (!b || b[2] <= b[0] || b[3] <= b[1]) throw new Error(`theme.json: hitboxes["${f}"] inválido`);
    hitboxes[f] = b as Box;
  }

  return { name: typeof raw.name === 'string' ? raw.name : path.basename(dir), dir, viewBox, states, idleVariations, hitboxes };
}

export function themeFiles(t: Theme): string[] {
  return [...new Set([...Object.values(t.states), ...t.idleVariations.map((v) => v.file)])];
}
