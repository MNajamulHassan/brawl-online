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
| Tune a weapon (damage, fire rate, ammo) | `shared/constants.js` → `WEAPONS` |
| Change round length or score limits | `shared/constants.js` → `ROUND_MS`, `MODES` |
| Add a map | Add a 22-row half-map to `HALF_MAPS` in `shared/maps.js`, add its name to `MAPS` in `constants.js`, add a look in `renderer.js` |
| Add a weapon | Add to `WEAPONS`, add a pickup letter in `maps.js`, handle any new behaviour in `Room.tryFire` |
| Change bot difficulty | `server/game/BotBrain.js` → `REACTION_TIME`, `SIGHT_RANGE`, aim wobble |

Because `shared/` is used by both client and server, a tuning change applies everywhere after one redeploy.

## Known limitations

| # | Limitation | Impact | Planned fix |
|---|---|---|---|
| L1 | No lag compensation for hits | Players with high ping need to lead their shots a little more | Server-side rewind of target positions |
| L2 | Single server process; rooms live in memory | A restart ends running matches; one instance caps concurrency | Socket.IO Redis adapter + sticky sessions for horizontal scaling |
| L3 | Free hosting sleeps when idle | 30–60 s first load | Paid instance or uptime ping |
| L4 | No accounts or persistent stats | Scores reset every round | Add auth + PostgreSQL for profiles and leaderboards |
| L5 | No chat or reporting | Limited social features | Quick-chat presets, player reporting |
| L6 | Browser tests are run manually | Regressions in the UI could slip | Add Playwright to CI |

## Roadmap

| Version | Planned |
|---|---|
| 1.1 | Sound effects, mobile auto-aim assist, more maps |
| 1.2 | Lag compensation, Playwright tests in CI |
| 2.0 | Accounts, persistent stats, global leaderboard, horizontal scaling |
