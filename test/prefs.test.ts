import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_SIZE, loadPrefs, resolvePosition, savePrefs } from '../src/main/prefs';

function tmpFile(content?: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clawd-prefs-')), 'sub', 'prefs.json');
  if (content !== undefined) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return file;
}

test('arquivo ausente ou corrompido → defaults', () => {
  assert.deepEqual(loadPrefs(tmpFile()), { size: DEFAULT_SIZE });
  assert.deepEqual(loadPrefs(tmpFile('{"x": 1')), { size: DEFAULT_SIZE });
  assert.deepEqual(loadPrefs(tmpFile('null')), { size: DEFAULT_SIZE });
});

test('valores lixo são descartados; size é limitado', () => {
  assert.deepEqual(loadPrefs(tmpFile('{"size":"abc","x":null,"y":5}')), { size: DEFAULT_SIZE });
  assert.deepEqual(loadPrefs(tmpFile('{"size":10}')), { size: 64 });
  assert.deepEqual(loadPrefs(tmpFile('{"size":9999}')), { size: 512 });
  assert.deepEqual(loadPrefs(tmpFile('{"size":200.4,"x":10.6,"y":-3}')), { size: 200, x: 11, y: -3 });
});

test('savePrefs grava atômico com 0600 e relê igual', () => {
  const file = tmpFile();
  savePrefs(file, { x: 100, y: 200, size: 160 });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(loadPrefs(file), { x: 100, y: 200, size: 160 });
  assert.equal(fs.readdirSync(path.dirname(file)).some((f) => f.endsWith('.tmp')), false);
});

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 };
const SECOND = { x: 1920, y: 0, width: 1280, height: 1024 };

test('posição dentro de alguma tela é mantida', () => {
  assert.deepEqual(resolvePosition({ x: 2000, y: 100, size: 160 }, [PRIMARY, SECOND], PRIMARY), { x: 2000, y: 100 });
});

test('posição fora de qualquer tela (monitor desconectado) → canto inferior direito da principal', () => {
  const br = { x: 1920 - 160 - 16, y: 1040 - 160 - 16 };
  assert.deepEqual(resolvePosition({ x: 2000, y: 100, size: 160 }, [PRIMARY], PRIMARY), br);
  assert.deepEqual(resolvePosition({ size: 160 }, [PRIMARY], PRIMARY), br);
});
