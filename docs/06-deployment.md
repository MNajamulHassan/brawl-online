# 06 · Deployment Guide

Maze Brawl is a single Node.js process that serves both the website and the WebSocket game server. Any host that runs Node 20+ and supports WebSockets works. The recommended free option is **Render**.

## 1. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port (hosts like Render set this automatically) |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | `production` enables static file caching |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `MAX_ROOMS` | `200` | Room cap |
| `MAX_CONNECTIONS` | `1000` | Socket connection cap |
| `CORS_ORIGIN` | unset | Comma-separated origins allowed when the client is served from a different domain (e.g. Netlify) |

## 2. Deploy to Render (recommended, free)

1. Push the project to a GitHub repository.
2. Sign in to [render.com](https://render.com) with GitHub.
3. **New → Blueprint**, pick the repository. Render reads `render.yaml` and creates the `maze-brawl` web service.
   - Or **New → Web Service** manually: Runtime *Node*, Build `npm ci --omit=dev`, Start `npm start`, Health check path `/healthz`, Instance type *Free*.
4. Wait for the first deploy (2–4 minutes). Your URL looks like `https://maze-brawl-xxxx.onrender.com`.
5. Every push to `main` redeploys automatically.

> **Free tier note:** the service sleeps after 15 minutes without traffic, and the first visit after that takes about 30–60 seconds to wake it. Open the URL a minute before a demo.

## 3. Deploy with Docker (any cloud / VPS)

```bash
docker build -t maze-brawl .
docker run -d -p 3000:3000 -e NODE_ENV=production --name maze-brawl maze-brawl
curl http://localhost:3000/healthz
```

The image runs as the non-root `node` user and includes a `HEALTHCHECK`.

## 4. Netlify (static client) + Render (game server)

Netlify only serves static files, so it hosts the **client** while the game server stays on Render.

1. Deploy the server to Render (§2). Note its URL, e.g. `https://maze-brawl-xxxx.onrender.com`.
2. On Netlify, import the repository. `netlify.toml` already sets the build (`npm run build:static`) and the publish folder (`dist`).
3. `netlify.toml` sets `GAME_SERVER_URL` to the Render URL. If yours differs, override it in Netlify → *Site configuration → Environment variables* and redeploy.
   Or from a terminal: `GAME_SERVER_URL=https://… npm run build:static && npx netlify-cli deploy --prod --dir dist`.
4. On Render, set `CORS_ORIGIN` to the Netlify URL (e.g. `https://maze-brawl.netlify.app`).

`scripts/build-static.js` copies `public/` and `shared/` into `dist/`, bundles the Socket.IO client, writes the server URL into a `<meta name="game-server">` tag, and emits a `_headers` file whose Content-Security-Policy only allows connections to that server. The build fails if `GAME_SERVER_URL` is missing.

## 5. Other hosts

| Host | Notes |
|---|---|
| Railway | New project → Deploy from GitHub; start command `npm start` |
| Fly.io | `fly launch` detects the Dockerfile |
| VPS (Ubuntu) | Install Node 20+, `npm ci --omit=dev`, run with `pm2 start server/index.js --name maze-brawl`, put Nginx in front with WebSocket upgrade headers |

Static-only hosts (GitHub Pages, Netlify, Vercel static) **cannot** run the game server on their own; use the split setup in §4.

## 6. Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:
1. `npm ci`
2. `npm test` on Node 20 and 22
3. Boots the server and checks `/healthz`

## 7. Monitoring

- **Health:** `GET /healthz` (Render uses it to restart unhealthy instances).
- **Logs:** one JSON object per line, e.g.
  `{"time":"…","level":"info","msg":"room.created","code":"2n9ms","mode":"dm",…}`
- **Events logged:** `server.started`, `server.stopping`, `room.created`, `room.closed`, `room.tick_failed`, `socket.handler_failed`.

## 8. Release checklist

- [ ] `npm test` green
- [ ] CI green on `main`
- [ ] `CHANGELOG.md` updated and version bumped in `package.json`
- [ ] Tag the release: `git tag v1.0.0 && git push --tags`
- [ ] After deploy: open the URL on a PC and a phone, create a private match, join with the code
