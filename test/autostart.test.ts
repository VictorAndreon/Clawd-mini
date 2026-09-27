import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

interface Autostart {
  desktopEntry(nodePath: string, startJs: string): string;
  autostartFile(env: NodeJS.ProcessEnv, home: string): string;
}
const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'install-autostart.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const as: Autostart = require(SCRIPT);

test('desktopEntry chama o start.js com o node absoluto e aspas escapadas', () => {
  const d = as.desktopEntry('/n/node', '/repo com espaço/scripts/start.js');
  assert.match(d, /^\[Desktop Entry\]$/m);
  assert.match(d, /^Exec="\/n\/node" "\/repo com espaço\/scripts\/start\.js"$/m);
  assert.match(d, /^X-GNOME-Autostart-enabled=true$/m);
  assert.equal(as.desktopEntry('/n/node', '/a"b$c').includes('Exec="/n/node" "/a\\"b\\$c"'), true);
});

test('autostartFile respeita XDG_CONFIG_HOME', () => {
  assert.equal(as.autostartFile({}, '/h'), '/h/.config/autostart/clawd-mini.desktop');
  assert.equal(as.autostartFile({ XDG_CONFIG_HOME: '/x' }, '/h'), '/x/autostart/clawd-mini.desktop');
});

test('CLI instala e desinstala', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-auto-'));
  const env = { ...process.env, XDG_CONFIG_HOME: cfg };
  const file = path.join(cfg, 'autostart', 'clawd-mini.desktop');
  assert.equal(spawnSync(process.execPath, [SCRIPT], { env }).status, 0);
  assert.ok(fs.existsSync(file));
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--uninstall'], { env }).status, 0);
  assert.equal(fs.existsSync(file), false);
  assert.equal(spawnSync(process.execPath, [SCRIPT, '--uninstall'], { env }).status, 0);
});
