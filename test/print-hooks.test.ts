import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

interface HookCmd { type: string; command: string; async: boolean; timeout: number }
interface PrintHooks {
  EVENTS: string[];
  buildHooks(node: string, hook: string): { hooks: Record<string, Array<{ matcher: string; hooks: HookCmd[] }>> };
}
const ROOT = path.join(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ph: PrintHooks = require(path.join(ROOT, 'scripts', 'print-hooks.js'));

test('um bloco por evento, async, timeout 3, matcher vazio', () => {
  const out = ph.buildHooks('/usr/bin/node', '/repo/hook/hook.js');
  assert.deepEqual(Object.keys(out.hooks), ph.EVENTS);
  assert.equal(ph.EVENTS.length, 13);
  assert.ok(ph.EVENTS.includes('StopFailure'));
  for (const ev of ph.EVENTS) {
    const [block] = out.hooks[ev];
    assert.equal(block.matcher, '');
    assert.deepEqual(block.hooks[0], {
      type: 'command',
      command: `'/usr/bin/node' '/repo/hook/hook.js' ${ev}`,
      async: true,
      timeout: 3,
    });
  }
});

test('comando funciona via shell com espaço e aspas simples no caminho', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-ph-'));
  const dir = path.join(tmp, "dir com espaço", "it's");
  fs.mkdirSync(dir, { recursive: true });
  const hookCopy = path.join(dir, 'hook.js');
  fs.copyFileSync(path.join(ROOT, 'hook', 'hook.js'), hookCopy);
  const home = path.join(tmp, 'home');
  const cmd = ph.buildHooks(process.execPath, hookCopy).hooks.Stop[0].hooks[0].command;
  const r = spawnSync('sh', ['-c', cmd], {
    input: JSON.stringify({ session_id: 'q1', cwd: '/x/proj' }),
    env: { ...process.env, CLAWD_MINI_HOME: home },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  const rec = JSON.parse(fs.readFileSync(path.join(home, 'sessions', 'q1.json'), 'utf8'));
  assert.equal(rec.state, 'done');
});
