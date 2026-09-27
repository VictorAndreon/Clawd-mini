import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, effectiveState, PRIORITY, SessionRecord, State } from '../src/main/state-machine';

const NOW = 10_000_000;
function r(p: Partial<SessionRecord> & { state: State }): SessionRecord {
  return { sessionId: 's', event: 'x', project: 'p', subagents: 0, updatedAt: NOW, ...p };
}

test('attention numa sessão vence working na outra', () => {
  const a = aggregate([r({ sessionId: 'a', state: 'working' }), r({ sessionId: 'b', state: 'attention' })], NOW);
  assert.equal(a.state, 'attention');
  assert.equal(a.active, 2);
});

test('ordem completa de prioridade', () => {
  const order: State[] = ['idle', 'thinking', 'working', 'juggling', 'done', 'sweeping', 'attention', 'error'];
  order.forEach((s, i) => assert.equal(PRIORITY[s], i, s));
  for (let i = 0; i < order.length - 1; i++) {
    const lo = r({ sessionId: 'lo', state: order[i] });
    const hi = r({ sessionId: 'hi', state: order[i + 1], updatedAt: NOW - 1 });
    assert.equal(aggregate([lo, hi], NOW).state, order[i + 1]);
  }
});

test('one-shots e working preso expiram pelo relógio', () => {
  assert.equal(effectiveState(r({ state: 'done', updatedAt: NOW - 3_999 }), NOW), 'done');
  assert.equal(effectiveState(r({ state: 'done', updatedAt: NOW - 4_000 }), NOW), 'idle');
  assert.equal(effectiveState(r({ state: 'error', updatedAt: NOW - 4_999 }), NOW), 'error');
  assert.equal(effectiveState(r({ state: 'error', updatedAt: NOW - 5_000 }), NOW), 'thinking');
  assert.equal(effectiveState(r({ state: 'working', updatedAt: NOW - 299_999 }), NOW), 'working');
  assert.equal(effectiveState(r({ state: 'working', updatedAt: NOW - 300_000 }), NOW), 'idle');
  assert.equal(effectiveState(r({ state: 'sweeping', updatedAt: NOW - 500_000 }), NOW), 'sweeping');
});

test('sessão velha sai do cálculo mas conta em lastEventAt', () => {
  const a = aggregate([r({ state: 'thinking', updatedAt: NOW - 600_001 })], NOW);
  assert.deepEqual(a, { state: 'idle', key: 'idle', lastEventAt: NOW - 600_001, active: 0 });
  assert.equal(aggregate([r({ state: 'thinking', updatedAt: NOW - 600_000 })], NOW).state, 'thinking');
});

test('attention não fica velha: o Claude continua esperando você', () => {
  const a = aggregate([r({ state: 'attention', updatedAt: NOW - 3 * 60 * 60_000 })], NOW);
  assert.equal(a.state, 'attention');
  assert.equal(a.active, 1);
});

test('variantes de working e juggling', () => {
  const key = (p: Partial<SessionRecord> & { state: State }) => aggregate([r(p)], NOW).key;
  assert.equal(key({ state: 'working', tool: 'Edit' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'MultiEdit' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'NotebookEdit' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'Write' }), 'typing');
  assert.equal(key({ state: 'working', tool: 'Bash' }), 'building');
  assert.equal(key({ state: 'working', tool: 'Read' }), 'working');
  assert.equal(key({ state: 'working' }), 'working');
  assert.equal(key({ state: 'juggling', subagents: 1 }), 'juggling');
  assert.equal(key({ state: 'juggling', subagents: 3 }), 'juggling2');
});

test('empate: a sessão mais recente decide a variante', () => {
  const a = aggregate([
    r({ sessionId: 'old', state: 'working', tool: 'Bash', updatedAt: NOW - 10 }),
    r({ sessionId: 'new', state: 'working', tool: 'Edit', updatedAt: NOW - 5 }),
  ], NOW);
  assert.equal(a.key, 'typing');
});

test('sem sessões → idle, lastEventAt 0', () => {
  assert.deepEqual(aggregate([], NOW), { state: 'idle', key: 'idle', lastEventAt: 0, active: 0 });
});
