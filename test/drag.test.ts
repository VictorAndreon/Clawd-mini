import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDragController, dragTarget } from '../src/main/drag';

test('dragTarget desloca a janela pelo movimento do cursor', () => {
  assert.deepEqual(dragTarget({ sx: 500, sy: 500, wx: 100, wy: 200 }, 530, 480), { x: 130, y: 180 });
  assert.deepEqual(dragTarget({ sx: 0, sy: 0, wx: 0, wy: 0 }, 1.6, 2.4), { x: 2, y: 2 });
});

function fakeDesktop() {
  const state = { cursor: { x: 500, y: 500 }, win: [100, 200] as [number, number], drops: [] as Array<[number, number]> };
  const ctl = createDragController({
    getCursor: () => state.cursor,
    getWindowPos: () => state.win,
    setWindowPos: (x, y) => { state.win = [x, y]; },
    onDrop: (x, y) => { state.drops.push([x, y]); },
  });
  return { state, ctl };
}

test('a janela segue o cursor do sistema, não coordenadas do renderer', () => {
  const { state, ctl } = fakeDesktop();
  ctl.start();
  state.cursor = { x: 530, y: 480 };
  ctl.move();
  assert.deepEqual(state.win, [130, 180]);
  // mover a janela não pode realimentar o cálculo: mesmo cursor, mesma posição
  ctl.move();
  assert.deepEqual(state.win, [130, 180]);
  state.cursor = { x: 800, y: 800 };
  ctl.move();
  assert.deepEqual(state.win, [400, 500]);
  ctl.end();
  assert.deepEqual(state.drops, [[400, 500]]);
});

test('move e end sem start não fazem nada', () => {
  const { state, ctl } = fakeDesktop();
  state.cursor = { x: 900, y: 900 };
  ctl.move();
  ctl.end();
  assert.deepEqual(state.win, [100, 200]);
  assert.deepEqual(state.drops, []);
});
