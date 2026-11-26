import { COLORS, HATS, MAX_NAME_LENGTH, MODES, MAPS, ROOM_CODE_LENGTH, ROOM_CODE_ALPHABET } from '../../shared/constants.js';

/**
 * Every value arriving from a client is untrusted. These functions turn raw
 * socket payloads into safe, typed values, or null when the payload is invalid.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export function sanitizeName(raw) {
  if (typeof raw !== 'string') return 'Player';
  const clean = raw.normalize('NFKC').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return clean || 'Player';
}

export function sanitizeProfile(raw) {
  const p = isObj(raw) ? raw : {};
  return {
    name: sanitizeName(p.name),
    color: COLORS.includes(p.color) ? p.color : COLORS[0],
    hat: Number.isInteger(p.hat) && p.hat >= 0 && p.hat < HATS.length ? p.hat : 0,
  };
}

export function parseRoomCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase();
  return CODE_RE.test(code) ? code : null;
}

export function parseCreateOptions(raw) {
  const o = isObj(raw) ? raw : {};
  return {
    mode: Object.hasOwn(MODES, o.mode) ? o.mode : 'dm',
    map: Object.hasOwn(MAPS, o.map) ? o.map : 'field',
    visibility: o.visibility === 'private' ? 'private' : 'public',
    bots: o.bots === true,
  };
}

/**
 * Player input packet.
 *   seq: increasing integer   mx,my: move vector (-1..1)   aim: radians
 *   aimDist: px (grenade throw distance)   fire, swap, ability: booleans
 *   pick: 1..3 chooses a card from the skill draft (0 = no pick)
 */
export function parseInput(raw, lastSeq = 0) {
  if (!isObj(raw)) return null;
  const { seq, mx, my, aim, aimDist } = raw;
  if (!Number.isInteger(seq) || seq <= lastSeq || seq > 2 ** 31) return null;
  if (!finite(mx) || !finite(my) || !finite(aim)) return null;
  let x = Math.max(-1, Math.min(1, mx));
  let y = Math.max(-1, Math.min(1, my));
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return {
    seq,
    mx: x,
    my: y,
    aim: Math.atan2(Math.sin(aim), Math.cos(aim)),
    aimDist: finite(aimDist) ? Math.max(0, Math.min(400, aimDist)) : 300,
    fire: raw.fire === true,
    swap: raw.swap === true,
    ability: raw.ability === true,
    pick: Number.isInteger(raw.pick) && raw.pick >= 1 && raw.pick <= 3 ? raw.pick : 0,
  };
}
