import {
  ACTIONS, TABS, DEFAULT_LAYOUT, resetTab, setBind, keyLabel, saveSettings, loadSettings,
} from './settings.js';
import { esc, openModal, closeModal, confirmDialog, toast } from './ui.js';

/**
 * The settings dialog (Audio, Graphics, Controls, Gameplay), keybind capture
 * and the touch layout editor. `onChange()` is called after every change;
 * the caller applies the settings to the game.
 */
const $ = (s) => document.querySelector(s);
const TAB_NAMES = { audio: 'Audio', graphics: 'Graphics', controls: 'Controls', gameplay: 'Gameplay' };
const LAYOUT_NAMES = { move: 'Move stick', aim: 'Aim stick', bSwap: 'Swap', bAbility: 'Skill', bFire: 'Fire' };

let storage = null;
try { storage = localStorage; } catch { /* storage blocked: settings still work for this visit */ }

/** Save to localStorage; false when the browser blocks storage. */
export const persist = (settings) => !!storage && saveSettings(storage, settings);
export const loadStored = () => loadSettings(storage || { getItem: () => null });

export function initSettingsUI(settings, onChange) {
  const dialog = $('#settings');
  let tab = 'audio';
  const save = () => {
    if (!persist(settings)) toast('Settings could not be saved in this browser');
    onChange();
  };

  $('#setTabs').innerHTML = TABS.map((t) => `<button type="button" role="tab" data-tab="${t}">${TAB_NAMES[t]}</button>`).join('');
  $('#setTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; render(); }
  });
  $('#setClose').addEventListener('click', () => closeModal(dialog));
  $('#setReset').addEventListener('click', () => { resetTab(settings, tab); save(); render(); toast(`${TAB_NAMES[tab]} reset to defaults`); });

  const slider = (path, label, min, max, step, fmt) => {
    const v = get(path);
    return `<label class="set-row"><span>${label}</span><input type="range" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${fmt(v)}</output></label>`;
  };
  const toggle = (path, label, hint = '') => `<label class="set-row"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-path="${path}" ${get(path) ? 'checked' : ''}></label>`;
  const choice = (path, label, items) => `<div class="set-row"><span>${label}</span><div class="seg" data-path="${path}">${items.map(([v, l]) =>
    `<button type="button" data-v="${v}" aria-pressed="${get(path) === v}">${l}</button>`).join('')}</div></div>`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  function get(path) { return path.split('.').reduce((o, k) => o[k], settings); }
  function set(path, v) { const ks = path.split('.'); ks.slice(0, -1).reduce((o, k) => o[k], settings)[ks.at(-1)] = v; }

  function render() {
    for (const b of $('#setTabs').children) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    const body = $('#setBody');
    if (tab === 'audio') {
      body.innerHTML = slider('audio.master', 'Master volume', 0, 1, 0.05, pct) + slider('audio.effects', 'Effects volume', 0, 1, 0.05, pct)
        + slider('audio.music', 'Music volume', 0, 1, 0.05, pct) + toggle('audio.mute', 'Mute everything');
    } else if (tab === 'graphics') {
      body.innerHTML = choice('graphics.quality', 'Quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])
        + toggle('graphics.shake', 'Screen shake') + toggle('graphics.fps', 'Show FPS') + toggle('graphics.ping', 'Show ping')
        + `<div class="set-row"><span>Fullscreen</span><button type="button" id="setFull">${document.fullscreenElement ? 'Exit fullscreen' : 'Go fullscreen'}</button></div>`;
    } else if (tab === 'gameplay') {
      body.innerHTML = slider('gameplay.touchSens', 'Touch aim sensitivity', 0.5, 2, 0.1, (v) => `${Number(v).toFixed(1)}×`)
        + toggle('gameplay.autoFire', 'Auto-fire with the aim stick', 'Off: a Fire button appears on touch screens')
        + toggle('gameplay.hideNames', 'Hide name tags')
        + toggle('gameplay.colorblind', 'Colour-blind friendly team colours', 'Orange vs sky blue')
        + slider('gameplay.uiScale', 'UI scale', 80, 130, 5, (v) => `${v}%`);
    } else {
      const b = settings.controls.binds;
      body.innerHTML = `<p class="set-hint">Click a key, then press the new key or mouse button. Esc cancels, Delete clears.</p>
        <table class="binds"><tr><th>Action</th><th>Primary</th><th>Alternate</th></tr>${ACTIONS.map((a) =>
          `<tr><td>${esc(a.label)}</td>${[0, 1].map((slot) => `<td><button type="button" class="key" data-action="${a.id}" data-slot="${slot}">${esc(keyLabel(b[a.id][slot]))}</button></td>`).join('')}</tr>`).join('')}</table>
        <h4>Touch screens</h4>
        ${choice('controls.joystick', 'Joysticks', [['floating', 'Floating'], ['fixed', 'Fixed']])}
        <div class="set-row"><span>Stick and button positions</span><button type="button" id="setLayout">Edit touch layout</button></div>`;
    }
  }

  const body = $('#setBody');
  body.addEventListener('input', (e) => {
    const el = e.target.closest('[data-path]');
    if (!el) return;
    const v = el.type === 'checkbox' ? el.checked : Number(el.value);
    set(el.dataset.path, v);
    if (el.nextElementSibling?.tagName === 'OUTPUT') el.nextElementSibling.textContent = el.dataset.path === 'gameplay.uiScale' ? `${v}%` : el.dataset.path === 'gameplay.touchSens' ? `${v.toFixed(1)}×` : `${Math.round(v * 100)}%`;
    save();
  });
  body.addEventListener('click', async (e) => {
    const seg = e.target.closest('.seg[data-path] button');
    if (seg) { set(seg.parentElement.dataset.path, seg.dataset.v); save(); render(); return; }
    if (e.target.id === 'setFull') { toggleFullscreen().then(render); return; }
    if (e.target.id === 'setLayout') { closeModal(dialog); editLayout(settings, save); return; }
    const key = e.target.closest('button.key');
    if (key) capture(key);
  });

  /** Wait for the next key / mouse button / wheel and bind it. */
  function capture(btn) {
    const action = btn.dataset.action, slot = Number(btn.dataset.slot);
    btn.textContent = 'Press a key…';
    btn.classList.add('listening');
    const stop = () => {
      removeEventListener('keydown', onKey, true);
      removeEventListener('mousedown', onMouse, true);
      removeEventListener('wheel', onWheel, true);
    };
    const finish = async (code) => {
      stop();
      if (code !== undefined) {
        let r = setBind(settings.controls.binds, action, slot, code);
        if (r.conflict) {
          const other = ACTIONS.find((a) => a.id === r.conflict.action).label;
          const yes = await confirmDialog(`${keyLabel(code)} is already used for "${other}". Swap the two keys?`, 'Swap', 'Cancel');
          if (yes) r = setBind(settings.controls.binds, action, slot, code, { swap: true });
        }
        if (r.ok) save();
      }
      render();
    };
    // Swallow the event so the game never sees the key being bound.
    const eat = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const onKey = (e) => {
      eat(e);
      if (e.code === 'Escape') finish(undefined);
      else if (e.code === 'Delete' || e.code === 'Backspace') finish(slot === 1 ? null : undefined);
      else finish(e.code);
    };
    const onMouse = (e) => { eat(e); finish(`Mouse${e.button}`); };
    const onWheel = (e) => { eat(e); finish(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'); };
    // Start listening after this click has finished, so it is not taken as the new binding.
    setTimeout(() => {
      addEventListener('keydown', onKey, true);
      addEventListener('mousedown', onMouse, true);
      addEventListener('wheel', onWheel, { capture: true, passive: false });
    }, 0);
  }

  return {
    open() { render(); openModal(dialog); },
    get isOpen() { return !dialog.hidden; },
  };
}

export function toggleFullscreen() {
  try {
    return document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  } catch { toast('Fullscreen is not available here'); return Promise.resolve(); }
}

/** Drag sticks and buttons around; Smaller/Bigger resize the selected one. */
function editLayout(settings, save) {
  const el = $('#layoutEdit');
  const layout = settings.controls.layout;
  let selected = 'move';
  const draw = () => {
    $('#leItems').innerHTML = Object.keys(DEFAULT_LAYOUT).map((id) => {
      const l = layout[id], stick = id === 'move' || id === 'aim';
      const size = (stick ? 120 : 64) * l.s;
      return `<div class="le-item${stick ? ' stick' : ''}${id === selected ? ' sel' : ''}" data-id="${id}" style="left:${l.x * 100}%;top:${l.y * 100}%;width:${size}px;height:${size}px">${LAYOUT_NAMES[id]}</div>`;
    }).join('');
  };
  let drag = null;
  const onDown = (e) => {
    const item = e.target.closest('.le-item');
    if (!item) return;
    selected = item.dataset.id;
    drag = { id: selected, pointer: e.pointerId };
    draw();
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    layout[drag.id].x = Math.min(0.97, Math.max(0.03, e.clientX / innerWidth));
    layout[drag.id].y = Math.min(0.97, Math.max(0.03, e.clientY / innerHeight));
    draw();
  };
  const onUp = () => { if (drag) { drag = null; save(); } };
  const resize = (k) => { layout[selected].s = Math.min(1.8, Math.max(0.6, Math.round((layout[selected].s + k) * 10) / 10)); save(); draw(); };
  const items = $('#leItems');
  items.onpointerdown = onDown;
  el.onpointermove = onMove;
  el.onpointerup = onUp;
  $('#leSmaller').onclick = () => resize(-0.1);
  $('#leBigger').onclick = () => resize(0.1);
  $('#leReset').onclick = () => { Object.assign(layout, JSON.parse(JSON.stringify(DEFAULT_LAYOUT))); save(); draw(); };
  $('#leDone').onclick = () => closeModal(el);
  draw();
  openModal(el);
}
