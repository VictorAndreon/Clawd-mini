import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { hitRect } from '../src/main/hitbox';
import { loadTheme, themeFiles, Box } from '../src/main/theme';
import { APP_ROOT } from '../src/main/paths';

const VB: Box = [-15, -25, 30, 20]; // 45x45

test('hitRect converte unidades do viewBox em pixels da janela', () => {
  // corpo do clawd parado: 18 de 45 unidades de largura, 12 de altura, no canto inferior
  assert.deepEqual(hitRect(VB, [[-1.5, 5, 16.5, 17]], 450), { x: 135, y: 300, width: 180, height: 120 });
});

test('hitRect une as caixas e recorta nos limites da janela', () => {
  assert.deepEqual(hitRect(VB, [[0, 0, 5, 5], [-40, 10, 50, 30]], 45), { x: 0, y: 25, width: 45, height: 20 });
});

test('hitRect sem caixa ou caixa fora da janela devolve null', () => {
  assert.equal(hitRect(VB, [], 160), null);
  assert.equal(hitRect(VB, [[40, 0, 50, 5]], 160), null);
});

test('tema clawd: todo sprite tem hitbox válida dentro do viewBox, sem cobrir a janela toda', () => {
  const t = loadTheme(path.join(APP_ROOT, 'themes', 'clawd'));
  for (const f of themeFiles(t)) {
    assert.ok(t.hitboxes[f], `${f}: sem hitbox`);
    const r = hitRect(t.viewBox, [t.hitboxes[f]], 160);
    assert.ok(r, f);
    assert.ok(r.width * r.height < 160 * 160 * 0.6, `${f}: hitbox grande demais`);
  }
});
