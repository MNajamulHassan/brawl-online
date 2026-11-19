import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { config } from './config.js';
import { createLogger } from './logger.js';
import { RoomManager } from './game/RoomManager.js';
import { registerSocketHandlers } from './net/socketHandlers.js';
import { TICK_RATE, SNAPSHOT_RATE } from '../shared/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logger = createLogger(config.logLevel);
const startedAt = Date.now();

/* ------------------------------------------------------------- HTTP */
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:");
  next();
});
app.use(express.static(path.join(root, 'public'), { maxAge: config.env === 'production' ? '1h' : 0 }));
app.use('/shared', express.static(path.join(root, 'shared'), { maxAge: config.env === 'production' ? '1h' : 0 }));

let manager;
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptimeSec: Math.round((Date.now() - startedAt) / 1000), ...manager.stats() });
});
app.get('/api/matches', (_req, res) => res.json({ matches: manager.listPublic() }));
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const server = http.createServer(app);

/* ---------------------------------------------------------- Sockets */
const io = new Server(server, {
  cors: config.corsOrigin ? { origin: config.corsOrigin } : undefined,
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 10000,
  pingTimeout: 8000,
});
io.use((_socket, next) => {
  if (io.engine.clientsCount > config.maxConnections) return next(new Error('Server full'));
  next();
});

let handlers;
manager = new RoomManager({
  maxRooms: config.maxRooms,
  logger,
  onRoomEvent: (code, type, payload) => handlers.onRoomEvent(code, type, payload),
});
handlers = registerSocketHandlers(io, manager, logger);

/* -------------------------------------------------------- Game loop */
// Fixed-timestep simulation: rooms always advance in 1/TICK_RATE steps,
// independent of timer jitter, so every room behaves the same on any host.
const STEP_MS = 1000 / TICK_RATE;
const SNAPSHOT_EVERY = Math.max(1, Math.round(TICK_RATE / SNAPSHOT_RATE));
let accumulator = 0;
let last = performance.now();
let tickCount = 0;

const loop = setInterval(() => {
  const t = performance.now();
  accumulator += Math.min(250, t - last); // avoid spiral of death after a stall
  last = t;
  while (accumulator >= STEP_MS) {
    manager.tickAll(STEP_MS / 1000);
    accumulator -= STEP_MS;
    if (++tickCount % SNAPSHOT_EVERY === 0) sendSnapshots();
  }
}, STEP_MS / 2);

function sendSnapshots() {
  for (const room of manager.rooms.values()) {
    const snap = room.buildSnapshot();
    for (const p of room.players.values()) {
      if (p.isBot) continue;
      io.to(p.id).volatile.emit('state', { ...snap, ack: p.lastSeq });
    }
  }
}

const lobbyTimer = setInterval(() => handlers.broadcastLobby(true), 3000);

/* ---------------------------------------------------------- Startup */
server.listen(config.port, config.host, () => {
  logger.info('server.started', { port: config.port, env: config.env, tickRate: TICK_RATE, snapshotRate: SNAPSHOT_RATE });
});

function shutdown(signal) {
  logger.info('server.stopping', { signal });
  clearInterval(loop);
  clearInterval(lobbyTimer);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error('process.unhandled_rejection', { error: String(err) }));
