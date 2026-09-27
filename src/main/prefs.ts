import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Prefs {
  x?: number;
  y?: number;
  size: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_SIZE = 160;
const MIN_SIZE = 64;
const MAX_SIZE = 512;
const MARGIN = 16;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function loadPrefs(file: string): Prefs {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { size: DEFAULT_SIZE }; }
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const prefs: Prefs = {
    size: isNum(o.size) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(o.size))) : DEFAULT_SIZE,
  };
  if (isNum(o.x) && isNum(o.y)) {
    prefs.x = Math.round(o.x);
    prefs.y = Math.round(o.y);
  }
  return prefs;
}

export function savePrefs(file: string, prefs: Prefs): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(prefs, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function resolvePosition(p: Prefs, workAreas: Rect[], primary: Rect): { x: number; y: number } {
  if (p.x !== undefined && p.y !== undefined) {
    const cx = p.x + p.size / 2;
    const cy = p.y + p.size / 2;
    const visible = workAreas.some((a) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height);
    if (visible) return { x: p.x, y: p.y };
  }
  return { x: primary.x + primary.width - p.size - MARGIN, y: primary.y + primary.height - p.size - MARGIN };
}
