import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS, DEFAULT_BINDS, STORAGE_KEY, loadSettings, saveSettings, resetTab, findConflict, setBind,
  actionFor, keyLabel, bindLabel, moveLabel, sanitize,
} from '../public/js/settings.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};
const blockedStorage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };

test('first load gives the defaults', () => {
  assert.deepEqual(loadSettings(memoryStorage()), sanitize(null));
  assert.deepEqual(loadSettings(memoryStorage()).controls.binds, DEFAULT_BINDS);
});

test('settings survive a save and load round trip', () => {
  const st = memoryStorage();
  const s = loadSettings(st);
  s.audio.master = 0.3;
  s.gameplay.uiScale = 120;
  setBind(s.controls.binds, 'swap', 0, 'KeyF');
  assert.equal(saveSettings(st, s), true);
  const back = loadSettings(st);
  assert.equal(back.audio.master, 0.3);
  assert.equal(back.gameplay.uiScale, 120);
  assert.equal(back.controls.binds.swap[0], 'KeyF');
});

test('blocked storage falls back to defaults without throwing', () => {
  assert.deepEqual(loadSettings(blockedStorage), sanitize(null));
  assert.equal(saveSettings(blockedStorage, sanitize(null)), false);
});

test('corrupt or hostile stored data is ignored field by field', () => {
  const st = memoryStorage();
  st.setItem(STORAGE_KEY, JSON.stringify({
    audio: { master: 9, effects: 'loud' }, graphics: { quality: 'ultra' },
    controls: { binds: { up: ['<script>', null], down: ['KeyJ', null], shoot: 'Mouse0' }, joystick: 'weird' },
    gameplay: { uiScale: 500, touchSens: -1 },
  }));
  const s = loadSettings(st);
  assert.equal(s.audio.master, 1, 'clamped');
  assert.equal(s.audio.effects, DEFAULTS.audio.effects);
  assert.equal(s.graphics.quality, 'high');
  assert.deepEqual(s.controls.binds.up, DEFAULT_BINDS.up, 'invalid code rejected');
  assert.deepEqual(s.controls.binds.down, ['KeyJ', null], 'valid custom bind kept');
  assert.deepEqual(s.controls.binds.shoot, DEFAULT_BINDS.shoot);
  assert.equal(s.controls.joystick, 'floating');
  assert.equal(s.gameplay.uiScale, 130);
  assert.equal(s.gameplay.touchSens, 0.5);
  st.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(loadSettings(st), sanitize(null));
});

test('rebinding to a used key reports the conflict and changes nothing', () => {
  const s = sanitize(null);
  const r = setBind(s.controls.binds, 'ability', 0, 'KeyQ');
  assert.equal(r.ok, false);
  assert.deepEqual(r.conflict, { action: 'swap', slot: 0 });
  assert.equal(s.controls.binds.ability[0], 'KeyE');
  assert.equal(s.controls.binds.swap[0], 'KeyQ');
});

test('swapping on conflict gives the other action the old key', () => {
  const s = sanitize(null);
  const r = setBind(s.controls.binds, 'ability', 0, 'KeyQ', { swap: true });
  assert.equal(r.ok, true);
  assert.equal(s.controls.binds.ability[0], 'KeyQ');
  assert.equal(s.controls.binds.swap[0], 'KeyE');
  assert.equal(actionFor(s.controls.binds, 'KeyE'), 'swap');
});

test('re-binding a key to its own slot is not a conflict', () => {
  const b = sanitize(null).controls.binds;
  assert.equal(findConflict(b, 'KeyW', { action: 'up', slot: 0 }), null);
  assert.deepEqual(findConflict(b, 'KeyW', { action: 'up', slot: 1 }), { action: 'up', slot: 0 });
});

test('alternate bindings both trigger the action', () => {
  const b = sanitize(null).controls.binds;
  assert.equal(actionFor(b, 'KeyW'), 'up');
  assert.equal(actionFor(b, 'ArrowUp'), 'up');
  setBind(b, 'shoot', 1, 'Space');
  assert.equal(actionFor(b, 'Space'), 'shoot');
  assert.equal(actionFor(b, 'Mouse0'), 'shoot');
});

test('invalid slots, actions and codes are refused', () => {
  const b = sanitize(null).controls.binds;
  assert.equal(setBind(b, 'fly', 0, 'KeyZ').ok, false);
  assert.equal(setBind(b, 'up', 2, 'KeyZ').ok, false);
  assert.equal(setBind(b, 'up', 0, 'Key Z!').ok, false);
  assert.equal(setBind(b, 'up', 1, null).ok, true, 'clearing the alternate is allowed');
  assert.equal(b.up[1], null);
});

test('reset puts one tab back to defaults and leaves the others', () => {
  const s = sanitize(null);
  setBind(s.controls.binds, 'up', 0, 'KeyI');
  s.audio.master = 0.1;
  resetTab(s, 'controls');
  assert.deepEqual(s.controls.binds, DEFAULT_BINDS);
  assert.equal(s.audio.master, 0.1);
  resetTab(s, 'audio');
  assert.equal(s.audio.master, DEFAULTS.audio.master);
  resetTab(s, 'controls').controls.binds.up[0] = 'KeyI';
  assert.equal(DEFAULT_BINDS.up[0], 'KeyW', 'defaults are never mutated');
});

test('labels show the current binds for help text', () => {
  const b = sanitize(null).controls.binds;
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('Digit2'), '2');
  assert.equal(keyLabel('Mouse0'), 'Left click');
  assert.equal(bindLabel(b, 'up'), 'W / ↑');
  assert.equal(moveLabel(b), 'WASD');
  setBind(b, 'up', 0, 'KeyI'); setBind(b, 'left', 0, 'KeyJ'); setBind(b, 'down', 0, 'KeyK'); setBind(b, 'right', 0, 'KeyL');
  assert.equal(moveLabel(b), 'IJKL');
});
