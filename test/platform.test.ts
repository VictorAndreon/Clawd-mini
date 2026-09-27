import { test } from 'node:test';
import assert from 'node:assert/strict';
import { degradedDisplayWarning } from '../src/main/platform';

test('Xorg e Wayland com XWayland: sem aviso', () => {
  assert.equal(degradedDisplayWarning({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':1' }), null);
  assert.equal(degradedDisplayWarning({ XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' }), null);
});

test('Wayland sem XWayland: avisa', () => {
  const w = degradedDisplayWarning({ XDG_SESSION_TYPE: 'wayland', DISPLAY: '', WAYLAND_DISPLAY: 'wayland-0' });
  assert.match(w ?? '', /XWayland/);
});

test('WAYLAND_DISPLAY sem DISPLAY também conta, mesmo sem XDG_SESSION_TYPE', () => {
  assert.notEqual(degradedDisplayWarning({ WAYLAND_DISPLAY: 'wayland-0' }), null);
});

test('sem nada (tty, ssh): sem aviso', () => {
  assert.equal(degradedDisplayWarning({}), null);
});
