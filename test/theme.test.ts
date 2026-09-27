import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadTheme, themeFiles, SPRITE_KEYS } from '../src/main/theme';
import { APP_ROOT } from '../src/main/paths';

const CLAWD = path.join(APP_ROOT, 'themes', 'clawd');

test('tema clawd: todos os estados e arquivos existem', () => {
  const t = loadTheme(CLAWD);
  for (const k of SPRITE_KEYS) assert.match(t.states[k], /^clawd-.*\.svg$/, k);
  assert.equal(themeFiles(t).length, 19);
  assert.equal(t.idleVariations.length, 3);
});

test('SVGs não têm script, handler de evento nem referência externa', () => {
  for (const f of themeFiles(loadTheme(CLAWD))) {
    const svg = fs.readFileSync(path.join(CLAWD, f), 'utf8');
    assert.equal(/<script/i.test(svg), false, `${f}: <script>`);
    assert.equal(/\son[a-z]+\s*=/i.test(svg), false, `${f}: on*=`);
    assert.equal(/(href|src)\s*=\s*["']\s*(https?:|\/\/)/i.test(svg), false, `${f}: ref externa`);
  }
});

function fakeTheme(states: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-theme-'));
  for (const f of new Set(Object.values(states))) {
    if (/^[\w.-]+$/.test(f)) fs.writeFileSync(path.join(dir, f), '<svg/>');
  }
  fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({ name: 'x', states, idleVariations: [] }));
  return dir;
}
const full = (): Record<string, string> => Object.fromEntries(SPRITE_KEYS.map((k) => [k, `clawd-${k}.svg`]));

test('loadTheme rejeita estado faltando', () => {
  const s = full();
  delete s.drag;
  assert.throws(() => loadTheme(fakeTheme(s)), /drag/);
});

test('loadTheme rejeita nome de arquivo suspeito', () => {
  assert.throws(() => loadTheme(fakeTheme({ ...full(), idle: '../x.svg' })), /idle/);
});

test('loadTheme acusa arquivo ausente', () => {
  const dir = fakeTheme(full());
  fs.unlinkSync(path.join(dir, 'clawd-error.svg'));
  assert.throws(() => loadTheme(dir), /clawd-error\.svg/);
});
