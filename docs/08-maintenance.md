# 08 · Maintenance and Roadmap

## Versioning

[Semantic Versioning](https://semver.org): `MAJOR.MINOR.PATCH`. Changes are recorded in [CHANGELOG.md](../CHANGELOG.md).

## Branching

- `main` is always deployable; Render deploys it automatically.
- Work on `feature/<name>` or `fix/<name>` branches and open a pull request; CI must pass before merging.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).

## Common changes

| Task | Where |
|---|---|
| Tune a weapon (damage, fire rate, ammo) | `shared/balance.js` → `WEAPONS` (then log it in `BALANCE_CHANGELOG.md`) |
| Tune a skill, XP, crates, revives or waves | `shared/balance.js` → `SKILLS`, `XP`, `CRATES`, `REVIVE`, `WAVES` |
| Add a skill | Add it to `SKILLS` in `balance.js`, implement its effect in `server/game/Skills.js` (stat) or `Room.useAbility` (active), add a test |
| Change round length or score limits | `shared/constants.js` → `ROUND_MS`, `MODES` |
| Add a map | Add a 22-row half-map to `HALF_MAPS` in `shared/maps.js`, add its name to `MAPS` in `constants.js`, add a look in `renderer.js` |
| Add a weapon | Add to `WEAPONS`, add a pickup letter in `maps.js`, handle any new behaviour in `Room.tryFire` |
| Change bot difficulty | `server/game/BotBrain.js` → `REACTION_TIME`, `SIGHT_RANGE`, aim wobble |

Because `shared/` is used by both client and server, a tuning change applies everywhere after one redeploy.

## Balancing workflow

1. Set `ADMIN_TOKEN` (a long random string) where the server runs and restart it.
2. Let people play, then read the numbers:
   `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<host>/api/balance`
   (stats reset on restart; older snapshots are in the logs as `balance.stats`, every 5 minutes).
3. Look for outliers: a skill with a pick rate far above the others, or a win rate well over 50% with enough rounds behind it, is probably overpowered. A weapon with many pickups but few kills is probably weak.
4. Change the number in `shared/balance.js`, run `npm test`, and add a row to `BALANCE_CHANGELOG.md` saying what changed, from what, to what, and why (quote the stat).
5. Bump the patch version, deploy, and compare the next batch of stats.

## Known limitations

| # | Limitation | Impact | Planned fix |
|---|---|---|---|
| L1 | No lag compensation for hits | Players with high ping need to lead their shots a little more | Server-side rewind of target positions |
| L2 | Single server process; rooms live in memory | A restart ends running matches; one instance caps concurrency | Socket.IO Redis adapter + sticky sessions for horizontal scaling |
| L3 | Free hosting sleeps when idle | 30–60 s first load | Paid instance or uptime ping |
| L4 | No accounts or persistent stats | Scores reset every round | Add auth + PostgreSQL for profiles and leaderboards |
| L5 | No chat or reporting | Limited social features | Quick-chat presets, player reporting |
| L6 | Browser tests are run manually | Regressions in the UI could slip | Add Playwright to CI |
| L7 | Balance stats live in memory | Restart clears `/api/balance`; only periodic log lines remain | Persist to a database |
| L8 | Best Bot waves score is per browser | Clearing site data or switching device loses it | Accounts + server-side leaderboard |
| L9 | Turrets cannot be destroyed; crates block bullets but not movement | Simplified rules | Revisit after playtesting |

## Roadmap

| Version | Planned |
|---|---|
| 1.1 | ✅ XP and skill draft, team revives, loot crates, party teams, Bot waves, game feel, live balancing |
| 1.1.x | Mobile auto-aim assist, more maps, original zombie-style variant of Bot waves |
| 1.2 | Lag compensation, Playwright tests in CI |
| 2.0 | Accounts, persistent stats, global leaderboard, horizontal scaling |
