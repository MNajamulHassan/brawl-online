# 04 · API Reference

## HTTP

| Method | Path | Response |
|---|---|---|
| GET | `/` | Game client |
| GET | `/healthz` | `{ "status": "ok", "uptimeSec": 120, "rooms": 2, "players": 5, "bots": 3 }` |
| GET | `/api/matches` | `{ "matches": [MatchSummary] }`, public matches only |
| GET | `/api/balance` | **Admin only.** `{ stats: BalanceSummary, config: { WEAPONS, SKILLS, XP, DRAFT, CRATES, REVIVE, WAVES, ... } }`. Needs `Authorization: Bearer <ADMIN_TOKEN>`; 401 with a wrong token, 404 when `ADMIN_TOKEN` is not set. `Cache-Control: no-store`. |
| GET | `/shared/*.js` | Shared ES modules used by the client |

`MatchSummary = { code, mode: "dm"|"tdm"|"waves", map: "field"|"streets", players, bots, max }`

```jsonc
// BalanceSummary: rates are percentages (1 decimal) or null when there is no data yet
{
  "rounds": 12,
  "weapons": { "ar": { "shots": 840, "damage": 6120, "kills": 41, "pickups": 37, "rounds": 9, "wins": 5, "winRate": 55.6 } },
  "skills":  { "pierce": { "offered": 60, "picked": 31, "damage": 5400, "kills": 22, "rounds": 14, "wins": 9, "pickRate": 51.7, "winRate": 64.3 } }
}
```
Example: `curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/balance`

## Socket.IO, client → server

Requests marked **ack** take a callback and answer `{ ok: true, ... }` or `{ ok: false, error: string }`.

| Event | Payload | Ack response | Notes |
|---|---|---|---|
| `profile:set` | `{ name, color, hat }` | `{ ok, profile }` | Sanitised; used for the next join |
| `lobby:list` | none | `{ ok, matches: MatchSummary[] }` | |
| `match:quick` | `{ mode?, map? }` | `MatchInfo` | Preferences used only if a new room is created |
| `match:create` | `{ mode, map, visibility: "public"|"private", bots: bool }` | `MatchInfo` | |
| `match:join` | `{ code }` | `MatchInfo` | Code: 5 chars from `abcdefghjkmnpqrstuvwxyz23456789` |
| `match:practice` | `{ mode, map }` | `MatchInfo` | Unlisted room with bots |
| `match:leave` | none | `{ ok }` | |
| `input` | `Input` | (no ack) | Sent 30×/s while in a match |
| `latency` | none | empty ack | Used for the ping display |

`MatchInfo = { ok: true, code, mode, map, visibility, practice, you: playerId }`

`Input = { seq: int (strictly increasing), mx: -1..1, my: -1..1, aim: radians, aimDist: px, fire: bool, swap: bool, ability: bool, pick: 0|1|2|3 }`

`ability` uses the active skill (ignored while on cooldown). `pick` chooses card 1–3 of the open skill draft; anything else is treated as 0 (no pick).

### Errors
| Message | Cause |
|---|---|
| `No match found with that code.` | Unknown code, or a practice room |
| `That match is full.` | 10 humans already in the room |
| `You are already in a match.` | Join/create while still in a room |
| `The server is at capacity. Try again soon.` | `MAX_ROOMS` reached |
| `Slow down a little.` | Lobby rate limit hit |

## Socket.IO, server → client

### `lobby:update`
`{ matches: MatchSummary[], online: number }`, sent to lobby clients when the list changes and every 3 s.

### `state` (snapshot, 15×/s)
```jsonc
{
  "t": 1763548800000,          // server time (ms)
  "ack": 1234,                 // last input seq applied for THIS client
  "round": { "n": 1, "s": "playing", "tl": 287, "w": null },  // tl = seconds left
  "ts": [4, 2],                // team scores [red, blue]
  "pk": "1101011101",          // one char per pickup: 1 = available
  "cr": "110111",              // one char per crate: 1 = standing
  "lo": [{ "i": 91, "k": "w", "x": 600, "y": 420, "w": "sg" }],   // loot: k = w(eapon) o(rb) h(ealth) a(rmor)
  "tu": [{ "i": 93, "x": 300, "y": 984, "a": 0.4, "t": 1 }],      // turrets
  "wv": { "n": 3, "s": "fighting", "left": 7, "nx": 0 },          // Bot waves only; nx = s until next wave
  "pl": [{
    "i": "id", "n": "Najam", "c": "#f5c542", "h": 1, "t": 0, "b": 0,
    "x": 312.4, "y": 980.0, "a": 1.57, "hp": 82, "mh": 120, "ar": 30, "lv": 4, "al": 1,
    "w": "ar", "sp": "ar", "am": 21, "k": 3, "d": 1,
    "dn": 0, "dl": 0, "rv": 0,  // downed, ms until bleed-out, revive progress %
    "sh": 0,                    // shield bubble up
    "lk": "killer-id", "rs": 0  // rs = ms until respawn
  }],
  "me": {                       // private to this client
    "xp": 60, "xn": 240, "lv": 4,           // XP into this level, XP needed
    "of": ["swift", "turret", "pierce"],    // open skill draft or null
    "ot": 3400,                             // ms until auto-pick
    "sk": { "tough": 1, "dash": 2 },        // skill stacks
    "ac": "dash", "acd": 1800,              // active skill, ms of cooldown left
    "spd": 1.1                              // movement multiplier for prediction
  },
  "pr": [{ "i": 77, "k": "b", "o": "owner-id", "x": 400, "y": 300, "vx": 1050, "vy": 0, "f": 0.8 }]
}
```
`k` (projectile kind): `b` bullet, `r` rocket, `g` grenade. `f` = grenade fuse seconds.

### `event`
| `type` | Fields |
|---|---|
| `join` / `leave` | `id, name` |
| `hit` | `attackerId, targetId, dmg, x, y, blocked?` |
| `kill` | `killerId, killerName, victimId, victimName, weapon, self` |
| `explosion` | `x, y, r` |
| `pickup` | `playerId, weapon, index` |
| `roundEnd` | `number, winner, waves?` (waves cleared, Bot waves only) |
| `downed` | `victimId, victimName, attackerId` |
| `revived` | `playerId, name, byId, byName` |
| `levelUp` | `playerId, level` |
| `skill` | `playerId, skill` |
| `ability` | `playerId, skill, x, y` |
| `crate` | `x, y, loot` |
| `loot` | `playerId, kind, weapon?` |
| `waveStart` | `number, bots` |
| `waveClear` | `number` |
| `roundStart` | `number` |
