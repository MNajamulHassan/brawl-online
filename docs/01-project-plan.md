# 01 · Project Plan

| | |
|---|---|
| Project | Maze Brawl: cross-platform multiplayer top-down shooter |
| Author | M. Najam-ul-Hassan |
| Version | 1.0.0 |
| Status | Released (v1.0.0) |

## 1. Purpose

Build a browser game that people on phones and PCs can play together in real time, with no install, and engineer it the way a production team would: documented requirements, a reviewed design, automated tests, CI, and a repeatable deployment.

## 2. Scope

**In scope (v1.0)**
- Lobby with player customisation, public match list, quick play, private matches by code
- Two game modes (Deathmatch, Team deathmatch) and two maps (Fields, Streets)
- Pistol plus four map-spawned weapons with limited ammo
- Server-side bots for practice and for filling empty slots
- Authoritative server, client-side prediction, interpolation
- PC (keyboard + mouse) and touch controls
- Deployment to a cloud host with health checks

**Out of scope (v1.0)**
- User accounts, persistent stats, leaderboards
- Voice/text chat
- Horizontal scaling across multiple server instances
- Native mobile apps

## 3. SDLC model

The project followed an **iterative (incremental) model**: each iteration produced a working, testable build.

| Iteration | Goal | Output |
|---|---|---|
| 0. Prototype | Prove the game feel and controls in a single HTML file | Peer-to-peer prototype (gameplay validated, but no server authority) |
| 1. Requirements and design | Turn the prototype into a specification; choose client–server architecture | `02-requirements.md`, `03-system-design.md` |
| 2. Core server | Authoritative simulation, rooms, matchmaking, validation | `server/` and `shared/` |
| 3. Client | Rendering, input, prediction, interpolation, lobby and HUD | `public/` |
| 4. Verification | Unit and integration tests, multi-client browser test | `tests/`, `05-testing.md` |
| 5. Release | Docker, Render blueprint, CI, documentation | `Dockerfile`, `render.yaml`, CI workflow |

### Why the prototype was replaced

The prototype let each player's browser decide its own hits. This was fine for a demo, but any player could edit the page and become invincible. Version 1.0 moves every rule onto the server (see design decision D1 in `03-system-design.md`).

## 4. Roles

| Role | Responsibility |
|---|---|
| Developer (M. Najam-ul-Hassan) | Requirements, design, implementation, testing, deployment |
| Instructor / reviewer | Review of requirements, design and final demo |

## 5. Schedule

| Milestone | Deliverable |
|---|---|
| M1 | Prototype playable |
| M2 | SRS and design approved |
| M3 | Server feature-complete, unit tests green |
| M4 | Client feature-complete, crossplay verified |
| M5 | Deployed to production URL, documentation complete |

## 6. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Cheating through modified clients | High | High | Authoritative server; clients send inputs only; all payloads validated |
| R2 | Network lag makes movement feel bad | Medium | High | Client-side prediction + reconciliation; interpolation buffer for others |
| R3 | Free hosting sleeps when idle | High | Medium | Health check; documented cold-start (~30–60 s); paid tier removes it |
| R4 | Abuse (spam, floods) | Medium | Medium | Per-socket rate limits, payload size cap, connection cap |
| R5 | Single server instance is a single point of failure | Medium | Medium | Stateless restart; documented scaling path (Redis adapter) in `08-maintenance.md` |
| R6 | Touch controls hard to use | Medium | Medium | Twin-stick layout, fire threshold, tested on a phone viewport |

## 7. Tools

Git + GitHub (version control), GitHub Actions (CI), Node.js, Socket.IO, Render (hosting), Docker (portable builds), Playwright (manual multi-client browser verification).
