/**
 * Builds the browser client as a static site in dist/ for hosts like Netlify.
 * The game server still runs separately (e.g. on Render); its URL is baked in
 * from GAME_SERVER_URL. See docs/06-deployment.md §4.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const serverUrl = (process.env.GAME_SERVER_URL || '').trim().replace(/\/+$/, '');

if (!/^https?:\/\/[^\s"'<>]+$/.test(serverUrl)) {
  console.error('GAME_SERVER_URL must be set to the game server, e.g. https://maze-brawl.onrender.com');
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
cpSync(path.join(root, 'public'), dist, { recursive: true });
cpSync(path.join(root, 'shared'), path.join(dist, 'shared'), { recursive: true });

// Same path the Node server uses, so index.html needs no changes.
const require = createRequire(import.meta.url);
const clientDist = path.join(path.dirname(require.resolve('socket.io/package.json')), 'client-dist');
mkdirSync(path.join(dist, 'socket.io'), { recursive: true });
cpSync(path.join(clientDist, 'socket.io.min.js'), path.join(dist, 'socket.io', 'socket.io.js'));

const indexPath = path.join(dist, 'index.html');
const html = readFileSync(indexPath, 'utf8')
  .replace('<meta name="game-server" content="">', `<meta name="game-server" content="${serverUrl}">`);
writeFileSync(indexPath, html);

const wsUrl = serverUrl.replace(/^http/, 'ws');
writeFileSync(path.join(dist, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: SAMEORIGIN
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ${serverUrl} ${wsUrl}; img-src 'self' data:
`);

console.log(`Static client built in dist/ (game server: ${serverUrl})`);
