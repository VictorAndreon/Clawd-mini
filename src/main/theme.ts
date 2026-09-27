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

export interface Theme {
  name: string;
  dir: string;
  states: Record<SpriteKey, string>;
  idleVariations: IdleVariation[];
}

const FILE_RE = /^clawd-[a-z0-9-]+\.svg$/;

export function loadTheme(dir: string): Theme {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'theme.json'), 'utf8')) as {
    name?: unknown;
    states?: Record<string, unknown>;
    idleVariations?: unknown;
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

  return { name: typeof raw.name === 'string' ? raw.name : path.basename(dir), dir, states, idleVariations };
}

export function themeFiles(t: Theme): string[] {
  return [...new Set([...Object.values(t.states), ...t.idleVariations.map((v) => v.file)])];
}
