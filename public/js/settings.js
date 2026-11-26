/**
 * Player settings and keybinds. Pure logic, no DOM: storage is passed in,
 * so this module runs (and is unit-tested) in Node as well as the browser.
 *
 * Bindings use KeyboardEvent.code (layout-independent, e.g. "KeyW"),
 * "Mouse0".."Mouse4" for mouse buttons and "WheelUp"/"WheelDown" for the wheel.
 * Every action has two slots: primary and alternate.
 */

export const STORAGE_KEY = 'mb_settings';

/** Every rebindable action, in the order the Controls tab lists them. `hold` = state, not a one-shot press. */
export const ACTIONS = [
  { id: 'up', label: 'Move up', hold: true },
  { id: 'down', label: 'Move down', hold: true },
  { id: 'left', label: 'Move left', hold: true },
  { id: 'right', label: 'Move right', hold: true },
  { id: 'shoot', label: 'Shoot', hold: true },
  { id: 'swap', label: 'Swap weapon' },
  { id: 'ability', label: 'Use skill' },
  { id: 'pick1', label: 'Pick skill card 1' },
  { id: 'pick2', label: 'Pick skill card 2' },
  { id: 'pick3', label: 'Pick skill card 3' },
  { id: 'scoreboard', label: 'Scoreboard' },
  { id: 'mute', label: 'Mute sound' },
  { id: 'menu', label: 'Settings / menu' },
];

export const DEFAULT_BINDS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  shoot: ['Mouse0', null],
  swap: ['KeyQ', 'WheelDown'],
  ability: ['KeyE', null],
  pick1: ['Digit1', null],
  pick2: ['Digit2', null],
  pick3: ['Digit3', null],
  scoreboard: ['Tab', null],
  mute: ['KeyM', null],
  menu: ['Escape', null],
};

/** Touch layout: centre (x, y) as fractions of the screen, size as a multiplier. */
export const DEFAULT_LAYOUT = {
  move: { x: 0.16, y: 0.72, s: 1 },
  aim: { x: 0.84, y: 0.72, s: 1 },
  bSwap: { x: 0.86, y: 0.42, s: 1 },
  bAbility: { x: 0.68, y: 0.5, s: 1 },
  bFire: { x: 0.7, y: 0.8, s: 1 },
};

export const DEFAULTS = {
  audio: { master: 0.8, effects: 1, music: 0.4, mute: false },
  graphics: { quality: 'high', shake: true, fps: false, ping: true },
  controls: { binds: DEFAULT_BINDS, joystick: 'floating', layout: DEFAULT_LAYOUT },
  gameplay: { touchSens: 1, autoFire: true, hideNames: false, colorblind: false, uiScale: 100 },
  seen: { welcome: false },
};

export const TABS = ['audio', 'graphics', 'controls', 'gameplay'];
export const QUALITY = { low: 0.35, medium: 0.65, high: 1 }; // particle multiplier
export const COLORBLIND_TEAM_COLORS = { 1: '#e69f00', 2: '#56b4e9' }; // orange / sky blue (Okabe-Ito)

const clone = (v) => JSON.parse(JSON.stringify(v));
const num = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const bool = (v, d) => (typeof v === 'boolean' ? v : d);
const isCode = (c) => c === null || (typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c));

/** Merge stored data over the defaults, keeping only valid values. Never throws. */
export function sanitize(raw) {
  const s = clone(DEFAULTS);
  const r = raw && typeof raw === 'object' ? raw : {};
  const a = r.audio || {}, g = r.graphics || {}, c = r.controls || {}, p = r.gameplay || {};
  s.audio = { master: num(a.master, 0, 1, s.audio.master), effects: num(a.effects, 0, 1, s.audio.effects),
    music: num(a.music, 0, 1, s.audio.music), mute: bool(a.mute, false) };
  s.graphics = { quality: Object.hasOwn(QUALITY, g.quality) ? g.quality : 'high', shake: bool(g.shake, true),
    fps: bool(g.fps, false), ping: bool(g.ping, true) };
  for (const id of Object.keys(DEFAULT_BINDS)) {
    const b = c.binds && c.binds[id];
    if (Array.isArray(b) && b.length === 2 && b.every(isCode)) s.controls.binds[id] = [...b];
  }
  s.controls.joystick = c.joystick === 'fixed' ? 'fixed' : 'floating';
  for (const id of Object.keys(DEFAULT_LAYOUT)) {
    const l = c.layout && c.layout[id];
    if (l) s.controls.layout[id] = { x: num(l.x, 0, 1, s.controls.layout[id].x), y: num(l.y, 0, 1, s.controls.layout[id].y), s: num(l.s, 0.6, 1.8, 1) };
  }
  s.gameplay = { touchSens: num(p.touchSens, 0.5, 2, 1), autoFire: bool(p.autoFire, true), hideNames: bool(p.hideNames, false),
    colorblind: bool(p.colorblind, false), uiScale: Math.round(num(p.uiScale, 80, 130, 100)) };
  s.seen = { welcome: bool(r.seen && r.seen.welcome, false) };
  return s;
}

/** Load from a Storage-like object ({ getItem, setItem }). Blocked or broken storage gives the defaults. */
export function loadSettings(storage) {
  try { return sanitize(JSON.parse(storage.getItem(STORAGE_KEY) || 'null')); } catch { return sanitize(null); }
}

/** Returns false when storage is unavailable (private mode, blocked cookies). */
export function saveSettings(storage, s) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

/** Put one tab back to its defaults, in place. */
export function resetTab(s, tab) {
  if (TABS.includes(tab)) s[tab] = clone(DEFAULTS[tab]);
  return s;
}

/** The action and slot already using `code`, ignoring `except` ({ action, slot }); null if free. */
export function findConflict(binds, code, except = {}) {
  if (!code) return null;
  for (const [action, slots] of Object.entries(binds)) {
    for (let slot = 0; slot < slots.length; slot++) {
      if (slots[slot] === code && !(action === except.action && slot === except.slot)) return { action, slot };
    }
  }
  return null;
}

/**
 * Bind `code` to binds[action][slot].
 * If another action already uses it: without `swap` nothing changes and the conflict is returned;
 * with `swap` the other action gets this slot's old key (so nothing is left unbound by surprise).
 */
export function setBind(binds, action, slot, code, { swap = false } = {}) {
  if (!binds[action] || (slot !== 0 && slot !== 1) || !isCode(code)) return { ok: false };
  const conflict = findConflict(binds, code, { action, slot });
  if (conflict && !swap) return { ok: false, conflict };
  if (conflict) binds[conflict.action][conflict.slot] = binds[action][slot];
  binds[action][slot] = code;
  return { ok: true, conflict };
}

/** Which action does this key/button trigger? */
export function actionFor(binds, code) {
  for (const [action, slots] of Object.entries(binds)) if (slots.includes(code)) return action;
  return null;
}

const NAMES = {
  Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  WheelUp: 'Wheel up', WheelDown: 'Wheel down', Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/',
};

/** Short human label: "KeyW" → "W", "Digit1" → "1", "Mouse0" → "Left click". */
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

/** "W / ↑" for an action, used by help text and the tutorial. */
export function bindLabel(binds, action) {
  return binds[action].filter(Boolean).map(keyLabel).join(' / ') || 'unbound';
}

/** "WASD" style label for the four move keys (primary slot). */
export function moveLabel(binds) {
  const keys = ['up', 'left', 'down', 'right'].map((a) => keyLabel(binds[a][0]));
  return keys.every((k) => k.length === 1) ? keys.join('') : keys.join(' ');
}
