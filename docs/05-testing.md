# 05 · Test Plan and Report

## 1. Strategy

| Level | Tool | What is covered |
|---|---|---|
| Unit | `node:test` | Physics, map integrity, validation, rate limiting |
| Component | `node:test` | `Room` simulation with a fake clock and seeded RNG; `RoomManager` lifecycle |
| Integration | Playwright (manual run) | Real server + two browsers (PC viewport and touch phone viewport) in the same private match |
| Smoke | GitHub Actions | Server boots and `/healthz` answers on Node 20 and 22 |
| Manual | Phone + PC | Controls, readability, feel |

Tests use a **controllable clock** (`now: () => t`) and **seeded random numbers**, so every run is deterministic.

## 2. How to run

```bash
npm test
```

## 3. Automated test cases

| ID | Suite | Test | Result |
|---|---|---|---|
| T-01 | physics | Every map has correct size, solid border, mirrored pickups | Pass |
| T-02 | physics | Unknown map throws | Pass |
| T-03 | physics | All open tiles are reachable (no sealed areas) | Pass |
| T-04 | physics | Outside the map counts as solid | Pass |
| T-05 | physics | Movement stops at walls and slides along them | Pass |
| T-06 | physics | Diagonal movement is not faster | Pass |
| T-07 | physics | Line of sight blocked by walls | Pass |
| T-08 | physics | Angle difference wraps around ±π | Pass |
| T-09 | validation | Names trimmed, markup stripped, length-limited | Pass |
| T-10 | validation | Profile falls back to safe defaults | Pass |
| T-11 | validation | Room codes match alphabet and length | Pass |
| T-12 | validation | Create options whitelisted (incl. `__proto__`) | Pass |
| T-13 | validation | Malformed/replayed inputs rejected | Pass |
| T-14 | validation | Inputs clamped (no speed hack) | Pass |
| T-15 | validation | Rate limiter blocks and refills | Pass |
| T-16 | room | Players spawn alive in open ground at full HP | Pass |
| T-17 | room | Input moves exactly `PLAYER_SPEED × INPUT_DT` | Pass |
| T-18 | room | Duplicate/out-of-order inputs ignored | Pass |
| T-19 | room | Pistol damage and fire rate enforced | Pass |
| T-20 | room | Kill → score, death, respawn after 3 s | Pass |
| T-21 | room | No friendly fire in TDM | Pass |
| T-22 | room | Teams balanced 3 v 3 | Pass |
| T-23 | room | Pickup gives one mag; empty → back to pistol | Pass |
| T-24 | room | Swap toggles pistol/special | Pass |
| T-25 | room | Rocket splash damage | Pass |
| T-26 | room | Grenade waits for fuse then explodes | Pass |
| T-27 | room | Round ends at score limit, restarts clean | Pass |
| T-28 | room | Round ends when timer runs out | Pass |
| T-29 | room | Bots fill to minimum, leave as humans join | Pass |
| T-30 | room | Room refuses humans past 10 | Pass |
| T-41 | room | TDM teams stay balanced as humans replace bots (regression test for a bug found in integration testing) | Pass |
| T-31 | room | Bots fight each other unattended | Pass |
| T-32 | room | Snapshot complete and under 4 KB | Pass |
| T-33 | manager | Create, join by code, leave | Pass |
| T-34 | manager | Room destroyed when last human leaves | Pass |
| T-35 | manager | Unknown codes and practice rooms not joinable | Pass |
| T-36 | manager | One room per player | Pass |
| T-37 | manager | Only public, non-practice rooms listed | Pass |
| T-38 | manager | Quick play joins fullest room or creates one | Pass |
| T-39 | manager | Capacity limit enforced | Pass |
| T-40 | manager | Room codes unique | Pass |

**Result: 41 / 41 passing.**

### Defect found during testing

| ID | Found in | Description | Fix |
|---|---|---|---|
| BUG-01 | Integration test I-01 (TDM, Streets) | When a second human joined a TDM room with bots, teams could end up 3 v 1 because humans were balanced against bots and the wrong bot was removed. | Humans are now balanced against humans; bots switch sides to fill gaps (`Room.rebalanceBotTeams`). Covered by T-41. |

## 4. Traceability matrix

| Requirement | Tests |
|---|---|
| FR-L1 (profile) | T-09, T-10 |
| FR-L2 (public list) | T-37 |
| FR-L3 (quick play) | T-38 |
| FR-L4 / FR-L5 (create/join) | T-11, T-12, T-33, T-35 |
| FR-L6 (practice) | T-35, T-37 |
| FR-G1 (movement) | T-05, T-06, T-17 |
| FR-G2 – FR-G5 (weapons) | T-19, T-23, T-24 |
| FR-G6 (explosives) | T-25, T-26 |
| FR-G7 (HP, respawn) | T-16, T-20 |
| FR-G8 – FR-G10 (modes, rounds) | T-21, T-22, T-27, T-28, T-41 |
| FR-G11 (maps) | T-01, T-03 |
| FR-G12 (bots) | T-29, T-31 |
| FR-G14 (10 players) | T-30 |
| FR-P3 (crossplay) | Integration test I-01 |
| NFR-1 / NFR-2 (authority, validation) | T-13, T-14, T-18 |
| NFR-3 (rate limits) | T-15 |
| NFR-4 (snapshot size) | T-32 |
| NFR-6 (cleanup) | T-34 |

## 5. Integration and manual tests

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| I-01 | Crossplay private match | PC browser (1200×750) creates private match; phone-sized touch browser (844×390) joins with the code | Both in the same room, both visible, bots fill to 4 | Pass |
| I-02 | Practice | Click Practice vs bots | Room with 5 bots, not listed publicly | Pass |
| I-03 | Room cleanup | Close both browsers | `/healthz` reports 0 rooms; log shows `room.closed` | Pass |
| I-04 | Health endpoint | `GET /healthz` | 200 with stats | Pass |
| M-01 | Touch controls | Real phone, landscape | Left stick moves, right stick aims, fires past 60% | To be re-run on target device before demo |

## 6. Known limitations

See [08-maintenance.md](08-maintenance.md#known-limitations).
