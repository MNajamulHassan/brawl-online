# 02 · Software Requirements Specification (SRS)

## 1. Introduction

### 1.1 Purpose
This document specifies the functional and non-functional requirements of Maze Brawl v1.0.

### 1.2 Definitions
| Term | Meaning |
|---|---|
| Match / room | One running game instance identified by a 5-character code |
| Snapshot | The server's description of a room's state, sent to clients |
| Tick | One fixed step of the server simulation (1/30 s) |
| Special weapon | Any weapon other than the pistol; picked up from the map |
| Bot | A server-controlled player |

### 1.3 Users
- **Player**: anyone with a modern browser on a phone, tablet or PC.
- **Operator**: the person who deploys and monitors the server.

## 2. Functional requirements

### Lobby (FR-L)
| ID | Requirement | Priority |
|---|---|---|
| FR-L1 | The player can set a display name (1–14 characters), one of 8 colours and one of 5 hats. The choice persists in the browser. | Must |
| FR-L2 | The lobby shows a live list of public matches with mode, map and player count. | Must |
| FR-L3 | Quick play joins the fullest public match with space, or creates a new public match. | Must |
| FR-L4 | The player can create a match choosing mode, map, visibility (public/private) and whether bots fill empty slots. | Must |
| FR-L5 | The player can join a private match by entering its 5-character code. | Must |
| FR-L6 | The player can start a practice match against bots that no one else can join. | Should |
| FR-L7 | The lobby shows whether the client is connected to the server. | Should |

### Gameplay (FR-G)
| ID | Requirement | Priority |
|---|---|---|
| FR-G1 | Players move in 8 directions and aim independently of movement. | Must |
| FR-G2 | Every player always has a pistol with infinite ammo. | Must |
| FR-G3 | Assault rifle, shotgun, RPG and grenades spawn at fixed map points; picking one up gives one magazine; the spawn point refills after 15 s. | Must |
| FR-G4 | When a special weapon runs out, the player returns to the pistol automatically. | Must |
| FR-G5 | The player can swap between pistol and special weapon. | Must |
| FR-G6 | RPG rockets and grenades explode with splash damage; self-damage is halved. | Must |
| FR-G7 | Players have 100 HP; at 0 HP they are eliminated and respawn after 3 s at a spawn point far from enemies. | Must |
| FR-G8 | Deathmatch: every player for themselves; first to 15 kills wins. | Must |
| FR-G9 | Team deathmatch: two teams (Red, Blue) balanced on join; no friendly fire; first team to 30 kills wins. | Must |
| FR-G10 | A round lasts at most 5 minutes; after a round ends, scores show for 8 s and a new round starts. | Must |
| FR-G11 | Two maps are available: Fields and Streets. Both are maze-like and mirrored. | Must |
| FR-G12 | Bots move, find pickups, and fight using the same rules as players. | Should |
| FR-G13 | A HUD shows health, weapon, ammo, timer, score, kill feed and a scoreboard. | Must |
| FR-G14 | Up to 10 human players per match. | Must |

### Platform (FR-P)
| ID | Requirement | Priority |
|---|---|---|
| FR-P1 | PC: WASD/arrow keys move, mouse aims, left click fires, Q/mouse wheel swaps, Tab toggles scores. | Must |
| FR-P2 | Touch: left thumb is a movement stick, right thumb is an aim stick that fires when pushed past 60%. | Must |
| FR-P3 | Phone and PC players can be in the same match. | Must |

## 3. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Security | The server is authoritative. Clients send only inputs; health, damage, ammo, position and score are computed on the server. |
| NFR-2 | Security | All client payloads are validated and clamped; invalid payloads are dropped. Names are sanitised. |
| NFR-3 | Security | Lobby actions are rate-limited (burst 10, 2/s); input packets are rate-limited (burst 60, 40/s); messages over 16 KB are rejected. |
| NFR-4 | Performance | Server simulates at 30 ticks/s and sends snapshots at 15/s. A snapshot for a full room is under 4 KB. |
| NFR-5 | Responsiveness | The local player's movement is predicted, so it responds without waiting for the server. |
| NFR-6 | Availability | The service exposes `/healthz`; the host restarts it on failure. Empty rooms are freed immediately. |
| NFR-7 | Portability | Runs on any Node.js 20+ host or as a Docker container. The client needs no build step. |
| NFR-8 | Usability | The game is usable at 360 px wide. Touch targets are at least 40 px. |
| NFR-9 | Maintainability | Game rules shared by client and server live in one place (`shared/`). Core logic has automated tests. |
| NFR-10 | Observability | Structured JSON logs for server start/stop, room lifecycle and errors. |

## 4. Use cases

### UC-1 Play with friends (private match)
1. Host opens the site, sets a name, chooses mode/map, selects **Private**, taps **Create**.
2. System creates a room and shows its code in the HUD.
3. Host shares the code. A friend enters it under **Join a private match**.
4. System places the friend in the room (balanced team in TDM) and both see each other.

**Alternatives:** wrong code → "No match found with that code."; room full → "That match is full."

### UC-2 Quick play
1. Player taps **Quick play**.
2. System joins the fullest public match with space, or creates a public match with bots.

### UC-3 Practice
1. Player taps **Practice vs bots**.
2. System creates an unlisted room with 5 bots.

### UC-4 Monitor the server (operator)
1. Operator requests `GET /healthz`.
2. System returns status, uptime, room count, players and bots.

## 5. Traceability

Each requirement is covered by tests listed in [05-testing.md](05-testing.md#4-traceability-matrix).
