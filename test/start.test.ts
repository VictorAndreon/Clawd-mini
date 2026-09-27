import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

interface Start {
  buildLaunch(env: NodeJS.ProcessEnv, root: string): { args: string[]; env: NodeJS.ProcessEnv };
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const start: Start = require(path.join(__dirname, '..', '..', 'scripts', 'start.js'));

test('com DISPLAY passa --ozone-platform=x11', () => {
  assert.deepEqual(start.buildLaunch({ DISPLAY: ':0' }, '/repo').args, ['/repo', '--ozone-platform=x11']);
});

test('sem DISPLAY (Wayland sem XWayland) não passa a flag', () => {
  assert.deepEqual(start.buildLaunch({ DISPLAY: '' }, '/repo').args, ['/repo']);
  assert.deepEqual(start.buildLaunch({}, '/repo').args, ['/repo']);
});

test('remove ELECTRON_RUN_AS_NODE herdado e preserva o resto', () => {
  const { env } = start.buildLaunch({ DISPLAY: ':0', ELECTRON_RUN_AS_NODE: '1', HOME: '/h' }, '/repo');
  assert.equal('ELECTRON_RUN_AS_NODE' in env, false);
  assert.equal(env.HOME, '/h');
});
