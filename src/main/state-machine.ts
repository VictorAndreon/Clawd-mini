// Agregação pura: registros das sessões + relógio -> estado dominante.
export type State = 'idle' | 'thinking' | 'working' | 'juggling' | 'done' | 'sweeping' | 'attention' | 'error';
export type BaseKey = State | 'typing' | 'building' | 'juggling2';

export const PRIORITY: Record<State, number> = {
  idle: 0, thinking: 1, working: 2, juggling: 3, done: 4, sweeping: 5, attention: 6, error: 7,
};

export const TIMING = {
  doneMs: 4_000,
  errorMs: 5_000,
  staleMs: 10 * 60_000,
  workingStuckMs: 5 * 60_000,
  deleteAfterMs: 24 * 60 * 60_000,
} as const;

export interface SessionRecord {
  sessionId: string;
  state: State;
  event: string;
  tool?: string;
  project: string;
  subagents: number;
  prevState?: State;
  updatedAt: number;
}

export interface Aggregate {
  state: State;
  key: BaseKey;
  lastEventAt: number;
  active: number;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

export function isState(v: unknown): v is State {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PRIORITY, v);
}

export function effectiveState(r: SessionRecord, now: number): State {
  const age = now - r.updatedAt;
  switch (r.state) {
    case 'done': return age < TIMING.doneMs ? 'done' : 'idle';
    case 'error': return age < TIMING.errorMs ? 'error' : 'thinking';
    case 'working': return age < TIMING.workingStuckMs ? 'working' : 'idle';
    default: return r.state;
  }
}

function keyFor(state: State, r: SessionRecord): BaseKey {
  if (state === 'working') {
    if (r.tool && EDIT_TOOLS.has(r.tool)) return 'typing';
    if (r.tool === 'Bash') return 'building';
    return 'working';
  }
  if (state === 'juggling') return r.subagents >= 2 ? 'juggling2' : 'juggling';
  return state;
}

export function aggregate(records: SessionRecord[], now: number): Aggregate {
  let best: { state: State; rec: SessionRecord } | null = null;
  let lastEventAt = 0;
  let active = 0;
  for (const rec of records) {
    lastEventAt = Math.max(lastEventAt, rec.updatedAt);
    // attention não envelhece: o Claude continua parado esperando você (spec: loop até a
    // sessão mudar). Sessão morta em attention some na limpeza de 24 h ou no SessionEnd.
    if (rec.state !== 'attention' && now - rec.updatedAt > TIMING.staleMs) continue;
    const s = effectiveState(rec, now);
    if (s !== 'idle') active++;
    const better = !best
      || PRIORITY[s] > PRIORITY[best.state]
      || (PRIORITY[s] === PRIORITY[best.state] && rec.updatedAt > best.rec.updatedAt);
    if (better) best = { state: s, rec };
  }
  if (!best) return { state: 'idle', key: 'idle', lastEventAt, active: 0 };
  return { state: best.state, key: keyFor(best.state, best.rec), lastEventAt, active };
}
