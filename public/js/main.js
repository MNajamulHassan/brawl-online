/* global io */
import { INPUT_DT, PLAYER_SPEED, PLAYER_RADIUS, TILE, MAP_W, MAP_H } from '/shared/constants.js';
import { buildMap } from '/shared/maps.js';
import { moveEntity, isSolidPoint } from '/shared/physics.js';
import { Input } from './input.js';
import { renderMapImage, drawFrame } from './renderer.js';
import {
  profile, initLobby, setNetStatus, setLobbyError, renderMatchList, showLobby, toast,
  addFeed, pruneFeed, clearFeed, flashHitmarker, setMatchInfo, updateHud,
} from './ui.js';

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
let pending = [], seq = 0, swapQueued = false, showBoard = false;
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

const input = new Input(canvas, {
  onSwap: () => { if (match) swapQueued = true; },
  onToggleBoard: () => { showBoard = !showBoard; },
});
document.getElementById('bSwap').addEventListener('click', () => { swapQueued = true; });
document.getElementById('bBoard').addEventListener('click', () => { showBoard = !showBoard; });
document.getElementById('bLeave').addEventListener('click', () => leaveMatch());

/* ------------------------------------------------------------ network */
function request(event, payload, timeout = 6000) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: 'Not connected to the server.' });
    const timer = setTimeout(() => resolve({ ok: false, error: 'The server did not respond.' }), timeout);
    socket.emit(event, payload, (res) => { clearTimeout(timer); resolve(res || { ok: false, error: 'Bad response.' }); });
  });
}

socket.on('connect', async () => {
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
socket.on('connect_error', () => setNetStatus('Server offline', false));
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
  pred = null; corr = { x: 0, y: 0 }; meWasAlive = false; showBoard = false; swapQueued = false;
  input.reset();
  input.active = true;
  clearFeed();
  setMatchInfo(info);
  showLobby(false);
  addFeed(info.practice ? 'Practice started' : `Joined match ${info.code}`);
}

function exitToLobby() {
  match = null;
  input.active = false;
  input.reset();
  showLobby(true);
}

async function leaveMatch() {
  exitToLobby();
  await request('match:leave');
  const res = await request('lobby:list');
  if (res.ok) renderMatchList(res.matches);
}

/* ------------------------------------------------- prediction / sync */
function latest() { return snapshots.length ? snapshots[snapshots.length - 1].d : null; }

function reconcile(d) {
  const me = d.pl.find((p) => p.i === meId);
  if (!me) return;
  const shown = pred ? { x: pred.x + corr.x, y: pred.y + corr.y } : null;
  pending = pending.filter((i) => i.seq > d.ack);
  pred = { x: me.x, y: me.y };
  const canMove = me.al && d.round.s === 'playing';
  if (canMove) for (const i of pending) moveEntity(map, pred, i.mx, i.my, INPUT_DT, PLAYER_SPEED, PLAYER_RADIUS);
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
  const canMove = me && me.al && d.round.s === 'playing';
  while (inputAcc >= INPUT_DT) {
    inputAcc -= INPUT_DT;
    const s = input.sample(view.scale);
    const pkt = { seq: ++seq, mx: s.mx, my: s.my, aim: s.aim, fire: s.fire, aimDist: s.aimDist, swap: swapQueued };
    swapQueued = false;
    socket.emit('input', pkt);
    if (canMove && pred) {
      moveEntity(map, pred, pkt.mx, pkt.my, INPUT_DT, PLAYER_SPEED, PLAYER_RADIUS);
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
function burst(x, y, r) {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * 7, s = 60 + Math.random() * 260;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, r: 6 + Math.random() * 10, col: ['#ffb347', '#ff6a2b', '#ffe27a', '#555'][i % 4] });
  }
  particles.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, r, ring: true });
}

function handleEvent(e) {
  if (!match || !e) return;
  switch (e.type) {
    case 'explosion': burst(e.x, e.y, e.r); break;
    case 'hit':
      hitFlash.set(e.targetId, performance.now());
      if (e.attackerId === meId && e.targetId !== meId) flashHitmarker();
      break;
    case 'kill':
      addFeed(e.self ? `${e.victimName} blew themselves up` : `${e.killerName} ▸ ${e.victimName}`);
      if (e.killerId === meId && !e.self) toast(`You eliminated ${e.victimName}`);
      break;
    case 'pickup': if (e.playerId === meId) toast('Picked up a weapon · Q / Swap to switch'); break;
    case 'join': if (e.id !== meId) addFeed(`${e.name} joined`); break;
    case 'leave': addFeed(`${e.name} left`); break;
    case 'roundEnd': addFeed(`Round over · ${e.winner}`); break;
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

let last = performance.now(), hudAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
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
      particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.06, max: 0.06, r: p.k === 'r' ? 12 : 7, col: '#ffe27a' });
    }
    projectiles.push({ ...p, x, y });
  }
  if (seenProjectiles.size > 2000) seenProjectiles = new Set(d.pr.map((p) => p.i));

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);

  const pickups = map.pickups.map((p, i) => ({ ...p, available: d.pk[i] === '1' }));
  drawFrame(ctx, view, {
    map, mapImage, camera, players, projectiles, pickups, particles, now,
    teams: match.mode === 'tdm', meId, sticks: input.sticks, touch: input.touch,
  });

  if (now - hudAt > 100) {
    hudAt = now;
    updateHud({ snap: d, me: meSnap, meId, match, showBoard, ping });
    pruneFeed();
  }
}
requestAnimationFrame(frame);
