import * as fs from 'node:fs';
import * as path from 'node:path';
import { isState, SessionRecord, TIMING } from './state-machine';

export function parseRecord(raw: string): SessionRecord | null {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.sessionId !== 'string' || !isState(o.state)) return null;
  if (typeof o.updatedAt !== 'number' || !Number.isFinite(o.updatedAt)) return null;
  return {
    sessionId: o.sessionId,
    state: o.state,
    event: typeof o.event === 'string' ? o.event : '',
    tool: typeof o.tool === 'string' ? o.tool : undefined,
    project: typeof o.project === 'string' ? o.project : '',
    subagents: typeof o.subagents === 'number' && o.subagents > 0 ? o.subagents : 0,
    prevState: isState(o.prevState) ? o.prevState : undefined,
    updatedAt: o.updatedAt,
  };
}

export function readSessions(dir: string, now: number): SessionRecord[] {
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return []; }
  const out: SessionRecord[] = [];
  for (const name of names) {
    const isJson = name.endsWith('.json');
    if (!isJson && !name.endsWith('.tmp')) continue;
    const file = path.join(dir, name);
    let raw = '';
    let mtime: number;
    try {
      mtime = fs.statSync(file).mtimeMs;
      if (isJson) raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rec = isJson ? parseRecord(raw) : null;
    const age = now - (rec ? rec.updatedAt : mtime);
    if (age > TIMING.deleteAfterMs) {
      try { fs.unlinkSync(file); } catch { /* outro processo já apagou */ }
      continue;
    }
    if (rec) out.push(rec);
  }
  return out;
}

export interface WatchOptions {
  debounceMs?: number;
  sweepMs?: number;
  now?: () => number;
}

export function watchSessions(
  dir: string,
  onChange: (records: SessionRecord[]) => void,
  opts: WatchOptions = {},
): () => void {
  const debounceMs = opts.debounceMs ?? 50;
  const sweepMs = opts.sweepMs ?? 10_000;
  const now = opts.now ?? Date.now;
  let watcher: fs.FSWatcher | null = null;
  let timer: NodeJS.Timeout | null = null;

  const emit = (): void => {
    timer = null;
    onChange(readSessions(dir, now()));
  };
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(emit, debounceMs);
  };
  const ensureWatcher = (): void => {
    if (watcher) return;
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      watcher = fs.watch(dir, schedule);
      watcher.on('error', () => {
        watcher?.close();
        watcher = null; // a varredura recria
      });
    } catch {
      watcher = null;
    }
  };

  ensureWatcher();
  // fs.watch no Linux perde evento às vezes: varredura de segurança.
  const sweep = setInterval(() => { ensureWatcher(); emit(); }, sweepMs);
  emit();

  return () => {
    clearInterval(sweep);
    if (timer) clearTimeout(timer);
    watcher?.close();
    watcher = null;
  };
}
