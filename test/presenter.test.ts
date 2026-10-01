import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Presenter, SLEEP } from '../src/main/presenter';
import { SPRITE_KEYS, SpriteKey, Theme, IdleVariation } from '../src/main/theme';
import type { Aggregate, BaseKey, State } from '../src/main/state-machine';

const T0 = 1_000_000;
const VARS: IdleVariation[] = [{ file: 'var-a.svg', durationMs: 1_000 }, { file: 'var-b.svg', durationMs: 2_000 }];

function theme(idleVariations: IdleVariation[] = VARS): Theme {
  const states = Object.fromEntries(SPRITE_KEYS.map((k) => [k, `${k}.svg`])) as Record<SpriteKey, string>;
  return { name: 't', dir: '/x', viewBox: [0, 0, 1, 1], states, idleVariations, hitboxes: {} };
}
function agg(state: State, lastEventAt: number, key: BaseKey = state): Aggregate {
  return { state, key, lastEventAt, active: state === 'idle' ? 0 : 1 };
}

test('estado não-idle mostra o sprite da variante', () => {
  const p = new Presenter(theme(), T0);
  assert.equal(p.tick(agg('working', T0, 'typing'), T0), 'typing.svg');
  assert.equal(p.tick(agg('juggling', T0, 'juggling2'), T0 + 10), 'juggling2.svg');
});

test('done fica 4 s mesmo se a sessão já voltou a idle', () => {
  const p = new Presenter(theme(), T0);
  assert.equal(p.tick(agg('done', T0), T0), 'done.svg');
  assert.equal(p.tick(agg('idle', T0), T0 + 1_000), 'done.svg');
  assert.equal(p.tick(agg('idle', T0), T0 + 3_999), 'done.svg');
  assert.equal(p.tick(agg('idle', T0), T0 + 4_000), 'idle.svg');
});

test('attention segura 5 s contra prioridade menor; error fura na hora', () => {
  const p = new Presenter(theme(), T0);
  p.tick(agg('attention', T0), T0);
  assert.equal(p.tick(agg('working', T0 + 500), T0 + 500), 'attention.svg');
  assert.equal(p.tick(agg('working', T0 + 500), T0 + 5_000), 'working.svg');

  const q = new Presenter(theme(), T0);
  q.tick(agg('attention', T0), T0);
  assert.equal(q.tick(agg('error', T0 + 600), T0 + 600), 'error.svg');
});

test('idle varia depois de 20 s, toca pela duração e volta', () => {
  const p = new Presenter(theme(), T0, () => 0.99); // índice 1 → var-b, 2 s
  const idle = agg('idle', 0);
  assert.equal(p.tick(idle, T0), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 19_999), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 20_000), 'var-b.svg');
  assert.equal(p.tick(idle, T0 + 21_999), 'var-b.svg');
  assert.equal(p.tick(idle, T0 + 22_000), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 41_999), 'idle.svg');
  assert.equal(p.tick(idle, T0 + 42_000), 'var-b.svg');
});

test('random() === 1 não estoura o índice', () => {
  const p = new Presenter(theme(), T0, () => 1);
  p.tick(agg('idle', 0), T0);
  assert.equal(p.tick(agg('idle', 0), T0 + 20_000), 'var-b.svg');
});

test('sem variações, idle nunca varia', () => {
  const p = new Presenter(theme([]), T0);
  assert.equal(p.tick(agg('idle', 0), T0 + 30_000), 'idle.svg');
});

test('sequência de sono e acordar', () => {
  const p = new Presenter(theme([]), T0);
  const idle = agg('idle', T0);
  assert.equal(p.tick(idle, T0 + SLEEP.yawnAfterMs - 1), 'idle.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.yawnAfterMs), 'yawning.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.yawnAfterMs + SLEEP.yawnMs), 'dozing.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.collapseAfterMs), 'collapsing.svg');
  assert.equal(p.tick(idle, T0 + SLEEP.collapseAfterMs + SLEEP.collapseMs), 'sleeping.svg');

  const ev = T0 + SLEEP.collapseAfterMs + 100_000;
  assert.equal(p.tick(agg('thinking', ev), ev), 'waking.svg');
  assert.equal(p.tick(agg('thinking', ev), ev + SLEEP.wakeMs - 1), 'waking.svg');
  assert.equal(p.tick(agg('thinking', ev), ev + SLEEP.wakeMs), 'thinking.svg');
});

test('evento que chega como idle (SessionStart) também acorda', () => {
  const p = new Presenter(theme([]), T0);
  p.tick(agg('idle', T0), T0 + SLEEP.yawnAfterMs + SLEEP.yawnMs); // dozing
  const ev = T0 + 200_000;
  assert.equal(p.tick(agg('idle', ev), ev), 'waking.svg');
  assert.equal(p.tick(agg('idle', ev), ev + SLEEP.wakeMs), 'idle.svg');
});

test('não perturbe congela em sleeping; ao desligar, acorda se houve evento', () => {
  const p = new Presenter(theme(), T0);
  p.setDnd(true, T0);
  assert.equal(p.tick(agg('attention', T0 + 10), T0 + 10), 'sleeping.svg');
  p.setDnd(false, T0 + 20);
  assert.equal(p.tick(agg('attention', T0 + 10), T0 + 20), 'waking.svg');
  assert.equal(p.tick(agg('attention', T0 + 10), T0 + 20 + SLEEP.wakeMs), 'attention.svg');
});

test('desligar não perturbe sem evento novo também toca waking', () => {
  const p = new Presenter(theme([]), T0);
  p.setDnd(true, T0);
  p.tick(agg('idle', T0), T0 + 10);
  p.setDnd(false, T0 + 20);
  assert.equal(p.tick(agg('idle', T0), T0 + 20), 'waking.svg');
  assert.equal(p.tick(agg('idle', T0), T0 + 20 + SLEEP.wakeMs), 'idle.svg');
});
