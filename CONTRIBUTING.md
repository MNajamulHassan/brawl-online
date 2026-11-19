# Contributing

1. Fork and clone, then `npm install`.
2. Create a branch: `git checkout -b feature/short-name`.
3. Run the server with auto-reload: `npm run dev` (http://localhost:3000).
4. Add or update tests in `tests/` and run `npm test`.
5. Commit with a [Conventional Commit](https://www.conventionalcommits.org) message, e.g. `feat: add sniper rifle pickup`.
6. Open a pull request. CI must pass.

## Code guidelines

- Game rules belong on the server (`server/game/`) or in `shared/`. The client must never decide damage, health, ammo or score.
- Anything both sides need (constants, maps, physics) goes in `shared/` so it exists once.
- Treat every client payload as untrusted: validate it in `server/game/validation.js`.
- `Room` must not import sockets; communicate through `onEvent`.
- Escape any user-provided text before putting it into HTML.
