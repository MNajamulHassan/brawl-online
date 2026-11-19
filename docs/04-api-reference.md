# 04 · API Reference

## HTTP

| Method | Path | Response |
|---|---|---|
| GET | `/` | Game client |
| GET | `/healthz` | `{ "status": "ok", "uptimeSec": 120, "rooms": 2, "players": 5, "bots": 3 }` |
| GET | `/api/matches` | `{ "matches": [MatchSummary] }`, public matches only |
| GET | `/shared/*.js` | Shared ES modules used by the client |

`MatchSummary = { code, mode: "dm"|"tdm", map: "field"|"streets", players, bots, max }`

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

`Input = { seq: int (strictly increasing), mx: -1..1, my: -1..1, aim: radians, aimDist: px, fire: bool, swap: bool }`

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
  "pl": [{
    "i": "id", "n": "Najam", "c": "#f5c542", "h": 1, "t": 0, "b": 0,
    "x": 312.4, "y": 980.0, "a": 1.57, "hp": 82, "al": 1,
    "w": "ar", "sp": "ar", "am": 21, "k": 3, "d": 1,
    "lk": "killer-id", "rs": 0  // rs = ms until respawn
  }],
  "pr": [{ "i": 77, "k": "b", "o": "owner-id", "x": 400, "y": 300, "vx": 1050, "vy": 0, "f": 0.8 }]
}
```
`k` (projectile kind): `b` bullet, `r` rocket, `g` grenade. `f` = grenade fuse seconds.

### `event`
| `type` | Fields |
|---|---|
| `join` / `leave` | `id, name` |
| `hit` | `attackerId, targetId` |
| `kill` | `killerId, killerName, victimId, victimName, weapon, self` |
| `explosion` | `x, y, r` |
| `pickup` | `playerId, weapon, index` |
| `roundEnd` | `number, winner` |
| `roundStart` | `number` |
