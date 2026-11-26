import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * True when the Authorization header carries the admin bearer token.
 * An empty configured token always fails, so the admin API is off by default.
 * Both sides are hashed first so the comparison is constant-time whatever the lengths.
 */
export function isAdmin(authHeader, token) {
  if (!token) return false;
  const m = /^Bearer (.+)$/.exec(typeof authHeader === 'string' ? authHeader : '');
  if (!m) return false;
  const sha = (v) => createHash('sha256').update(v).digest();
  return timingSafeEqual(sha(m[1]), sha(token));
}
