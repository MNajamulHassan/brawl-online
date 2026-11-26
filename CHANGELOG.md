# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com), versioning: [SemVer](https://semver.org).

## [1.2.0] - 2026-11-26

Client-only release: no server rule changes.

### Added
- **Settings menu** (⚙ in the lobby and in matches, or Esc) with Audio, Graphics, Controls and Gameplay tabs and a per-tab "Reset to defaults". Opening it in a match pauses only your own input.
- **Audio**: master / effects / music volume and mute; a synthesised background music loop during matches.
- **Graphics**: quality (particle budget), screen shake toggle, FPS counter, ping toggle, fullscreen.
- **Gameplay**: touch aim sensitivity, auto-fire toggle (with an on-screen Fire button when off), hide name tags, colour-blind team colours, UI scale 80–130%.
- **Rebindable controls**: every action with primary + alternate binding (keys, mouse buttons, wheel); conflict warning with swap; Esc cancels. Logic in `public/js/settings.js` with 11 unit tests.
- **Touch layout editor**: drag and resize sticks and Swap/Skill/Fire buttons; fixed or floating joysticks.
- **Tutorial**: first-visit welcome card and a replayable 7-step tutorial that runs locally in the browser against target dummies, with touch or keyboard instructions from your own binds.
- **Polish**: loading screen with a clear offline message, Retry and offline tutorial; How to play; About (version, GitHub link, credits); confirm before leaving a match.

### Changed
- Help text, the lobby controls card and How to play are generated from the current keybinds.
- Input uses `KeyboardEvent.code`, so bindings work on any keyboard layout.

### Fixed
- Settings dialog overflowed on narrow phones; HUD top bar wrapped on phones after adding the gear button.

## [1.1.0] - 2026-11-26

### Added
- **XP, levels and skill draft**: XP from damage, kills, assists, crates and XP orbs; every level-up offers 3 random skills (keys 1/2/3, tap on touch, auto-pick after 5 s). 15 stackable skills: 6 passives, 4 weapon mods, 5 actives on E with cooldowns. Progress resets each round and survives deaths.
- **Team revives** (Team deathmatch and Bot waves): lethal hits down players for 8 s; a teammate nearby for 3 s revives at 50% HP; otherwise the enemy gets the kill. Bots revive teammates.
- **Loot crates** on both maps: drop weapons, XP orbs, health and armour; respawn after 20 s. New armour stat absorbs damage first.
- **Party play**: players joining a Team deathmatch by code land on the host's team; bots even out the other side. HUD lists teammates' health and points to off-screen teammates.
- **Bot waves** co-op mode: escalating waves (more, tougher bots each wave), respawn between waves, score = waves cleared, personal best shown in the lobby.
- **Game feel**: screen shake, floating damage numbers, synthesised sound effects (M to mute), bigger muzzle flash for your shots, kill confirmation banner, red flash when hit.
- **Live balancing**: all numbers moved into `shared/balance.js`; per-weapon and per-skill stats on the server; admin-only `GET /api/balance` (needs `ADMIN_TOKEN`); stats logged every 5 minutes; `BALANCE_CHANGELOG.md`.
- 32 new automated tests (73 total).

### Changed
- `WEAPONS` moved from `shared/constants.js` to `shared/balance.js` (still re-exported from `constants.js`).
- Input packets carry `ability` and `pick`; snapshots carry crates, loot, turrets, wave state, level/armour/downed fields and a private `me` block per client.

### Fixed
- Enemy bots in Bot waves were downed instead of killed, so waves could not be cleared (found by tests).
- A party stacked on one TDM team could face an empty enemy team; bots now fill the gap (found by tests).

## [1.0.0] - 2026-11-19

### Added
- Authoritative Node.js game server (Express + Socket.IO) with a 30 Hz fixed-timestep simulation and 15 Hz snapshots.
- Room manager: public/private matches, 5-character codes, quick play, practice rooms, automatic cleanup.
- Deathmatch and Team deathmatch modes with timed rounds, score limits and automatic restart.
- Fields and Streets maps (mirrored, maze-like).
- Pistol (infinite) plus assault rifle, shotgun, RPG and grenades as map pickups with one magazine.
- Server-side bots with line-of-sight combat and BFS pathfinding.
- Browser client: lobby, fighter customisation, HUD, kill feed, scoreboard, hit markers.
- PC keyboard/mouse and touch twin-stick controls (crossplay).
- Client-side prediction with reconciliation; interpolation of other players.
- Input validation, rate limiting, payload size limit, connection cap, security headers.
- `/healthz` and `/api/matches` endpoints, structured JSON logs, graceful shutdown.
- 41 automated tests, GitHub Actions CI, Dockerfile, Render blueprint.
- SDLC documentation in `docs/`.

## [0.1.0] - 2026-11-19

### Added
- Single-file peer-to-peer prototype used to validate gameplay and controls.
