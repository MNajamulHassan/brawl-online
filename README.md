# Maze Brawl

A cross-platform, real-time multiplayer top-down shooter that runs in the browser. Phones and PCs play in the same match. The game runs on an **authoritative Node.js server**: clients send inputs, the server simulates the world and broadcasts the result, so no client can give itself extra health or speed.

![Node](https://img.shields.io/badge/node-%3E%3D20-339933) ![Tests](https://img.shields.io/badge/tests-84%20passing-c6f432) ![License](https://img.shields.io/badge/license-MIT-blue)

## Features

| Area | What it does |
|---|---|
| Lobby | Player name, colour and hat; public match list; Quick play; join by 5-character code; create public or private matches |
| Modes | Deathmatch (first to 15), Team deathmatch (first team to 30, with team revives and party teams) and **Bot waves** (co-op survival against ever-tougher bot waves) |
| Progression | XP from damage, kills, assists, crates and orbs; every level-up drafts 3 random skills (15 passives, weapon mods and E-key actives) that stack into builds; resets each round |
| Loot crates | Breakable crates drop weapons, XP orbs, health and armour, and respawn on a timer |
| Game feel | Screen shake, floating damage numbers, synthesised sounds, muzzle flash, kill confirmation |
| Live balancing | Every number in `shared/balance.js`; per-weapon and per-skill stats (damage, kills, pick rate, win rate) via admin-only `GET /api/balance`; [BALANCE_CHANGELOG.md](BALANCE_CHANGELOG.md) |
| Maps | **Fields** (hedge maze in open grass) and **Streets** (city blocks and parked cars), both mirrored for fairness |
| Weapons | Pistol with infinite ammo; assault rifle, shotgun, RPG and grenades spawn on the map with one magazine |
| Bots | Server-side AI fills empty slots and powers single-player practice |
| Crossplay | Keyboard + mouse on PC, twin virtual thumbsticks on touch screens |
| Settings | Audio, graphics, gameplay and fully rebindable controls (primary + alternate keys), touch layout editor, colour-blind team colours, UI scale; saved in the browser |
| Onboarding | First-visit welcome, a replayable offline tutorial, How to play, loading/offline screen, About |
| Netcode | 30 Hz server simulation, 15 Hz snapshots, client-side prediction with reconciliation, interpolation of other players |
| Ops | `/healthz` endpoint, structured JSON logs, rate limiting, input validation, graceful shutdown, Docker image, CI |

## Quick start

```bash
git clone https://github.com/<your-username>/maze-brawl.git
cd maze-brawl
npm install
npm start              # http://localhost:3000
npm test               # 84 automated tests
```

Open the URL in two browser windows (or a phone on the same Wi-Fi using your computer's IP address) to play against yourself.

## Project structure

```
maze-brawl/
├── server/
│   ├── index.js              # HTTP + Socket.IO bootstrap, fixed-timestep game loop
│   ├── config.js             # environment configuration
│   ├── logger.js             # structured JSON logger
│   ├── net/socketHandlers.js # socket events → room manager (validation, rate limits)
│   └── game/
│       ├── Room.js           # authoritative match simulation
│       ├── RoomManager.js    # create / join / quick play / cleanup
│       ├── BotBrain.js       # bot AI (line of sight + BFS pathfinding, revives teammates)
│       ├── Skills.js         # skill draft and skill maths
│       ├── WaveDirector.js   # Bot waves co-op mode
│       ├── BalanceStats.js   # per-weapon / per-skill balance statistics
│       ├── validation.js     # sanitises every client payload
│       └── RateLimiter.js    # token bucket
├── shared/                   # code used by BOTH server and browser
│   ├── constants.js          # engine constants, modes
│   ├── balance.js            # ALL balance numbers: weapons, skills, XP, crates, revives, waves
│   ├── maps.js               # map layouts
│   └── physics.js            # collision, movement, pathfinding
├── public/                   # static client
│   ├── index.html
│   ├── css/style.css
│   └── js/ (main, input, renderer, ui, fx, settings, settingsUI, help, tutorial)
├── tests/                    # node:test suites
├── docs/                     # SDLC documentation
├── Dockerfile · render.yaml · .github/workflows/ci.yml
```

## Documentation (SDLC)

| Phase | Document |
|---|---|
| Planning | [01 Project plan](docs/01-project-plan.md) |
| Requirements | [02 Software requirements specification](docs/02-requirements.md) |
| Design | [03 System design](docs/03-system-design.md) · [04 API reference](docs/04-api-reference.md) |
| Testing | [05 Test plan and report](docs/05-testing.md) |
| Deployment | [06 Deployment guide](docs/06-deployment.md) |
| Operation | [07 User guide](docs/07-user-guide.md) |
| Maintenance | [08 Maintenance and roadmap](docs/08-maintenance.md) · [CHANGELOG](CHANGELOG.md) |

## Tech stack

Node.js 20+, Express 4, Socket.IO 4, HTML5 Canvas, vanilla ES modules (no build step), `node:test`.

## License

MIT, see [LICENSE](LICENSE).
