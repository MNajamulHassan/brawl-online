/**
 * Game-feel effects: synthesised sounds (no audio files to download),
 * screen shake and floating damage numbers. Presentation only.
 */
let ac = null, master = null, effects = null, music = null;
let vol = { master: 0.8, effects: 1, music: 0.4, mute: false };

/** Lazily create the audio graph: sounds → effects ┐
 *                                   music  → music ┴→ master → speakers */
function audio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); effects = ac.createGain(); music = ac.createGain();
      effects.connect(master); music.connect(master); master.connect(ac.destination);
      applyVolumes();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  } catch { return null; }
}

function applyVolumes() {
  if (!ac) return;
  master.gain.value = vol.mute ? 0 : vol.master;
  effects.gain.value = vol.effects;
  music.gain.value = vol.music * 0.5;
}

/** settings.audio: { master, effects, music (0..1), mute } */
export function setVolumes(audioSettings) {
  vol = { ...audioSettings };
  applyVolumes();
}

/** One short tone: freq slides from f0 to f1 over `dur` seconds. */
function tone(f0, f1, dur, type = 'square', level = 0.06, out = 'fx') {
  if (vol0()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out === 'music' ? music : effects);
  o.start(t); o.stop(t + dur);
}
const vol0 = () => vol.mute || vol.master === 0;

function noise(dur, level = 0.12) {
  if (vol0()) return;
  const a = audio();
  if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const s = a.createBufferSource(), g = a.createGain();
  s.buffer = buf; g.gain.value = level;
  s.connect(g).connect(effects);
  s.start();
}

export const sfx = {
  shoot: () => tone(520, 180, 0.06, 'square', 0.025),
  hit: () => tone(1300, 900, 0.05, 'triangle', 0.08),
  kill: () => { tone(660, 660, 0.08, 'triangle', 0.09); setTimeout(() => tone(990, 990, 0.14, 'triangle', 0.09), 80); },
  hurt: () => tone(200, 90, 0.12, 'sawtooth', 0.05),
  boom: () => { noise(0.45, 0.18); tone(120, 40, 0.35, 'sine', 0.15); },
  level: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, f, 0.12, 'triangle', 0.07), i * 90)),
  pickup: () => tone(700, 1200, 0.1, 'sine', 0.06),
  ability: () => tone(300, 900, 0.15, 'sine', 0.07),
};

/* Background music: a short synthesised bass + arpeggio loop, played only during matches. */
const BASS = [55, 55, 65.4, 49];
const ARP = [220, 261.6, 329.6, 261.6, 196, 246.9, 293.7, 246.9];
let musicTimer = 0, step = 0;
export function startMusic() {
  if (musicTimer) return;
  musicTimer = setInterval(() => {
    if (vol0() || vol.music === 0) return;
    if (step % 4 === 0) tone(BASS[(step / 4) % BASS.length], BASS[(step / 4) % BASS.length], 0.9, 'triangle', 0.12, 'music');
    tone(ARP[step % ARP.length], ARP[step % ARP.length], 0.18, 'sine', 0.035, 'music');
    step++;
  }, 250);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = 0; }

/* Screen shake: trauma decays over time; offset grows with trauma squared. */
let trauma = 0, shakeOn = true;
export function setShakeEnabled(on) { shakeOn = !!on; if (!on) trauma = 0; }
export function shake(amount) { if (shakeOn) trauma = Math.min(1, trauma + amount); }
export function shakeOffset(dt) {
  trauma = Math.max(0, trauma - dt * 1.8);
  const m = trauma * trauma * 14;
  return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
}

/* Floating damage numbers, in world coordinates. */
export const floaters = [];
export function addFloater(x, y, text, color = '#fff') {
  floaters.push({ x: x + (Math.random() - 0.5) * 16, y: y - 20, text, color, life: 0.8 });
  if (floaters.length > 60) floaters.shift();
}
export function updateFloaters(dt) {
  for (const f of floaters) { f.y -= 40 * dt; f.life -= dt; }
  while (floaters.length && floaters[0].life <= 0) floaters.shift();
}
