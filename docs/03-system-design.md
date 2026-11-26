# 03 · System Design

## 1. Architecture overview

Maze Brawl is a **client–server** system with an **authoritative server**.

```mermaid
flowchart LR
  subgraph Browser["Browser (phone or PC)"]
    UI[Lobby + HUD<br/>ui.js]
    IN[Input<br/>input.js]
    GL[Game loop<br/>main.js<br/>prediction + interpolation]
    RD[Renderer<br/>renderer.js]
  end
  subgraph Server["Node.js server"]
    HTTP[Express<br/>static files, /healthz, /api/matches]
    SIO[Socket.IO<br/>socketHandlers.js<br/>validation + rate limits]
    RM[RoomManager]
    R1[Room]
    R2[Room]
    BOT[BotBrain]
    LOOP[Fixed-timestep loop<br/>30 Hz]
  end
  SH[(shared/<br/>constants, maps, physics)]
  IN --> GL --> RD
  UI <--> GL
  GL -- "inputs 30/s" --> SIO
  SIO -- "snapshots 15/s + events" --> GL
  SIO --> RM --> R1 & R2
  R1 --> BOT
  LOOP --> RM
  SH -.-> GL
  SH -.-> R1
```

### Layers

| Layer | Files | Responsibility |
|---|---|---|
| Presentation | `public/js/ui.js`, `renderer.js`, `fx.js`, `settingsUI.js`, `help.js`, `css/style.css` | DOM and canvas drawing, dialogs, settings menu, help text, sounds and music; no rules |
| Client logic | `public/js/main.js`, `input.js`, `settings.js`, `tutorial.js` | Input sampling via keybinds, prediction, reconciliation, interpolation, player settings (pure, unit-tested), local tutorial simulation |
| Transport | `server/net/socketHandlers.js` | Socket events, validation, rate limits, broadcasting |
| Domain | `server/game/Room.js`, `RoomManager.js`, `BotBrain.js`, `Skills.js`, `WaveDirector.js`, `BalanceStats.js` | All game rules, skill maths, the Bot waves director, balance statistics |
| Shared kernel | `shared/*.js` | Constants, maps, physics and `balance.js` (every tunable number) used by both sides |
| Infrastructure | `server/index.js`, `config.js`, `logger.js`, `adminAuth.js` | Boot, game loop, config, logging, admin auth, shutdown |

`Room` has no knowledge of sockets. It reports what happened through an `onEvent` callback, which makes it fully unit-testable with a fake clock and seeded random numbers.

## 2. Key design decisions

| # | Decision | Alternatives considered | Reason |
|---|---|---|---|
| D1 | Authoritative server; clients send inputs only | Peer-to-peer (prototype), client-authoritative hits | Prevents cheating (NFR-1). The prototype could be cheated by editing the page. |
| D2 | Fixed timestep (1/30 s) with an accumulator | Variable `dt` from `setInterval` | Deterministic simulation; the client can replay inputs with the same `dt` for prediction. |
| D3 | Client-side prediction + reconciliation for the local player | Wait for server | Removes input lag (NFR-5). |
| D4 | Interpolate other players ~110 ms in the past | Extrapolation | Smooth motion without guessing; small fixed delay is acceptable for a casual shooter. |
| D5 | Shared ES modules served to the browser | Duplicate code, bundler | One source of truth for physics and tunables; no build step. |
| D6 | Socket.IO | Raw WebSocket, WebRTC | Reconnection, acknowledgements, rooms and polling fallback for restrictive networks. |
| D7 | In-memory rooms, single process | Redis / database | Matches are short-lived; nothing needs to persist in v1. Scaling path documented. |
| D8 | Bots run on the server through the same rules | Client-side bots | Bots behave identically for everyone and cannot be cheated. |

## 3. Netcode

### 3.1 Server loop

```
every ~16 ms:
  accumulator += elapsed (capped at 250 ms)
  while accumulator >= 33.3 ms:
      for each room: room.tick(1/30)
      every 2nd tick: send snapshot to every human in every room
```

### 3.2 Room tick order

1. Update round state (timer, end-of-round, restart); in Bot waves, advance the `WaveDirector`
2. For each player:
   - bots: `BotBrain.think()` → move/aim/fire/ability intent; bots pick skill cards at once
   - humans: apply up to 3 queued inputs (each = 1/30 s of movement, plus skill pick and ability)
   - auto-pick a skill card when the 5 s draft timer expires
   - fire if the trigger is held and the weapon cooldown has passed (shortened by Hair trigger)
   - Regen healing
3. Turrets aim and fire
4. Move projectiles in sub-steps of at most 12 px (no tunnelling through walls); bounce (Ricochet), pierce, hit crates, apply hits and explosions
5. Downed players: revive progress or bleed-out
6. Remove dead wave bots; respawn eliminated players whose timer has elapsed; check weapon pickups and loot
7. Respawn crates, expire loot; in Bot waves, end the run if no human is standing

### 3.2.1 Damage pipeline

`damage(target, amount, attacker, weapon)` is the single entry point for all damage:
shield blocks everything → armour absorbs first → HP. The attacker (if an enemy) gets XP for the damage dealt and Life steal healing, the
target remembers the attacker for assists, and `BalanceStats` records the damage. At 0 HP the target is **downed** in modes with revives
(`MODES[mode].revives`), otherwise **killed**. `kill()` awards kill XP, assist XP and team points, and records the kill.

### 3.2.2 Skill draft

```
gainXp ──► level up? ──► drafts++ ──► nextOffer(): 3 skills not maxed ──► offer + 5 s deadline
                                                                         │
input.pick (1-3) / deadline / bot ──► pickSkill(): applySkill, drafts-- ─┘ (next queued draft)
```
Skill effects are pure functions of the player's stack counts (`Skills.js`: `maxHp`, `speedMul`, `fireRateMul`, `boomEvery`, `activeCooldown`),
so the server and tests can compute them without side effects. The client gets the movement multiplier (`me.spd`) so prediction uses the same speed as the server.

### 3.2.3 Bot waves

`WaveDirector` alternates `break` (5 s) and `fighting`. On a new wave it respawns eliminated humans and queues `3 + 2(n-1)` bots,
spawning one every 0.7 s while fewer than 12 are alive. Wave bots get `hpMul` and `dmgMul`, die without being downed, and are removed
from the room. When none are left the wave is cleared. Score = `survived` (waves fully cleared).

### 3.2.4 Balance statistics

One `BalanceStats` instance is owned by `RoomManager` and passed to every room. It is in memory only; `index.js` logs `summary()`
every 5 minutes. `GET /api/balance` returns it with the full `balance.js` config when the request carries the `ADMIN_TOKEN` bearer token
(compared in constant time by `adminAuth.js`).

### 3.3 Prediction and reconciliation

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server
  C->>C: input #41: move locally, store in pending
  C->>S: input {seq: 41, mx, my, aim, fire}
  C->>C: input #42: move locally, store in pending
  C->>S: input {seq: 42, ...}
  S->>S: tick: apply #41
  S-->>C: snapshot {ack: 41, me: {x, y}}
  C->>C: drop inputs ≤ 41
  C->>C: start from server x,y, replay #42
  C->>C: blend any small difference out over ~80 ms
```

Because client and server run the same `moveEntity()` from `shared/physics.js` with the same `INPUT_DT`, the replayed position matches the server's unless something the client could not know happened (e.g. respawn).

### 3.4 Anti-cheat measures

| Threat | Countermeasure |
|---|---|
| Speed hack (large move vector) | Vector clamped to length 1 in `parseInput` |
| Speed hack (flooding inputs) | Max 10 queued inputs, max 3 applied per tick, 40 inputs/s rate limit |
| Replay / reorder | `seq` must strictly increase |
| Infinite ammo / health / damage | Not accepted from clients at all; computed on the server |
| Shooting faster | Cooldown enforced on the server clock |
| Script injection via name | Names sanitised server-side; all DOM output escaped client-side; CSP header |

## 4. Data model

### Player (server)
| Field | Type | Notes |
|---|---|---|
| id | string | Socket id, or `bot-N` |
| name, color, hat | string, string, int | Sanitised profile |
| team | 0, 1, 2 | 0 in deathmatch |
| x, y, angle | number | World pixels, radians |
| hp, alive | number, bool | |
| weapon, special, ammo | string, string?, int | `weapon` is what is in hand |
| kills, deaths | int | Reset each round |
| armor, maxHp() | number | Armour absorbs damage first; max HP grows with Tough (and `hpMul` for wave bots) |
| level, xp, drafts, offer, offerDeadline | int, number, int, string[]?, ms | Progression; reset each round |
| skills, active, activeReadyAt, shieldUntil | {id: stacks}, string?, ms, ms | Skills; kept through deaths |
| downed, downedUntil, downedBy, reviveMs | bool, ms, object, ms | Revive state |
| damagedBy, roundDamage | Map, {weapon: dmg} | For assists and per-weapon win rate |
| inputs, lastSeq | array, int | Input queue and last applied sequence number |

### Projectile
`{ id, kind: bullet|rocket|grenade, x, y, vx, vy, ownerId, team, weapon, damage, life, radius?, fuse?, moveLeft?, bounces?, pierce?, hitIds?, boom?, blastDmg? }`

### Crate, loot, turret
`Crate { x, y, hp, respawnAt }` · `Loot { id, kind: weapon|orb|health|armor, weapon?, x, y, expiresAt }` · `Turret { id, ownerId, team, x, y, angle, until, nextShot }`

### Room
`{ code, mode, mapKey, visibility, botsEnabled, hostId, players: Map, projectiles[], pickups[], crates[], loot[], turrets[], teamScores, waves?: WaveDirector, stats: BalanceStats, round: { number, state: playing|ended, endsAt, stateEndsAt, winner } }`

## 5. Map format

Maps are 32 × 22 tiles of 48 px. Each map is authored as its left 16 columns and mirrored. Legend: `.` floor, `#` hedge, `o` rock, `B` building, `c` car, `A`/`H`/`R`/`G` weapon spawns, `X` loot crate spawns (not solid for movement, but they stop bullets). The border is forced solid.

## 6. Security headers

`Content-Security-Policy` (self-only scripts, Google Fonts styles/fonts, websocket connect), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`; `x-powered-by` disabled.
