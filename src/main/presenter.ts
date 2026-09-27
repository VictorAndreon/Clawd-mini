import { PRIORITY, State } from './state-machine';
import type { Aggregate } from './state-machine';
import type { SpriteKey, Theme } from './theme';

export const SLEEP = {
  idleVariationAfterMs: 20_000,
  yawnAfterMs: 60_000,
  yawnMs: 3_000,
  collapseAfterMs: 10 * 60_000,
  collapseMs: 1_000, // maior animação finita (forwards) de clawd-collapse-sleep.svg
  wakeMs: 1_500,
} as const;

// Tempo mínimo na tela; só um estado de prioridade maior interrompe antes.
const MIN_HOLD: Partial<Record<SpriteKey, number>> = { done: 4_000, error: 5_000, attention: 5_000 };
const SLEEPY: ReadonlySet<SpriteKey> = new Set<SpriteKey>(['yawning', 'dozing', 'collapsing', 'sleeping']);

function keyPriority(k: SpriteKey): number {
  if (k === 'typing' || k === 'building') return PRIORITY.working;
  if (k === 'juggling2') return PRIORITY.juggling;
  return Object.prototype.hasOwnProperty.call(PRIORITY, k) ? PRIORITY[k as State] : 0;
}

export class Presenter {
  private lastEventAt: number;
  private key: SpriteKey | null = null;
  private keySince = 0;
  private idleSince: number;
  private wakeUntil = 0;
  private variation: { file: string; until: number } | null = null;
  private dnd = false;

  constructor(
    private readonly theme: Theme,
    startedAt: number,
    private readonly random: () => number = Math.random,
  ) {
    this.lastEventAt = startedAt;
    this.idleSince = startedAt;
  }

  setDnd(on: boolean, now: number): void {
    if (this.dnd && !on) this.wakeUntil = now + SLEEP.wakeMs;
    this.dnd = on;
  }

  tick(agg: Aggregate, now: number): string {
    if (this.dnd) return this.show('sleeping', now);

    if (agg.lastEventAt > this.lastEventAt) {
      this.lastEventAt = agg.lastEventAt;
      if (this.key && SLEEPY.has(this.key)) this.wakeUntil = now + SLEEP.wakeMs;
    }
    if (now < this.wakeUntil) return this.show('waking', now);

    let target: SpriteKey = agg.state === 'idle' ? this.idleKey(now) : agg.key;
    const current = this.key;
    const hold = current ? MIN_HOLD[current] : undefined;
    if (current && hold !== undefined && target !== current && now - this.keySince < hold
        && keyPriority(target) <= keyPriority(current)) {
      target = current;
    }

    if (target === 'idle') return this.idleFile(now);
    this.variation = null;
    return this.show(target, now);
  }

  private idleKey(now: number): SpriteKey {
    const t = now - this.lastEventAt;
    if (t >= SLEEP.collapseAfterMs + SLEEP.collapseMs) return 'sleeping';
    if (t >= SLEEP.collapseAfterMs) return 'collapsing';
    if (t >= SLEEP.yawnAfterMs + SLEEP.yawnMs) return 'dozing';
    if (t >= SLEEP.yawnAfterMs) return 'yawning';
    return 'idle';
  }

  private idleFile(now: number): string {
    const base = this.show('idle', now);
    if (this.variation) {
      if (now < this.variation.until) return this.variation.file;
      this.variation = null;
      this.idleSince = now;
    }
    const vars = this.theme.idleVariations;
    if (vars.length > 0 && now - this.idleSince >= SLEEP.idleVariationAfterMs) {
      const v = vars[Math.min(vars.length - 1, Math.floor(this.random() * vars.length))];
      this.variation = { file: v.file, until: now + v.durationMs };
      return v.file;
    }
    return base;
  }

  private show(key: SpriteKey, now: number): string {
    if (key !== this.key) {
      this.key = key;
      this.keySince = now;
      if (key === 'idle') this.idleSince = now;
    }
    return this.theme.states[key];
  }
}
