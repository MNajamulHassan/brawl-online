/* global io */
import { INPUT_DT, PLAYER_SPEED, PLAYER_RADIUS, TILE, MAP_W, MAP_H, TEAM_COLORS } from '/shared/constants.js';
import { buildMap } from '/shared/maps.js';
import { moveEntity, isSolidPoint } from '/shared/physics.js';
import { Input } from './input.js';
import { renderMapImage, drawFrame } from './renderer.js';
import {
  sfx, setVolumes, setShakeEnabled, startMusic, stopMusic, shake, shakeOffset, floaters, addFloater, updateFloaters,
} from './fx.js';
import {
  profile, initLobby, setNetStatus, setLobbyError, renderMatchList, showLobby, toast,
  addFeed, pruneFeed, clearFeed, flashHitmarker, setMatchInfo, updateHud,
  initDraft, killConfirm, hurtFlash, recordWaves, openModal, closeModal, closeTopModal, anyModalOpen, confirmDialog,
} from './ui.js';
import { QUALITY, COLORBLIND_TEAM_COLORS } from './settings.js';
import { initSettingsUI, persist, loadStored } from './settingsUI.js';
import { renderHelp, openHowTo, openAbout, initHelpDialogs } from './help.js';
import { Tutorial } from './tutorial.js';

/**
 * Client game loop.
 *  - Own player: client-side prediction + server reconciliation (input seq / ack).
 *  - Other players: interpolated between server snapshots, INTERP_MS in the past.
 *  - Projectiles: extrapolated from the latest snapshot.
 * The server stays authoritative for everything; the client only predicts movement.
 */

const INTERP_MS = 110;
const MAX_PENDING = 120;

// Empty when the page is served by the game server itself; set by the static build otherwise.
const SERVER_URL = document.querySelector('meta[name="game-server"]')?.content || undefined;
const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const view = { width: innerWidth, height: innerHeight, dpr: 1, scale: 1 };
const lobbyMap = buildMap('streets');
const lobbyMapImage = renderMapImage(lobbyMap);

let match = null, map = null, mapImage = null, meId = null;
let snapshots = [];
let pending = [], seq = 0, swapQueued = false, showBoard = false, pickQueued = 0, abilityQueued = false;
let tutorial = null;
const settings = loadStored();
const $ = (s) => document.getElementById(s);
let pred = null, corr = { x: 0, y: 0 }, meWasAlive = false;
let particles = [], seenProjectiles = new Set(), hitFlash = new Map();
let ping = 0, busy = false;

function drawLobbyBattle(now) {
  const t = now / 1000;
  const center = { x: (MAP_W * TILE) / 2, y: (MAP_H * TILE) / 2 };
  const fighters = [
    { i: 'demo-a', n: 'Viper', c: '#c6f432', h: 1, w: 'ar', phase: 0, radius: 185 },
    { i: 'demo-b', n: 'Nova', c: '#ff6b5b', h: 2, w: 'sg', phase: 2.2, radius: 145 },
    { i: 'demo-c', n: 'Ghost', c: '#4ea3ff', h: 3, w: 'pistol', phase: 4.1, radius: 220 },
    { i: 'demo-d', n: 'Hex', c: '#ff9a3c', h: 4, w: 'rpg', phase: 5.3, radius: 105 },
  ];
  const players = fighters.map((p, index) => {
    const a = t * (index % 2 ? -.22 : .18) + p.phase;
    const x = center.x + Math.cos(a) * p.radius;
    const y = center.y + Math.sin(a * 1.35) * p.radius * .58;
    const target = fighters[(index + 1) % fighters.length];
    const ta = t * ((index + 1) % 2 ? -.22 : .18) + target.phase;
    const tx = center.x + Math.cos(ta) * target.radius;
    const ty = center.y + Math.sin(ta * 1.35) * target.radius * .58;
    return { ...p, x, y, a: Math.atan2(ty - y, tx - x), al: true, hp: 62 + index * 9 };
  });
  const projectiles = players.map((p, index) => {
    const target = players[(index + 1) % players.length];
    const progress = (t * (1.2 + index * .08) + index * .23) % 1;
    const x = p.x + (target.x - p.x) * progress;
    const y = p.y + (target.y - p.y) * progress;
    return { i: `demo-shot-${index}`, k: index === 3 ? 'r' : 'b', x, y, vx: (target.x - p.x) * 3, vy: (target.y - p.y) * 3 };
  });
  const camera = {
    x: center.x + Math.sin(t * .11) * 55,
    y: center.y + Math.cos(t * .09) * 35,
  };
  drawFrame(ctx, view, {
    map: lobbyMap,
    mapImage: lobbyMapImage,
    camera,
    players,
    projectiles,
    pickups: lobbyMap.pickups.map((p) => ({ ...p, available: true })),
    particles: [],
    now,
    teams: false,
    meId: '',
    sticks: {},
    touch: false,
  });
}

/* ------------------------------------------------------ input / menus */
function onAction(id) {
  if (id === 'menu') { if (!closeTopModal()) settingsUI.open(); return; }
  if (id === 'mute') {
    settings.audio.mute = !settings.audio.mute;
    persist(settings); applySettings();
    toast(settings.audio.mute ? 'Sound off' : 'Sound on');
    return;
  }
  if (tutorial) { tutorial.action(id); return; }
  if (!match) return;
  if (id === 'swap') swapQueued = true;
  else if (id === 'ability') abilityQueued = true;
  else if (id === 'scoreboard') showBoard = !showBoard;
  else if (/^pick[123]$/.test(id)) pickQueued = Number(id.slice(4));
}
const input = new Input(canvas, settings, onAction);
const settingsUI = initSettingsUI(settings, applySettings);
initHelpDialogs();
initDraft((n) => { pickQueued = n; });

$('bAbility').addEventListener('click', () => { abilityQueued = true; });
$('bSwap').addEventListener('click', () => { swapQueued = true; });
$('bBoard').addEventListener('click', () => { showBoard = !showBoard; });
$('bLeave').addEventListener('click', async () => {
  if (await confirmDialog('Leave this match?', 'Leave', 'Stay')) leaveMatch();
});
for (const id of ['bGear', 'tGear', 'rSettings']) $(id).addEventListener('click', () => settingsUI.open());
const fireBtn = $('bFire');
fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); input.fireHeld = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) fireBtn.addEventListener(ev, () => { input.fireHeld = false; });
$('bTutorial').addEventListener('click', () => startTutorial());
$('bHowTo').addEventListener('click', () => openHowTo(settings.controls.binds, input.touch));
$('bAbout').addEventListener('click', () => openAbout());
$('tSkip').addEventListener('click', () => endTutorial());
$('tLobby').addEventListener('click', () => endTutorial());
$('tQuick').addEventListener('click', () => { endTutorial(); enter('match:quick', { ...lobby.options, visibility: 'public', bots: true }); });
$('tSwap').addEventListener('click', () => tutorial?.action('swap'));
$('tBoard').addEventListener('click', () => tutorial?.action('scoreboard'));

/** Push settings into sound, effects, HUD and touch layout. Called on load and after every change. */
function applySettings() {
  setVolumes(settings.audio);
  setShakeEnabled(settings.graphics.shake);
  document.documentElement.style.setProperty('--ui-scale', settings.gameplay.uiScale / 100);
  $('fps').hidden = !settings.graphics.fps;
  $('ping').hidden = !settings.graphics.ping;
  $('bFire').hidden = !(input.touch && !settings.gameplay.autoFire);
  renderHelp(settings.controls.binds);
  // Touch layout: place the on-screen buttons where the player put them.
  for (const id of ['bSwap', 'bAbility', 'bFire']) {
    const el = $(id), l = settings.controls.layout[id];
    if (!input.touch) { el.style.cssText = ''; continue; }
    Object.assign(el.style, { position: 'fixed', left: `${l.x * 100}%`, top: `${l.y * 100}%`, right: 'auto', bottom: 'auto', transform: `translate(-50%,-50%) scale(${l.s})` });
  }
}

/* ------------------------------------------------------------ tutorial */
function startTutorial() {
  if (match) return;
  tutorial = new Tutorial({ settings, touch: input.touch, onFinish: endTutorial });
  map = tutorial.map;
  mapImage = renderMapImage(map);
  particles = [];
  input.reset();
  $('tut').hidden = false;
  $('lobby').hidden = true;
  document.body.classList.remove('lobby-open');
  startMusic();
}

function endTutorial() {
  if (!tutorial) return;
  tutorial = null;
  input.reset();
  $('tut').hidden = true;
  showLobby(true);
  stopMusic();
}

/* ------------------------------------------- loading screen / welcome */
let everConnected = false;
const loadCard = document.querySelector('.load-card');
function hideLoading() {
  $('loading').hidden = true;
  if (!settings.seen.welcome) openModal($('welcome'));
}
function showOffline() {
  if (everConnected) return;
  loadCard.classList.add('offline');
  $('loadMsg').textContent = 'The game server is offline or unreachable. Check your connection, or try again in a minute.';
  $('loadRetry').hidden = false;
  $('loadTutorial').hidden = false;
}
$('loadRetry').addEventListener('click', () => {
  loadCard.classList.remove('offline');
  $('loadMsg').textContent = 'Connecting to the game server…';
  $('loadRetry').hidden = true;
  socket.connect();
});
$('loadTutorial').addEventListener('click', () => { hideLoading(); closeModal($('welcome')); startTutorial(); });
const offlineTimer = setTimeout(showOffline, 8000);
// Either choice (or Esc) counts: the welcome card never shows again.
$('welcome').addEventListener('closed', () => { settings.seen.welcome = true; persist(settings); });
$('welStart').addEventListener('click', () => { closeModal($('welcome')); startTutorial(); });
$('welSkip').addEventListener('click', () => closeModal($('welcome')));
applySettings();

/* ------------------------------------------------------------ network */
function request(event, payload, timeout = 6000) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: 'Not connected to the server.' });
    const timer = setTimeout(() => resolve({ ok: false, error: 'The server did not respond.' }), timeout);
    socket.emit(event, payload, (res) => { clearTimeout(timer); resolve(res || { ok: false, error: 'Bad response.' }); });
  });
}

socket.on('connect', async () => {
  clearTimeout(offlineTimer);
  if (!everConnected) { everConnected = true; hideLoading(); }
  setNetStatus('Online', true);
  await request('profile:set', profile);
  const res = await request('lobby:list');
  if (res.ok) renderMatchList(res.matches);
});
socket.on('disconnect', () => {
  setNetStatus('Reconnecting…', false);
  renderMatchList(null);
  if (match) { exitToLobby(); toast('Connection lost'); }
});
socket.on('connect_error', () => { setNetStatus('Server offline', false); showOffline(); });
socket.on('lobby:update', (d) => {
  renderMatchList(d.matches);
  setNetStatus(`Online · ${d.online} connected`, true);
});
socket.on('state', (d) => {
  if (!match) return;
  snapshots.push({ recv: performance.now(), d });
  if (snapshots.length > 40) snapshots.shift();
  reconcile(d);
});
socket.on('event', handleEvent);

setInterval(() => {
  if (!socket.connected) return;
  const t0 = performance.now();
  socket.emit('latency', () => { ping = Math.round(performance.now() - t0); });
}, 3000);

/* -------------------------------------------------------------- lobby */
async function enter(event, payload) {
  if (busy) return;
  busy = true;
  setLobbyError('');
  await request('profile:set', profile);
  const res = await request(event, payload);
  busy = false;
  if (!res.ok) { setLobbyError(res.error); toast(res.error); return; }
  enterMatch(res);
}

const lobby = initLobby({
  onProfile: () => { if (socket.connected) socket.emit('profile:set', profile, () => {}); },
  onQuick: () => enter('match:quick', { ...lobby.options, visibility: 'public', bots: true }),
  onCreate: (o) => enter('match:create', o),
  onPractice: (o) => enter('match:practice', o),
  onJoin: (code) => {
    if (!/^[a-z0-9]{5}$/.test(code)) { setLobbyError('Codes are 5 letters or numbers.'); return; }
    enter('match:join', { code });
  },
});

function enterMatch(info) {
  match = info;
  meId = info.you;
  map = buildMap(info.map);
  mapImage = renderMapImage(map);
  snapshots = []; pending = []; particles = []; seenProjectiles = new Set(); hitFlash = new Map();
  pred = null; corr = { x: 0, y: 0 }; meWasAlive = false; showBoard = false; swapQueued = false; pickQueued = 0; abilityQueued = false;
  floaters.length = 0;
  input.reset();
  input.active = true;
  clearFeed();
  setMatchInfo(info);
  showLobby(false);
  applySettings();
  startMusic();
  addFeed(info.practice ? 'Practice started' : `Joined match ${info.code}`);
}

function exitToLobby() {
  match = null;
  input.active = false;
  input.reset();
  showLobby(true);
  stopMusic();
}

async function leaveMatch() {
  exitToLobby();
  await request('match:leave');
  const res = await request('lobby:list');
  if (res.ok) renderMatchList(res.matches);
}

/* ------------------------------------------------- prediction / sync */
function latest() { return snapshots.length ? snapshots[snapshots.length - 1].d : null; }
/** Same speed rule as the server: base speed times the player's Swift multiplier. */
const mySpeed = (d) => PLAYER_SPEED * ((d && d.me && d.me.spd) || 1);

function reconcile(d) {
  const me = d.pl.find((p) => p.i === meId);
  if (!me) return;
  const shown = pred ? { x: pred.x + corr.x, y: pred.y + corr.y } : null;
  pending = pending.filter((i) => i.seq > d.ack);
  pred = { x: me.x, y: me.y };
  const canMove = me.al && !me.dn && d.round.s === 'playing';
  if (canMove) for (const i of pending) moveEntity(map, pred, i.mx, i.my, INPUT_DT, mySpeed(d), PLAYER_RADIUS);
  else pending = [];
  // Hide small corrections by blending them out over a few frames.
  if (shown && meWasAlive && me.al) {
    corr = { x: shown.x - pred.x, y: shown.y - pred.y };
    if (Math.hypot(corr.x, corr.y) > 120) corr = { x: 0, y: 0 };
  } else corr = { x: 0, y: 0 };
  meWasAlive = !!me.al;
}

let inputAcc = 0;
function sendInputs(dt) {
  inputAcc = Math.min(inputAcc + dt, 0.25);
  const d = latest();
  const me = d && d.pl.find((p) => p.i === meId);
  const canMove = me && me.al && !me.dn && d.round.s === 'playing';
  while (inputAcc >= INPUT_DT) {
    inputAcc -= INPUT_DT;
    const s = input.sample(view.scale);
    const pkt = { seq: ++seq, mx: s.mx, my: s.my, aim: s.aim, fire: s.fire, aimDist: s.aimDist, swap: swapQueued, pick: pickQueued, ability: abilityQueued };
    swapQueued = false; pickQueued = 0; abilityQueued = false;
    socket.emit('input', pkt);
    if (canMove && pred) {
      moveEntity(map, pred, pkt.mx, pkt.my, INPUT_DT, mySpeed(d), PLAYER_RADIUS);
      pending.push(pkt);
      if (pending.length > MAX_PENDING) pending.shift();
    }
  }
}

/** Positions of other players, INTERP_MS in the past. */
function interpolatedPlayers(now) {
  if (!snapshots.length) return [];
  const rt = now - INTERP_MS;
  let a = snapshots[0], b = snapshots[snapshots.length - 1];
  for (let i = snapshots.length - 1; i > 0; i--) {
    if (snapshots[i - 1].recv <= rt) { a = snapshots[i - 1]; b = snapshots[i]; break; }
  }
  const span = b.recv - a.recv;
  const k = span > 0 ? Math.max(0, Math.min(1, (rt - a.recv) / span)) : 1;
  const prev = new Map(a.d.pl.map((p) => [p.i, p]));
  return b.d.pl.map((p) => {
    const q = prev.get(p.i);
    if (!q || !q.al || Math.hypot(p.x - q.x, p.y - q.y) > 150) return { ...p };
    return { ...p, x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k };
  });
}

/* ------------------------------------------------------------- events */
/** Particle budget from the Graphics → Quality setting. */
const fxCount = (n) => Math.max(1, Math.round(n * QUALITY[settings.graphics.quality]));

function burst(x, y, r) {
  for (let i = 0, n = fxCount(22); i < n; i++) {
    const a = Math.random() * 7, s = 60 + Math.random() * 260;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, r: 6 + Math.random() * 10, col: ['#ffb347', '#ff6a2b', '#ffe27a', '#555'][i % 4] });
  }
  particles.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, r, ring: true });
}

/** Distance from my fighter, for scaling shake by how close something happened. */
function distToMe(x, y) {
  const me = latest()?.pl.find((p) => p.i === meId);
  return me ? Math.hypot(me.x - x, me.y - y) : Infinity;
}

function handleEvent(e) {
  if (!match || !e) return;
  switch (e.type) {
    case 'explosion': {
      burst(e.x, e.y, e.r);
      const d = distToMe(e.x, e.y);
      if (d < 700) { shake(0.6 * (1 - d / 700) + 0.1); sfx.boom(); }
      break;
    }
    case 'hit':
      hitFlash.set(e.targetId, performance.now());
      if (e.x !== undefined) addFloater(e.x, e.y, e.blocked ? 'blocked' : String(e.dmg), e.targetId === meId ? '#ff5a4e' : '#fff');
      if (e.attackerId === meId && e.targetId !== meId) { flashHitmarker(); sfx.hit(); }
      if (e.targetId === meId && e.attackerId !== meId && !e.blocked) { hurtFlash(); sfx.hurt(); shake(0.2); }
      break;
    case 'kill':
      addFeed(e.self ? `${e.victimName} blew themselves up` : `${e.killerName} ▸ ${e.victimName}`);
      if (e.killerId === meId && !e.self) { killConfirm(`✕ ${e.victimName}  +XP`); sfx.kill(); }
      break;
    case 'downed': addFeed(`${e.victimName} is down`); break;
    case 'revived': addFeed(`${e.byName} revived ${e.name}`); if (e.playerId === meId) toast('Revived!'); break;
    case 'levelUp': if (e.playerId === meId) { sfx.level(); toast(`Level ${e.level}! Pick a skill (1/2/3)`); } break;
    case 'skill': break;
    case 'ability': if (e.playerId === meId) sfx.ability(); break;
    case 'crate': burst(e.x, e.y, 30); break;
    case 'loot': if (e.playerId === meId) { sfx.pickup(); toast({ weapon: 'Weapon', orb: 'XP orb', health: '+Health', armor: '+Armor' }[e.kind] || 'Loot'); } break;
    case 'waveStart': addFeed(`Wave ${e.number} · ${e.bots} bots`); toast(`Wave ${e.number}`); break;
    case 'waveClear': addFeed(`Wave ${e.number} cleared`); break;
    case 'pickup': if (e.playerId === meId) { sfx.pickup(); toast('Picked up a weapon · Q / Swap to switch'); } break;
    case 'join': if (e.id !== meId) addFeed(`${e.name} joined`); break;
    case 'leave': addFeed(`${e.name} left`); break;
    case 'roundEnd': addFeed(`Round over · ${e.winner}`); if (e.waves !== undefined) recordWaves(e.waves); break;
    case 'roundStart': addFeed(`Round ${e.number} · go!`); pending = []; break;
    default: break;
  }
}

/* --------------------------------------------------------------- loop */
function resize() {
  view.dpr = Math.min(devicePixelRatio || 1, 2);
  view.width = innerWidth; view.height = innerHeight;
  canvas.width = innerWidth * view.dpr; canvas.height = innerHeight * view.dpr;
  view.scale = Math.max(0.55, Math.min(1.3, Math.min(innerWidth, innerHeight) / 560));
}
addEventListener('resize', resize);
resize();

let last = performance.now(), hudAt = 0, fpsFrames = 0, fpsAt = 0;
/** Display options shared by the match and tutorial scenes. */
const displayOptions = () => ({
  teamColors: settings.gameplay.colorblind ? COLORBLIND_TEAM_COLORS : TEAM_COLORS,
  hideNames: settings.gameplay.hideNames,
  stickLayout: settings.controls.joystick === 'fixed' ? settings.controls.layout : null,
  sticks: input.sticks, touch: input.touch,
});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Menus pause only my own input; the match keeps running for everyone else.
  input.active = (!!match || !!tutorial) && !anyModalOpen();
  fpsFrames++;
  if (now - fpsAt > 500) { $('fps').textContent = `${Math.round((fpsFrames * 1000) / (now - fpsAt))} FPS`; fpsFrames = 0; fpsAt = now; }

  if (tutorial) {
    tutorial.update(dt, input.sample(view.scale));
    drawFrame(ctx, view, { ...tutorial.scene(now), mapImage, ...displayOptions() });
    if (now - hudAt > 100) { hudAt = now; tutorial.renderCard(document.querySelector('#tut')); }
    return;
  }
  if (!match) {
    drawLobbyBattle(now);
    lobby.drawPreview(now);
    return;
  }

  sendInputs(dt);
  const d = latest();
  if (!d) return;

  const decay = Math.exp(-dt * 12);
  corr.x *= decay; corr.y *= decay;

  const players = interpolatedPlayers(now);
  const meSnap = d.pl.find((p) => p.i === meId);
  for (const p of players) {
    const f = hitFlash.get(p.i);
    p.flash = f && now - f < 120 ? 1 : 0;
    if (p.i === meId && meSnap) {
      Object.assign(p, meSnap, { flash: p.flash });
      if (pred && meSnap.al) { p.x = pred.x + corr.x; p.y = pred.y + corr.y; }
      p.a = input.aim;
    }
  }
  const camera = players.find((p) => p.i === meId) || { x: (MAP_W * TILE) / 2, y: (MAP_H * TILE) / 2 };

  const snapAge = (now - snapshots[snapshots.length - 1].recv) / 1000;
  const projectiles = [];
  for (const p of d.pr) {
    const x = p.x + p.vx * snapAge, y = p.y + p.vy * snapAge;
    if (p.k !== 'g' && isSolidPoint(map, x, y)) continue;
    if (!seenProjectiles.has(p.i)) {
      seenProjectiles.add(p.i);
      const mine = p.o === meId;
      if (settings.graphics.quality !== 'low' || mine) particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: mine ? 0.08 : 0.06, max: 0.08, r: p.k === 'r' ? 14 : mine ? 11 : 7, col: '#ffe27a' });
      if (mine && p.k !== 'g') { sfx.shoot(); shake(p.k === 'r' ? 0.3 : 0.04); }
    }
    projectiles.push({ ...p, x, y });
  }
  if (seenProjectiles.size > 2000) seenProjectiles = new Set(d.pr.map((p) => p.i));

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);

  updateFloaters(dt);
  const pickups = map.pickups.map((p, i) => ({ ...p, available: d.pk[i] === '1' }));
  const crates = map.crates.map((c, i) => ({ ...c, alive: d.cr && d.cr[i] === '1' }));
  drawFrame(ctx, view, {
    map, mapImage, camera, players, projectiles, pickups, particles, now,
    crates, loot: d.lo || [], turrets: d.tu || [], floaters, shake: shakeOffset(dt),
    teams: match.mode !== 'dm', meId, ...displayOptions(),
  });

  if (now - hudAt > 100) {
    hudAt = now;
    updateHud({ snap: d, me: meSnap, meId, match, showBoard, ping, priv: d.me });
    pruneFeed();
  }
}
requestAnimationFrame(frame);
