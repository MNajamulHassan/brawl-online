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
| FR-G7 | Players have 100 HP (more with the Tough skill); at 0 HP they are eliminated (or downed, see FR-R1) and respawn after 3 s at a spawn point far from enemies. | Must |
| FR-G8 | Deathmatch: every player for themselves; first to 15 kills wins. | Must |
| FR-G9 | Team deathmatch: two teams (Red, Blue) balanced on join; no friendly fire; first team to 30 kills wins. | Must |
| FR-G10 | A round lasts at most 5 minutes; after a round ends, scores show for 8 s and a new round starts. | Must |
| FR-G11 | Two maps are available: Fields and Streets. Both are maze-like and mirrored. | Must |
| FR-G12 | Bots move, find pickups, and fight using the same rules as players. | Should |
| FR-G13 | A HUD shows health, weapon, ammo, timer, score, kill feed and a scoreboard. | Must |
| FR-G14 | Up to 10 human players per match. | Must |

### Progression and skills (FR-S), added in v1.1
| ID | Requirement | Priority |
|---|---|---|
| FR-S1 | Players earn XP from damage dealt (0.5 per HP), kills (100), assists (40, damage in the last 5 s), breaking crates (30) and XP orbs (60). | Must |
| FR-S2 | Reaching the XP threshold (120 + 60 × (level − 1)) raises the level, up to level 12. Level, XP and skills reset every round. | Must |
| FR-S3 | Each level-up offers 3 distinct random skills; the player picks one with keys 1/2/3 (PC) or by tapping a card (touch). If no pick is made in 5 s, one is picked at random. Several level-ups queue one draft each. | Must |
| FR-S4 | 15 skills in 3 types: passives (Swift, Tough, Life steal, Hair trigger, Big mags, Regen), weapon mods (Ricochet, Piercing, Finale, Buckshot) and actives (Dash, Shield bubble, Patch up, Turret, Blink). | Must |
| FR-S5 | Skills stack up to 3 times and are kept through deaths within a round. A maxed skill is never offered again. | Must |
| FR-S6 | One active skill slot, used with E or the on-screen skill button and limited by a cooldown. Picking a new active replaces the slot; picking the same active again cuts its cooldown by 20%. | Must |

### Revives, crates and squads (FR-R, FR-C, FR-Q), added in v1.1
| ID | Requirement | Priority |
|---|---|---|
| FR-R1 | In Team deathmatch and Bot waves, a lethal hit downs the player for 8 s instead of eliminating them. Downed players cannot move, shoot or be hit. | Must |
| FR-R2 | A standing teammate within 55 px for 3 s in total revives the downed player at 50% HP. Moving away resets the progress. | Must |
| FR-R3 | If nobody revives them in time, the player is eliminated and the enemy who downed them gets the kill and the team point. | Must |
| FR-R4 | Bots walk to downed teammates and revive them. | Should |
| FR-C1 | Breakable loot crates (40 HP) spawn at fixed points on both maps. Bullets and explosions damage them. | Must |
| FR-C2 | A broken crate drops one item: a random special weapon, an XP orb, a health pack (+40 HP) or armour (+50, max 100, absorbs damage before HP). Unclaimed loot disappears after 20 s. | Must |
| FR-C3 | Crates respawn 20 s after breaking. | Must |
| FR-Q1 | In Team deathmatch, players who join by match code are placed on the host's team while it has room for another human (5); bots fill the other side so the teams stay even. | Must |
| FR-Q2 | The HUD lists teammates with their health and downed state, and arrows at the screen edge point to off-screen teammates. | Must |

### Bot waves mode (FR-W), added in v1.1
| ID | Requirement | Priority |
|---|---|---|
| FR-W1 | A co-op mode where all humans share one team against waves of enemy bots. | Must |
| FR-W2 | Wave n has 3 + 2 × (n − 1) bots (at most 12 alive at once). Each wave gives bots 15% more HP and 8% more damage than the last. A 5 s break separates waves. | Must |
| FR-W3 | Eliminated players return when the next wave starts. The run ends when every human is down or eliminated. | Must |
| FR-W4 | Score = waves fully cleared. The lobby shows the player's best score (stored in the browser). | Must |

### Game feel (FR-F), added in v1.1
| ID | Requirement | Priority |
|---|---|---|
| FR-F1 | Screen shake when shooting, being hit, and on nearby explosions (stronger when closer). | Should |
| FR-F2 | Floating damage numbers over every hit ("blocked" for shielded hits). | Should |
| FR-F3 | Synthesised sounds for shots, hits, kills, damage taken, explosions, level-ups, pickups and abilities; M toggles sound. | Should |
| FR-F4 | Muzzle flash on every shot (larger for your own) and a kill confirmation banner. | Should |

### Live balancing (FR-B), added in v1.1
| ID | Requirement | Priority |
|---|---|---|
| FR-B1 | Every weapon, skill, XP, crate, revive and wave number lives in one file, `shared/balance.js`. | Must |
| FR-B2 | The server counts, per weapon: shots, damage, kills, pickups, rounds as main weapon, wins; per skill: times offered, picked, damage and kills while held, rounds, wins. Pick rate and win rate are derived. | Must |
| FR-B3 | `GET /api/balance` returns these stats and the current numbers, only with the admin bearer token (`ADMIN_TOKEN`). Without the variable the endpoint is disabled (404). | Must |
| FR-B4 | Stats are written to the log every 5 minutes (`balance.stats`) so history survives restarts. | Should |
| FR-B5 | Every number change is recorded with a reason in `BALANCE_CHANGELOG.md`. | Must |

### Settings, controls and onboarding (FR-U), added in v1.2 (client only)
| ID | Requirement | Priority |
|---|---|---|
| FR-U1 | A settings dialog opens from a gear button in the lobby and in a match, or with the menu key (Esc by default). In a match it pauses only the local player's input; the match keeps running for everyone else. | Must |
| FR-U2 | Audio tab: master, effects and music volume (0–100%) and a mute toggle. Sound effects and background music are synthesised in the browser. | Must |
| FR-U3 | Graphics tab: quality low/medium/high (particle budget 35/65/100%), screen shake on/off, show FPS, show ping, fullscreen toggle. | Must |
| FR-U4 | Gameplay tab: touch aim sensitivity (0.5–2×), auto-fire on the aim stick (off shows a Fire button), hide name tags, colour-blind team colours (orange/sky blue), UI scale 80–130%. | Must |
| FR-U5 | Controls tab lists every action with a primary and an alternate binding. Clicking a binding and pressing a key, mouse button or wheel direction rebinds it; Esc cancels; Delete clears the alternate. | Must |
| FR-U6 | Binding a key that is already used shows which action uses it and offers to swap the two keys; declining changes nothing. | Must |
| FR-U7 | Touch: joysticks can be floating (appear where the thumb lands) or fixed; an "Edit touch layout" mode lets the player drag and resize both sticks and the Swap, Skill and Fire buttons. | Must |
| FR-U8 | Every tab has "Reset to defaults", which resets only that tab. | Must |
| FR-U9 | All choices are saved in localStorage. If storage is blocked or the stored data is invalid, the game still works with defaults (invalid fields are replaced one by one). | Must |
| FR-U10 | The in-game help line, the lobby controls card, How to play and the tutorial show the player's current bindings, never hard-coded keys. | Must |
| FR-U11 | First visit shows a welcome card ("New here? Take the 1-minute tutorial") with Start tutorial / Skip; it is not shown again after either choice. A Tutorial button in the lobby replays it. | Must |
| FR-U12 | The tutorial runs in the browser (no server needed) on the Fields map with harmless dummies: move, shoot a dummy, pick up a weapon, swap, throw a grenade at a group (2+ dummies hit), open the scoreboard, then "You're ready!" with Quick play / Back to lobby. Each step shows a tip and a checkmark when done; Skip is always visible; touch devices get touch instructions. | Must |
| FR-U13 | A loading screen is shown while connecting. If the server cannot be reached (error or 8 s), it says so clearly and offers Retry and the offline tutorial. | Must |
| FR-U14 | The lobby has How to play (controls, weapons, modes, skills) and About (version, GitHub link, credits). | Must |
| FR-U15 | Leaving a match asks for confirmation first. | Must |

### Platform (FR-P)
| ID | Requirement | Priority |
|---|---|---|
| FR-P1 | PC: WASD/arrow keys move, mouse aims, left click fires, Q/mouse wheel swaps, E uses the active skill, 1/2/3 pick a skill card, Tab toggles scores, M toggles sound. | Must |
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
