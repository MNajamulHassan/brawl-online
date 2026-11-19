import { RateLimiter } from '../game/RateLimiter.js';
import { sanitizeProfile, parseRoomCode, parseCreateOptions, parseInput } from '../game/validation.js';

const LOBBY = 'lobby';
const roomChannel = (code) => `room:${code}`;

/**
 * Wires Socket.IO events to the RoomManager.
 *
 * Client -> server:  profile:set, lobby:list, match:quick, match:create,
 *                    match:join, match:practice, match:leave, input
 * Server -> client:  lobby:update, match:joined, state, event
 * See docs/04-api-reference.md for payloads.
 */
export function registerSocketHandlers(io, manager, logger) {
  io.on('connection', (socket) => {
    const actions = new RateLimiter(10, 2); // lobby actions
    const inputs = new RateLimiter(60, 40); // input packets (30/s expected)
    let profile = sanitizeProfile({});
    socket.join(LOBBY);
    logger.debug('socket.connected', { id: socket.id });

    const reply = (ack, payload) => { if (typeof ack === 'function') ack(payload); };
    const guarded = (handler) => (payload, ack) => {
      if (typeof payload === 'function') { ack = payload; payload = undefined; }
      if (!actions.take()) return reply(ack, { ok: false, error: 'Slow down a little.' });
      try {
        handler(payload, ack);
      } catch (err) {
        logger.error('socket.handler_failed', { id: socket.id, error: err.message });
        reply(ack, { ok: false, error: 'Something went wrong.' });
      }
    };

    const enterRoom = (result, ack) => {
      if (result.error) return reply(ack, { ok: false, error: result.error });
      const { room } = result;
      socket.leave(LOBBY);
      socket.join(roomChannel(room.code));
      const info = { ok: true, code: room.code, mode: room.mode, map: room.mapKey, visibility: room.visibility, practice: !!room.practice, you: socket.id };
      reply(ack, info);
      socket.emit('match:joined', info);
      broadcastLobby();
    };

    socket.on('profile:set', guarded((p, ack) => {
      profile = sanitizeProfile(p);
      reply(ack, { ok: true, profile });
    }));

    socket.on('lobby:list', guarded((_p, ack) => reply(ack, { ok: true, matches: manager.listPublic() })));

    socket.on('match:quick', guarded((p, ack) => {
      const opts = parseCreateOptions(p);
      enterRoom(manager.quickPlay(socket.id, profile, opts), ack);
    }));

    socket.on('match:create', guarded((p, ack) => {
      enterRoom(manager.createAndJoin(socket.id, profile, parseCreateOptions(p)), ack);
    }));

    socket.on('match:practice', guarded((p, ack) => {
      const opts = parseCreateOptions(p);
      enterRoom(manager.createAndJoin(socket.id, profile, { ...opts, practice: true }), ack);
    }));

    socket.on('match:join', guarded((p, ack) => {
      const code = parseRoomCode(p && p.code);
      if (!code) return reply(ack, { ok: false, error: 'Codes are 5 letters or numbers.' });
      enterRoom(manager.join(code, socket.id, profile), ack);
    }));

    const leave = () => {
      const room = manager.leave(socket.id);
      if (room) {
        socket.leave(roomChannel(room.code));
        socket.join(LOBBY);
        broadcastLobby();
      }
    };
    socket.on('match:leave', guarded((_p, ack) => { leave(); reply(ack, { ok: true }); }));

    socket.on('input', (raw) => {
      if (!inputs.take()) return;
      const room = manager.roomOf(socket.id);
      if (!room) return;
      const player = room.players.get(socket.id);
      if (!player) return;
      const input = parseInput(raw, player.lastSeq);
      if (input) room.queueInput(socket.id, input);
    });

    const pings = new RateLimiter(3, 1);
    socket.on('latency', (ack) => { if (typeof ack === 'function' && pings.take()) ack(); });

    socket.on('disconnect', (reason) => {
      leave();
      logger.debug('socket.disconnected', { id: socket.id, reason });
    });
  });

  let lastLobbyJson = '';
  function broadcastLobby(force = false) {
    const matches = manager.listPublic();
    const json = JSON.stringify(matches);
    if (!force && json === lastLobbyJson) return;
    lastLobbyJson = json;
    io.to(LOBBY).emit('lobby:update', { matches, online: io.engine.clientsCount });
  }

  /** Called by the room manager whenever something happens inside a room. */
  function onRoomEvent(code, type, payload) {
    io.to(roomChannel(code)).emit('event', { type, ...payload });
  }

  return { broadcastLobby, onRoomEvent };
}
