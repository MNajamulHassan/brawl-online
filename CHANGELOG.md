# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com), versioning: [SemVer](https://semver.org).

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
