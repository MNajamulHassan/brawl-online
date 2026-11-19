import { COLORS, HATS, MODES, MAPS, WEAPONS, TEAM_COLORS, TEAM_NAMES } from '/shared/constants.js';
import { drawCharacter } from './renderer.js';

/** DOM for the lobby and the in-game HUD. No game rules live here. */

const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(`mb_${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`mb_${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

export const profile = store.get('profile', null) || {
  name: `Player${Math.floor(Math.random() * 900 + 100)}`,
  color: COLORS[Math.floor(Math.random() * COLORS.length)],
  hat: 1,
};
export const options = store.get('options', { mode: 'dm', map: 'field', visibility: 'public', bots: true });
const saveProfile = () => store.set('profile', profile);
const saveOptions = () => store.set('options', options);

let toastTimer = 0;
export function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function segmented(el, items, current, onPick) {
  el.innerHTML = items.map(([v, label]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(current)}">${esc(label)}</button>`).join('');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of el.children) x.setAttribute('aria-pressed', String(x === b));
    onPick(b.dataset.v);
  });
}

/* ---------------------------------------------------------------- lobby */
export function initLobby(handlers) {
  const modeDescriptions = {
    dm: 'Every fighter for themselves. First to 15 eliminations wins.',
    tdm: 'Red versus Blue. Coordinate with your squad to reach 30 first.',
  };
  const updateModeDescription = () => { $('#modeDesc').textContent = modeDescriptions[options.mode] || ''; };

  for (const button of document.querySelectorAll('[data-jump]')) {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.jump);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      for (const item of document.querySelectorAll('.rail-item')) item.classList.toggle('active', item === button);
    });
  }

  const nm = $('#nm');
  nm.value = profile.name;
  nm.addEventListener('input', () => { profile.name = nm.value.slice(0, 14) || 'Player'; saveProfile(); handlers.onProfile(profile); });

  const sw = $('#swatch');
  sw.innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" aria-label="Colour ${c}" aria-pressed="${c === profile.color}"></button>`).join('');
  for (const b of sw.children) b.style.background = b.dataset.c;
  sw.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    profile.color = b.dataset.c;
    for (const x of sw.children) x.setAttribute('aria-pressed', String(x === b));
    saveProfile(); handlers.onProfile(profile);
  });

  segmented($('#hats'), HATS.map((h, i) => [i, h]), profile.hat, (v) => { profile.hat = Number(v); saveProfile(); handlers.onProfile(profile); });
  segmented($('#sMode'), Object.entries(MODES).map(([k, m]) => [k, m.name]), options.mode, (v) => {
    options.mode = v; saveOptions(); updateModeDescription();
  });
  updateModeDescription();
  segmented($('#sMap'), Object.entries(MAPS), options.map, (v) => { options.map = v; saveOptions(); });
  segmented($('#sVis'), [['public', 'Public'], ['private', 'Private']], options.visibility, (v) => { options.visibility = v; saveOptions(); });
  const cb = $('#cBots');
  cb.checked = !!options.bots;
  cb.addEventListener('change', () => { options.bots = cb.checked; saveOptions(); });

  $('#bQuick').addEventListener('click', () => handlers.onQuick());
  $('#bCreate').addEventListener('click', () => handlers.onCreate({ ...options }));
  $('#bPrac').addEventListener('click', () => handlers.onPractice({ ...options }));
  $('#fJoin').addEventListener('submit', (e) => { e.preventDefault(); handlers.onJoin($('#jcode').value.trim().toLowerCase()); });
  $('#list').addEventListener('click', (e) => { const b = e.target.closest('[data-join]'); if (b) handlers.onJoin(b.dataset.join); });

  const pv = $('#pv').getContext('2d');
  return {
    options,
    drawPreview(t) {
      pv.setTransform(1, 0, 0, 1, 0, 0); pv.clearRect(0, 0, 300, 300);
      pv.setTransform(3, 0, 0, 3, 0, 0);
      drawCharacter(pv, 50, 50, t / 900, profile.color, profile.hat, 'ar');
    },
  };
}

export function setNetStatus(text, online) {
  const el = $('#net');
  el.textContent = text;
  el.classList.toggle('on', !!online);
}

export function setLobbyError(text) { $('#err').textContent = text || ''; }

export function renderMatchList(matches) {
  const el = $('#list');
  if (!matches) { el.innerHTML = '<div class="empty">Not connected to the server.</div>'; return; }
  el.innerHTML = matches.length
    ? matches.map((m) => `<div class="gm"><span>${esc(MODES[m.mode]?.name || m.mode)} · ${esc(MAPS[m.map] || m.map)}${m.bots ? ' · bots' : ''}</span><b>${m.players}/${m.max}</b><button type="button" data-join="${esc(m.code)}">Join</button></div>`).join('')
    : '<div class="empty">No public matches yet. Create one or hit Quick play.</div>';
}

export function showLobby(show) {
  $('#lobby').hidden = !show;
  $('#hud').hidden = show;
  document.body.classList.toggle('lobby-open', show);
}

/* ------------------------------------------------------------------ HUD */
const feed = [];
export function addFeed(text) {
  feed.push({ text, at: performance.now() });
  if (feed.length > 5) feed.shift();
  renderFeed();
}
export function pruneFeed() {
  if (feed.length && performance.now() - feed[0].at > 5000) { feed.shift(); renderFeed(); }
}
export function clearFeed() { feed.length = 0; renderFeed(); }
function renderFeed() { $('#feed').innerHTML = feed.map((f) => `<div>${esc(f.text)}</div>`).join(''); }

let hitTimer = 0;
export function flashHitmarker() {
  const el = $('#hitmark');
  el.classList.add('on');
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => el.classList.remove('on'), 120);
}

export function setMatchInfo(m) {
  $('#matchInfo').innerHTML = m.practice
    ? `Practice · ${esc(MODES[m.mode].name)}`
    : `${m.visibility === 'private' ? 'Private' : 'Public'} · code <b>${esc(m.code)}</b> · ${esc(MODES[m.mode].name)}`;
}

/** Refresh every HUD element from the latest snapshot. */
export function updateHud({ snap, me, meId, match, showBoard, ping }) {
  const teams = MODES[match.mode].teams;
  const r = snap.round;
  $('#timer').textContent = r.s === 'ended' ? '0:00' : `${Math.floor(r.tl / 60)}:${String(r.tl % 60).padStart(2, '0')}`;

  if (teams) $('#score').innerHTML = `<span class="r">Red ${snap.ts[0]}</span> · <span class="b">Blue ${snap.ts[1]}</span>`;
  else {
    const top = snap.pl.reduce((m, p) => Math.max(m, p.k), 0);
    $('#score').textContent = `You ${me ? me.k : 0} · Top ${top} / ${MODES[match.mode].scoreLimit}`;
  }

  if (me) {
    const bar = $('#hpb i');
    bar.style.width = `${Math.max(0, me.hp)}%`;
    bar.style.background = me.hp > 50 ? 'var(--lime)' : me.hp > 25 ? '#ffc23a' : 'var(--red)';
    $('#hpt').textContent = Math.max(0, me.hp);
    $('#wn').textContent = WEAPONS[me.w]?.name || 'Pistol';
    $('#wa').textContent = me.w === 'pistol' ? (me.sp ? `∞ · ${WEAPONS[me.sp].name} ${me.am}` : '∞') : `${me.am} left`;
    $('#bSwap').hidden = !me.sp;

    const dead = $('#dead');
    if (!me.al && r.s === 'playing') {
      const killer = snap.pl.find((p) => p.i === me.lk);
      const by = me.lk === meId ? 'You blew yourself up' : `Eliminated by ${esc(killer ? killer.n : 'someone')}`;
      dead.hidden = false;
      dead.innerHTML = `${by}<small>Respawning in ${Math.ceil(me.rs / 1000)}…</small>`;
    } else dead.hidden = true;
  }
  $('#ping').textContent = ping ? `${ping} ms` : '';

  const board = $('#board');
  const visible = showBoard || r.s === 'ended';
  board.hidden = !visible;
  if (!visible) return;
  const rows = [...snap.pl].sort((a, b) => b.k - a.k || a.d - b.d);
  $('#bh').textContent = r.s === 'ended' ? `Round over · ${r.w === 'Draw' ? 'draw' : `${r.w} wins`}` : 'Scores';
  $('#bt').innerHTML = '<tr><th>Player</th><th>Kills</th><th>Deaths</th></tr>' + rows.map((p) =>
    `<tr class="${p.i === meId ? 'me' : ''}"><td><span class="dot" data-c="${esc(teams ? TEAM_COLORS[p.t] : p.c)}"></span>${esc(p.n)}${teams ? ` <small>(${TEAM_NAMES[p.t]})</small>` : ''}</td><td>${p.k}</td><td>${p.d}</td></tr>`).join('');
  for (const d of board.querySelectorAll('.dot')) d.style.background = d.dataset.c;
  $('#bhint').textContent = r.s === 'ended' ? `Next round in ${r.tl}s.` : match.practice ? 'Practice match against bots.' : `Share code ${match.code} so friends can join.`;
}
