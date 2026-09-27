import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readSessions, watchSessions } from '../src/main/watcher';
import type { SessionRecord } from '../src/main/state-machine';

const DAY = 24 * 60 * 60_000;
function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-watch-'));
}
function write(dir: string, name: string, content: unknown): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}
const rec = (id: string, updatedAt: number) =>
  ({ sessionId: id, state: 'working', event: 'PreToolUse', project: 'p', subagents: 0, updatedAt });

async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout esperando condição');
    await new Promise((res) => setTimeout(res, 10));
  }
}

test('readSessions ignora JSON inválido, .tmp e registro sem campos obrigatórios', () => {
  const dir = tmpDir();
  const now = Date.now();
  write(dir, 'ok.json', rec('ok', now));
  write(dir, 'meio.json', '{"sessionId":"x","sta');
  write(dir, 'x.json.123.tmp', rec('tmp', now));
  write(dir, 'semstate.json', { sessionId: 'y', updatedAt: now });
  write(dir, 'estadoruim.json', { ...rec('z', now), state: 'dancing' });
  const out = readSessions(dir, now);
  assert.deepEqual(out.map((r) => r.sessionId), ['ok']);
  assert.equal(out[0].subagents, 0);
});

test('readSessions apaga arquivos com mais de 24 h', () => {
  const dir = tmpDir();
  const now = Date.now();
  const old = write(dir, 'old.json', rec('old', now - DAY - 1));
  const lixo = write(dir, 'lixo.json', 'não é json');
  const oldTmp = write(dir, 'a.json.9.tmp', 'x');
  const past = (now - DAY - 60_000) / 1000;
  fs.utimesSync(lixo, past, past);
  fs.utimesSync(oldTmp, past, past);
  const fresh = write(dir, 'fresh.json', rec('fresh', now));
  assert.deepEqual(readSessions(dir, now).map((r) => r.sessionId), ['fresh']);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(lixo), false);
  assert.equal(fs.existsSync(oldTmp), false);
  assert.equal(fs.existsSync(fresh), true);
});

test('readSessions em diretório inexistente devolve []', () => {
  assert.deepEqual(readSessions(path.join(tmpDir(), 'nao-existe'), Date.now()), []);
});

test('watchSessions cria o diretório (0700) e avisa quando um arquivo aparece', async () => {
  const dir = path.join(tmpDir(), 'sessions');
  const seen: SessionRecord[][] = [];
  const stop = watchSessions(dir, (r) => seen.push(r), { sweepMs: 60_000 });
  try {
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    assert.deepEqual(seen, [[]]);
    write(dir, 'a.json', rec('a', Date.now()));
    await waitFor(() => seen.some((r) => r.length === 1));
  } finally {
    stop();
  }
});

test('varredura periódica emite mesmo sem evento do fs.watch', async () => {
  const dir = tmpDir();
  let count = 0;
  const stop = watchSessions(dir, () => { count++; }, { sweepMs: 30 });
  try {
    await waitFor(() => count >= 4);
  } finally {
    stop();
  }
});
