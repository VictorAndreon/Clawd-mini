import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

type Rec = Record<string, unknown> | null;
interface HookModule {
  computeNext(prev: Rec, event: string, input: Record<string, unknown>, now: number): Rec;
}

const HOOK = path.join(__dirname, '..', '..', 'hook', 'hook.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hook: HookModule = require(HOOK);

const ID = 'abc-123';
const base = { session_id: ID, cwd: '/home/u/projetos/efesus' };

function tmpHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-hook-'));
}
function runHook(home: string, event: string, stdin: string) {
  return spawnSync(process.execPath, [HOOK, event], {
    input: stdin,
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CLAWD_MINI_HOME: home },
  });
}
function recPath(home: string, id: string): string {
  return path.join(home, 'sessions', id + '.json');
}

test('mapa evento → estado', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ['SessionStart', {}, 'idle'],
    ['UserPromptSubmit', {}, 'thinking'],
    ['PreToolUse', { tool_name: 'Read' }, 'working'],
    ['PostToolUse', { tool_name: 'Read' }, 'thinking'],
    ['PostToolUseFailure', {}, 'error'],
    ['PreCompact', {}, 'sweeping'],
    ['PostCompact', {}, 'idle'],
    ['Notification', { notification_type: 'permission_prompt' }, 'attention'],
    ['Notification', { notification_type: 'agent_needs_input' }, 'attention'],
    ['Notification', {}, 'attention'],
    ['Stop', {}, 'done'],
  ];
  for (const [ev, extra, want] of cases) {
    const r = hook.computeNext(null, ev, { ...base, ...extra }, 1000);
    assert.equal(r && r.state, want, ev);
  }
});

test('evento desconhecido → null', () => {
  assert.equal(hook.computeNext(null, 'Banana', base, 1), null);
});

test('Notification que não pede o usuário → null', () => {
  for (const t of ['auth_success', 'idle_prompt', 'elicitation_complete', 'quota_auto_resume_fired']) {
    assert.equal(hook.computeNext(null, 'Notification', { ...base, notification_type: t }, 1), null, t);
  }
});

test('tool só em Pre/PostToolUse; project é basename', () => {
  const pre = hook.computeNext(null, 'PreToolUse', { ...base, tool_name: 'Edit' }, 1)!;
  assert.equal(pre.tool, 'Edit');
  assert.equal(pre.project, 'efesus');
  const stop = hook.computeNext(pre, 'Stop', { ...base, tool_name: 'Edit' }, 2)!;
  assert.equal('tool' in stop, false);
  const noCwd = hook.computeNext(pre, 'Stop', { session_id: ID }, 3)!;
  assert.equal(noCwd.project, 'efesus');
});

test('evento mais velho que o gravado é descartado (hooks async fora de ordem)', () => {
  const prev = { sessionId: ID, state: 'thinking', updatedAt: 2000 };
  assert.equal(hook.computeNext(prev, 'PreToolUse', base, 1500), null);
});

test('contador de subagentes e volta ao estado anterior', () => {
  const r1 = hook.computeNext({ state: 'working', updatedAt: 0, subagents: 0 }, 'SubagentStart', base, 1)!;
  assert.deepEqual([r1.state, r1.subagents, r1.prevState], ['juggling', 1, 'working']);
  const r2 = hook.computeNext(r1, 'SubagentStart', base, 2)!;
  assert.deepEqual([r2.state, r2.subagents, r2.prevState], ['juggling', 2, 'working']);
  const r3 = hook.computeNext(r2, 'PreToolUse', { ...base, tool_name: 'Read' }, 3)!;
  assert.equal(r3.state, 'juggling');
  const r4 = hook.computeNext(r3, 'Notification', { ...base, notification_type: 'permission_prompt' }, 4)!;
  assert.deepEqual([r4.state, r4.subagents], ['attention', 2]);
  const r5 = hook.computeNext(r4, 'SubagentStop', base, 5)!;
  assert.deepEqual([r5.state, r5.subagents], ['juggling', 1]);
  const r6 = hook.computeNext(r5, 'SubagentStop', base, 6)!;
  assert.deepEqual([r6.state, r6.subagents, 'prevState' in r6], ['working', 0, false]);
  assert.equal(hook.computeNext(r6, 'SubagentStop', base, 7), null);
});

test('Stop e UserPromptSubmit zeram subagentes', () => {
  const prev = { state: 'juggling', subagents: 2, prevState: 'working', updatedAt: 0 };
  for (const ev of ['Stop', 'UserPromptSubmit']) {
    const r = hook.computeNext(prev, ev, base, 1)!;
    assert.equal(r.subagents, 0, ev);
    assert.equal('prevState' in r, false, ev);
  }
});

test('grava arquivo 0600 em dir 0700, sem stdout e sem campos proibidos', () => {
  const home = tmpHome();
  const payload = {
    ...base,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf segredo' },
    tool_response: 'segredo',
    prompt: 'segredo',
    transcript_path: '/segredo.jsonl',
  };
  const r = runHook(home, 'PreToolUse', JSON.stringify(payload));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  const file = recPath(home, ID);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  const raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw.includes('segredo'), false);
  const rec = JSON.parse(raw);
  assert.deepEqual(Object.keys(rec).sort(), ['event', 'project', 'sessionId', 'state', 'subagents', 'tool', 'updatedAt']);
  assert.equal(rec.state, 'working');
  assert.equal(fs.readdirSync(path.dirname(file)).some((f) => f.endsWith('.tmp')), false);
});

test('SessionEnd apaga o arquivo', () => {
  const home = tmpHome();
  runHook(home, 'SessionStart', JSON.stringify(base));
  assert.ok(fs.existsSync(recPath(home, ID)));
  const r = runHook(home, 'SessionEnd', JSON.stringify(base));
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(recPath(home, ID)), false);
});

test('stdin vazio, JSON inválido e session_id perigoso: exit 0 sem gravar', () => {
  for (const [stdin, label] of [
    ['', 'vazio'],
    ['não é json', 'inválido'],
    ['[1,2]', 'array'],
    [JSON.stringify({ session_id: '../evil', cwd: '/x' }), 'traversal'],
    [JSON.stringify({ session_id: 'a/b', cwd: '/x' }), 'barra'],
    [JSON.stringify({ session_id: '', cwd: '/x' }), 'id vazio'],
  ]) {
    const home = tmpHome();
    const r = runHook(home, 'Stop', stdin);
    assert.equal(r.status, 0, label);
    assert.equal(r.stdout, '', label);
    assert.deepEqual(fs.readdirSync(home), [], label);
  }
});

test('stdin que nunca fecha: sai com 0 em ~1 s', async () => {
  const home = tmpHome();
  const t0 = Date.now();
  const child = spawn(process.execPath, [HOOK, 'Stop'], {
    env: { ...process.env, CLAWD_MINI_HOME: home },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
  child.stdin.destroy();
  assert.equal(code, 0);
  assert.ok(Date.now() - t0 < 3000, `demorou ${Date.now() - t0} ms`);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('hook.js só usa sintaxe/APIs de Node 12', () => {
  const src = fs.readFileSync(HOOK, 'utf8');
  for (const [re, what] of [
    [/\?\./, 'optional chaining'],
    [/\?\?/, 'nullish coalescing'],
    [/\|\|=|&&=/, 'logical assignment'],
    [/^\s*import\s/m, 'ESM import'],
    [/\brmSync\b|\.at\(|\breplaceAll\b|\bstructuredClone\b/, 'API nova'],
  ] as Array<[RegExp, string]>) {
    assert.equal(re.test(src), false, what);
  }
});
