import { TILE, MAP_W, MAP_H, PLAYER_RADIUS, WEAPONS, TEAM_COLORS } from '/shared/constants.js';

/** All canvas drawing. Pure presentation: reads state, never changes it. */

const rng = (s) => () => {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s) => { let h = 7; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** Draw the static map once into an offscreen canvas. */
export function renderMapImage(map) {
  const c = document.createElement('canvas');
  c.width = MAP_W * TILE; c.height = MAP_H * TILE;
  const x = c.getContext('2d'), r = rng(11), g = map.grid;
  const isB = (tx, ty) => tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && g[ty][tx] === 'B';

  if (map.key === 'field') {
    x.fillStyle = '#5b8c3a'; x.fillRect(0, 0, c.width, c.height);
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) if ((tx + ty) % 2) { x.fillStyle = '#629440'; x.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
    for (let i = 0; i < 500; i++) {
      const flower = r() < 0.08;
      x.fillStyle = flower ? ['#f6e27a', '#fff', '#f59ab8'][i % 3] : 'rgba(30,70,20,.35)';
      x.fillRect(r() * c.width, r() * c.height, flower ? 4 : 2, flower ? 4 : 6);
    }
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const t = g[ty][tx], X = tx * TILE, Y = ty * TILE;
      x.fillStyle = 'rgba(0,0,0,.25)';
      if (t === '#') x.fillRect(X + 6, Y + 8, TILE, TILE);
      if (t === 'o') { x.beginPath(); x.ellipse(X + 28, Y + 30, 22, 20, 0, 0, 7); x.fill(); }
    }
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
      const t = g[ty][tx], X = tx * TILE, Y = ty * TILE;
      if (t === '#') {
        x.fillStyle = '#2c5a20'; x.fillRect(X, Y, TILE, TILE);
        for (let k = 0; k < 4; k++) { x.fillStyle = k % 2 ? '#3c7a2b' : '#357026'; x.beginPath(); x.arc(X + 12 + (k % 2) * 24, Y + 12 + (k >> 1) * 24, 14, 0, 7); x.fill(); }
        x.fillStyle = 'rgba(180,230,120,.25)'; x.beginPath(); x.arc(X + 10, Y + 9, 5, 0, 7); x.fill();
      }
      if (t === 'o') {
        x.fillStyle = '#7d8580'; x.beginPath(); x.ellipse(X + 24, Y + 24, 23, 21, 0, 0, 7); x.fill();
        x.fillStyle = '#9aa39d'; x.beginPath(); x.ellipse(X + 19, Y + 18, 13, 10, 0, 0, 7); x.fill();
      }
    }
    return c;
  }

  x.fillStyle = '#383b40'; x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.05})`; x.fillRect(r() * c.width, r() * c.height, 2, 2); }
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (g[ty][tx] === 'B') continue;
    const X = tx * TILE, Y = ty * TILE;
    if (isB(tx - 1, ty) || isB(tx + 1, ty) || isB(tx, ty - 1) || isB(tx, ty + 1)) {
      x.fillStyle = '#868b91'; x.fillRect(X, Y, TILE, TILE);
      x.strokeStyle = '#767b80'; x.lineWidth = 1; x.strokeRect(X + 0.5, Y + 0.5, TILE - 1, TILE - 1);
    } else if ((tx + ty) % 3 === 0) { x.fillStyle = '#d9d27a'; x.fillRect(X + TILE / 2 - 2, Y + TILE / 2 - 8, 4, 16); }
  }
  // label each building block so it gets one roof colour
  const lab = new Int16Array(MAP_W * MAP_H).fill(-1); let n = 0;
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (!isB(tx, ty) || lab[ty * MAP_W + tx] >= 0) continue;
    const st = [[tx, ty]]; lab[ty * MAP_W + tx] = n;
    while (st.length) {
      const [a, b] = st.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = a + dx, v = b + dy; if (isB(u, v) && lab[v * MAP_W + u] < 0) { lab[v * MAP_W + u] = n; st.push([u, v]); } }
    }
    n++;
  }
  const roofs = ['#a5523f', '#3f7f86', '#c9a25a', '#6f5a8c', '#5d7b46', '#8c6a4f'];
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) if (isB(tx, ty)) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(tx * TILE + 10, ty * TILE + 12, TILE, TILE); }
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (!isB(tx, ty)) continue;
    const X = tx * TILE, Y = ty * TILE;
    x.fillStyle = roofs[lab[ty * MAP_W + tx] % roofs.length]; x.fillRect(X, Y, TILE, TILE);
    x.fillStyle = 'rgba(255,255,255,.07)'; if ((tx + ty) % 2) x.fillRect(X, Y, TILE, TILE);
    x.fillStyle = 'rgba(0,0,0,.3)'; if (!isB(tx, ty + 1)) x.fillRect(X, Y + TILE - 5, TILE, 5); if (!isB(tx + 1, ty)) x.fillRect(X + TILE - 5, Y, 5, TILE);
    x.fillStyle = 'rgba(255,255,255,.18)'; if (!isB(tx, ty - 1)) x.fillRect(X, Y, TILE, 4); if (!isB(tx - 1, ty)) x.fillRect(X, Y, 4, TILE);
    if (hash(tx * 99 + ty) % 7 === 0) { x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(X + 14, Y + 14, 18, 18); }
  }
  const carColors = ['#d64541', '#2f80ed', '#f2c94c', '#eeeeee', '#27ae60'];
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (g[ty][tx] !== 'c') continue;
    x.save(); x.translate(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    if (hash(`${tx}c${ty}`) % 2) x.rotate(Math.PI / 2);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(-20, -11, 46, 28);
    x.fillStyle = carColors[hash(tx * 7 + ty) % carColors.length]; x.beginPath(); x.roundRect(-23, -14, 46, 28, 7); x.fill();
    x.fillStyle = '#1d2a33'; x.fillRect(-12, -11, 9, 22); x.fillRect(8, -11, 7, 22);
    x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(-2, -11, 9, 22);
    x.restore();
  }
  return c;
}

/** Top-down fighter: body, hands, gun, hat. */
export function drawCharacter(c, x, y, angle, color, hat, weapon, opts = {}) {
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(3, 6, 18, 15, 0, 0, 7); c.fill();
  if (opts.ring) { c.strokeStyle = opts.ring; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 22, 0, 7); c.stroke(); }
  c.rotate(angle);
  const len = (WEAPONS[weapon] || WEAPONS.pistol).len;
  if (weapon === 'nade') { c.fillStyle = '#4f8a36'; c.beginPath(); c.arc(17, 7, 6, 0, 7); c.fill(); }
  else {
    const rpg = weapon === 'rpg';
    c.fillStyle = rpg ? '#3d4a36' : '#1f2224'; c.fillRect(10, rpg ? 1 : 3, len, rpg ? 10 : 6);
    if (rpg) { c.fillStyle = '#ff5a4e'; c.fillRect(10 + len - 5, 0, 6, 12); }
  }
  c.fillStyle = color; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2;
  for (const [hx, hy] of [[14, 8], [9, -9]]) { c.beginPath(); c.arc(hx, hy, 5, 0, 7); c.fill(); c.stroke(); }
  c.lineWidth = 3; c.beginPath(); c.arc(0, 0, PLAYER_RADIUS, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(-4, -5, 7, 0, 7); c.fill();
  if (hat === 1) { c.fillStyle = '#1d1d1d'; c.beginPath(); c.arc(-1, 0, 12, 0, 7); c.fill(); c.fillRect(6, -9, 10, 18); }
  else if (hat === 2) { c.strokeStyle = '#e8413a'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(-11, 0); c.lineTo(-22, -5); c.moveTo(-11, 2); c.lineTo(-22, 6); c.stroke(); }
  else if (hat === 3) { c.fillStyle = '#efe6d0'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-2, s * 10); c.lineTo(6, s * 10); c.lineTo(0, s * 22); c.closePath(); c.fill(); } }
  else if (hat === 4) { c.fillStyle = '#ffd23f'; c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 5 : 11, a = (i * Math.PI) / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); }
  if (hat !== 1 && hat !== 4) {
    c.fillStyle = '#fff'; c.beginPath(); c.arc(9, -5, 3.2, 0, 7); c.arc(9, 5, 3.2, 0, 7); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(10.5, -5, 1.6, 0, 7); c.arc(10.5, 5, 1.6, 0, 7); c.fill();
  }
  if (opts.flash > 0) { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(0, 0, PLAYER_RADIUS + 1, 0, 7); c.fill(); }
  c.restore();
}

/** Draw one frame. `view` holds the already-interpolated positions. */
export function drawFrame(ctx, view, scene) {
  const { width: W, height: H, dpr, scale } = view;
  const { map, mapImage, camera, players, projectiles, pickups, particles, teams, meId, sticks, touch, now } = scene;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = map.key === 'field' ? '#1d3415' : '#1c1e22';
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (W / 2 - camera.x * scale), dpr * (H / 2 - camera.y * scale));
  ctx.drawImage(mapImage, 0, 0);

  pickups.forEach((p, i) => {
    const w = WEAPONS[p.weapon];
    if (p.available) {
      const bob = Math.sin(now / 250 + i) * 3;
      ctx.fillStyle = w.color + '55'; ctx.beginPath(); ctx.arc(p.x, p.y, 20 + bob, 0, 7); ctx.fill();
      ctx.fillStyle = w.color; ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, 7); ctx.fill();
      ctx.fillStyle = '#14200c'; ctx.font = '700 10px Rubik,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(w.tag, p.x, p.y + 1);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  });

  for (const p of projectiles) {
    if (p.k === 'b') {
      ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018); ctx.lineTo(p.x, p.y); ctx.stroke();
    } else if (p.k === 'r') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(-10, 0, 5 + Math.random() * 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a5a3a'; ctx.fillRect(-8, -4, 16, 8); ctx.fillStyle = '#ff5a4e'; ctx.fillRect(6, -4, 5, 8);
      ctx.restore();
    } else {
      ctx.fillStyle = '#3e6b2a'; ctx.strokeStyle = '#14200c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill(); ctx.stroke();
      if (p.f !== undefined && p.f < 0.4 && Math.floor(now / 80) % 2) { ctx.fillStyle = '#ff5a4e'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill(); }
    }
  }

  for (const p of players) {
    if (!p.al) continue;
    drawCharacter(ctx, p.x, p.y, p.a, p.c, p.h, p.w, { ring: teams ? TEAM_COLORS[p.t] : null, flash: p.flash });
    if (p.i === meId) continue;
    ctx.font = '600 12px Rubik,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(p.n, p.x + 1, p.y - 29);
    ctx.fillStyle = teams ? TEAM_COLORS[p.t] || '#fff' : '#fff'; ctx.fillText(p.n, p.x, p.y - 30);
    if (p.hp < 100) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(p.x - 18, p.y - 26, 36, 5);
      ctx.fillStyle = p.hp > 50 ? '#c6f432' : p.hp > 25 ? '#ffc23a' : '#ff5a4e'; ctx.fillRect(p.x - 18, p.y - 26, (36 * p.hp) / 100, 5);
    }
  }

  for (const p of particles) {
    const k = p.life / p.max;
    if (p.ring) {
      ctx.strokeStyle = `rgba(255,200,120,${k})`; ctx.lineWidth = 6 * k;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.6), 0, 7); ctx.stroke();
    } else {
      ctx.globalAlpha = Math.max(0, k); ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + k * 0.6), 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (touch) {
    for (const [key, s] of Object.entries(sticks)) {
      if (!s) continue;
      const R = s.radius, m = Math.min(1, Math.hypot(s.dx, s.dy) / R), a = Math.atan2(s.dy, s.dx);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.ox, s.oy, R, 0, 7); ctx.stroke();
      if (key === 'aim') { ctx.strokeStyle = 'rgba(255,90,78,.5)'; ctx.beginPath(); ctx.arc(s.ox, s.oy, R * 0.6, 0, 7); ctx.stroke(); }
      ctx.fillStyle = key === 'aim' && m > 0.6 ? 'rgba(255,123,58,.8)' : 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(s.ox + Math.cos(a) * m * R, s.oy + Math.sin(a) * m * R, 24, 0, 7); ctx.fill();
    }
    if (!sticks.move && !sticks.aim) {
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '600 13px Rubik,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Left thumb: move   ·   Right thumb: aim + fire', W / 2, H - 60);
    }
  }
}
