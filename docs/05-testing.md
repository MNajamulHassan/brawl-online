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
| T-42 | features | XP: level-up opens a 3-card draft of distinct skills | Pass |
| T-43 | features | XP from damage, kills and assists | Pass |
| T-44 | features | Pick a card with input `pick` | Pass |
| T-45 | features | Draft auto-picks after 5 s | Pass |
| T-46 | features | Several level-ups queue one draft each | Pass |
| T-47 | features | Maxed skills never offered | Pass |
| T-48 | features | Skills kept through death, reset with the round | Pass |
| T-49 | features | Passives: Swift speed, Tough max HP, Life steal | Pass |
| T-50 | features | Piercing bullets hit two targets | Pass |
| T-51 | features | Ricochet bullets bounce off walls | Pass |
| T-52 | features | Buckshot pellets; Finale explosive shot | Pass |
| T-53 | features | Active skill on E, cooldown, shield blocks damage | Pass |
| T-54 | features | Dash, Blink move; Turret shoots enemies | Pass |
| T-55 | features | TDM: lethal hit downs instead of kills | Pass |
| T-56 | features | Teammate revives at 50% HP after 3 s | Pass |
| T-57 | features | No revive: death, kill credited to the enemy | Pass |
| T-58 | features | Deathmatch has no downed state | Pass |
| T-59 | features | Both maps have crate spawns | Pass |
| T-60 | features | Crates break, give XP, drop loot, respawn | Pass |
| T-61 | features | Bullets break crates | Pass |
| T-62 | features | Loot: health, armour absorbs first, XP orb, weapon | Pass |
| T-63 | features | Big mags increases pickup ammo | Pass |
| T-64 | features | Code joiners land on the host's team, bots balance | Pass |
| T-65 | features | Full party side sends extras to the other team | Pass |
| T-66 | features | Waves: one human team, waves spawn after the break | Pass |
| T-67 | features | Waves: clear → next wave tougher; dead bots removed | Pass |
| T-68 | features | Waves: run ends when all down; score = waves cleared | Pass |
| T-69 | features | Balance stats: shots, damage, kills, pick and win rate | Pass |
| T-70 | features | All rooms share one stats instance | Pass |
| T-71 | features | Admin check: exact bearer token, off when unset | Pass |
| T-72 | features | Input validation of `pick` and `ability` | Pass |
| T-73 | features | Draft is private, not in the shared snapshot | Pass |

| T-74 | settings | First load gives the defaults | Pass |
| T-75 | settings | Save/load round trip keeps settings and binds | Pass |
| T-76 | settings | Blocked storage falls back to defaults without throwing | Pass |
| T-77 | settings | Corrupt or hostile stored data ignored field by field | Pass |
| T-78 | settings | Conflicting rebind reports the conflict and changes nothing | Pass |
| T-79 | settings | Swap on conflict gives the other action the old key | Pass |
| T-80 | settings | Re-binding a key to its own slot is not a conflict | Pass |
| T-81 | settings | Alternate bindings both trigger the action | Pass |
| T-82 | settings | Invalid slots, actions and codes refused | Pass |
| T-83 | settings | Reset puts one tab back; defaults never mutated | Pass |
| T-84 | settings | Help labels show the current binds | Pass |

**Result: 84 / 84 passing** (41 original, 32 v1.1 feature tests in `tests/features.test.js`, 11 v1.2 settings/keybind tests in `tests/settings.test.js`).

### Defect found during testing

| ID | Found in | Description | Fix |
|---|---|---|---|
| BUG-01 | Integration test I-01 (TDM, Streets) | When a second human joined a TDM room with bots, teams could end up 3 v 1 because humans were balanced against bots and the wrong bot was removed. | Humans are now balanced against humans; bots switch sides to fill gaps (`Room.rebalanceBotTeams`). Covered by T-41. |
| BUG-02 | T-67 (v1.1) | In Bot waves, enemy bots were *downed* instead of killed, so a wave could never be cleared. | Only players who can be revived are downed; enemy wave bots die and are removed. |
| BUG-04 | I-09 (v1.2) | On a 375 px phone the settings dialog was wider than the screen: Close and the checkboxes were cut off. | The dialog's grid track is now `minmax(0,1fr)` and checkboxes use column 2 on narrow screens. |
| BUG-05 | I-10 (v1.2) | The movable Scores button defaulted to the top-right corner, under the kill feed. | Scores stays in the top bar; the layout editor covers the sticks and Swap/Skill/Fire. |
| BUG-03 | T-64 (v1.1) | A 4-friend party on one TDM team with bots enabled left the other team empty, because bots only filled up to the minimum player count. | With bots on, bots now also fill the gap between the two teams' human counts. |

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
| FR-U9 | T-74 |
| FR-U9 | T-75 |
| FR-U9 | T-76 |
| FR-U9 | T-77 |
| FR-U6 | T-78 |
| FR-U6 | T-79 |
| FR-U5 | T-80 |
| FR-U5 | T-81 |
| FR-U5 | T-82 |
| FR-U8 | T-83 |
| FR-U10 | T-84 |
| FR-U1 – FR-U4, FR-U7, FR-U11 – FR-U15 | I-08 – I-14 (browser checks; settings UI is DOM code without unit tests) |
| FR-S2, FR-S3 | T-42 |
| FR-S1 | T-43 |
| FR-S3 | T-44 |
| FR-S3 | T-45 |
| FR-S3 | T-46 |
| FR-S5 | T-47 |
| FR-S2, FR-S5 | T-48 |
| FR-S4 | T-49 |
| FR-S4 | T-50 |
| FR-S4 | T-51 |
| FR-S4 | T-52 |
| FR-S6 | T-53 |
| FR-S4, FR-S6 | T-54 |
| FR-R1 | T-55 |
| FR-R2 | T-56 |
| FR-R3 | T-57 |
| FR-R1 | T-58 |
| FR-C1 | T-59 |
| FR-C1 – FR-C3 | T-60 |
| FR-C1 | T-61 |
| FR-C2 | T-62 |
| FR-S4 | T-63 |
| FR-Q1 | T-64 |
| FR-Q1 | T-65 |
| FR-W1, FR-W2 | T-66 |
| FR-W2 | T-67 |
| FR-W3, FR-W4 | T-68 |
| FR-B2 | T-69 |
| FR-B2 | T-70 |
| FR-B3 | T-71 |
| NFR-2 | T-72 |
| NFR-2 | T-73 |

## 5. Integration and manual tests

| ID | Scenario | Steps | Expected | Result |
|---|---|---|---|---|
| I-01 | Crossplay private match | PC browser (1200×750) creates private match; phone-sized touch browser (844×390) joins with the code | Both in the same room, both visible, bots fill to 4 | Pass |
| I-02 | Practice | Click Practice vs bots | Room with 5 bots, not listed publicly | Pass |
| I-03 | Room cleanup | Close both browsers | `/healthz` reports 0 rooms; log shows `room.closed` | Pass |
| I-04 | Health endpoint | `GET /healthz` | 200 with stats | Pass |
| I-05 | Bot waves in the browser | Select Bot waves → Practice vs bots | Wave banner, crates and XP bar shown; run ends with "Run over · Survived N waves"; no console errors | Pass |
| I-06 | HUD for v1.1 | Render the HUD with a draft open, a downed teammate, armour and an active skill | Three skill cards with 1/2/3 and auto-pick timer, teammate shown as down, cooldown on the skill button | Pass |
| I-07 | Admin endpoint | `GET /api/balance` without `ADMIN_TOKEN` set | 404 | Pass |
| I-08 | First visit and tutorial | Clear storage, reload; Start tutorial; play every step (UI for steps 1–2, scripted inputs on the same module for 3–7) | Welcome card once; each step ticks off in order; tips use the current keys; ends on "You're ready!" | Pass |
| I-09 | Settings on a phone (375×812) | Open settings, Gameplay tab; turn auto-fire off; start practice | Dialog fits the screen; Fire button appears on touch | Pass (after BUG-04 fix) |
| I-10 | Rebind with conflict | Controls tab: set Swap to E | "E is already used for Use skill. Swap?" → Swap: Swap=E, Use skill=Q, saved, help line and lobby card update | Pass |
| I-11 | Touch layout editor | Drag Skill button, press Bigger, Done | Position and size saved and applied to the in-game button | Pass |
| I-12 | Leave confirmation | Leave → Stay | Still in the match | Pass |
| I-13 | Server offline | Static build pointed at a dead server | Loading screen says the server is offline, shows Retry and offline tutorial | Pass |
| I-14 | UI scale and About | UI scale 120%, start practice; open About | HUD 1.2× larger; About shows version 1.2.0 and the GitHub link | Pass |
| M-03 | Real phone check for v1.2 | Settings, layout editor, fixed sticks, tutorial with touch | Works with real thumbs | To be run on target device before demo |
| M-02 | Skill cards on touch | Real phone: level up, tap a card; tap the skill button | Card is picked; ability fires | To be run on target device before demo |
| M-01 | Touch controls | Real phone, landscape | Left stick moves, right stick aims, fires past 60% | To be re-run on target device before demo |

## 6. Known limitations

See [08-maintenance.md](08-maintenance.md#known-limitations).
