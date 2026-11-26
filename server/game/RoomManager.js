import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/constants.js';
import { Room } from './Room.js';
import { BalanceStats } from './BalanceStats.js';

export const ERRORS = {
  ROOM_NOT_FOUND: 'No match found with that code.',
  ROOM_FULL: 'That match is full.',
  SERVER_FULL: 'The server is at capacity. Try again soon.',
  ALREADY_IN_ROOM: 'You are already in a match.',
};

/**
 * Creates, finds and destroys rooms, and tracks which room each player is in.
 * Rooms are destroyed as soon as their last human leaves.
 */
export class RoomManager {
  constructor({ maxRooms = 200, rng = Math.random, now = () => Date.now(), onRoomEvent = () => {}, logger = null } = {}) {
    this.maxRooms = maxRooms;
    this.rng = rng;
    this.now = now;
    this.onRoomEvent = onRoomEvent;
    this.logger = logger;
    this.rooms = new Map();
    this.playerRoom = new Map();
    this.balance = new BalanceStats(); // shared by every room
  }

  generateCode() {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(this.rng() * ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not generate a unique room code');
  }

  createRoom({ mode, map, visibility, bots, practice = false }) {
    if (this.rooms.size >= this.maxRooms) return { error: ERRORS.SERVER_FULL };
    const code = this.generateCode();
    const room = new Room({
      code, mode, mapKey: map,
      visibility: practice ? 'private' : visibility,
      bots: practice || bots,
      minPlayers: practice ? 6 : 4,
      rng: this.rng, now: this.now,
      stats: this.balance,
      onEvent: (type, payload) => {
        if (type === 'roundEnd') this.logger?.info('round.ended', { code, mode, winner: payload.winner, waves: payload.waves });
        this.onRoomEvent(code, type, payload);
      },
    });
    room.practice = practice;
    this.rooms.set(code, room);
    this.logger?.info('room.created', { code, mode, map, visibility: room.visibility, bots: room.botsEnabled, practice });
    return { room };
  }

  join(code, playerId, profile) {
    if (this.playerRoom.has(playerId)) return { error: ERRORS.ALREADY_IN_ROOM };
    const room = this.rooms.get(code);
    if (!room || room.practice) return { error: ERRORS.ROOM_NOT_FOUND };
    if (room.isFull) return { error: ERRORS.ROOM_FULL };
    // Joining by code = joining friends: in team deathmatch you land on the host's team.
    return this.place(room, playerId, profile, { team: room.partyTeam() });
  }

  /** Join the fullest public match with space, or open a new public match with bots. */
  quickPlay(playerId, profile, preferred = {}) {
    if (this.playerRoom.has(playerId)) return { error: ERRORS.ALREADY_IN_ROOM };
    const candidates = [...this.rooms.values()]
      .filter((r) =>
        r.visibility === 'public'
        && !r.practice
        && !r.isFull
        && (!preferred.mode || r.mode === preferred.mode))
      .sort((a, b) => b.humanCount - a.humanCount);
    if (candidates.length) return this.place(candidates[0], playerId, profile);
    const created = this.createRoom({ mode: preferred.mode || 'dm', map: preferred.map || 'field', visibility: 'public', bots: true });
    if (created.error) return created;
    return this.place(created.room, playerId, profile);
  }

  createAndJoin(playerId, profile, options) {
    if (this.playerRoom.has(playerId)) return { error: ERRORS.ALREADY_IN_ROOM };
    const created = this.createRoom(options);
    if (created.error) return created;
    return this.place(created.room, playerId, profile);
  }

  place(room, playerId, profile, opts) {
    const player = room.addHuman(playerId, profile, opts);
    if (!player) return { error: ERRORS.ROOM_FULL };
    this.playerRoom.set(playerId, room.code);
    return { room, player };
  }

  leave(playerId) {
    const code = this.playerRoom.get(playerId);
    if (!code) return null;
    this.playerRoom.delete(playerId);
    const room = this.rooms.get(code);
    if (!room) return null;
    room.removePlayer(playerId);
    if (room.isEmpty) {
      this.rooms.delete(code);
      this.logger?.info('room.closed', { code, lifetimeSec: Math.round((this.now() - room.createdAt) / 1000) });
    }
    return room;
  }

  roomOf(playerId) {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : null;
  }

  listPublic() {
    return [...this.rooms.values()]
      .filter((r) => r.visibility === 'public' && !r.practice)
      .map((r) => r.summary())
      .sort((a, b) => b.players - a.players);
  }

  tickAll(dt) {
    for (const room of this.rooms.values()) {
      try {
        room.tick(dt);
      } catch (err) {
        this.logger?.error('room.tick_failed', { code: room.code, error: err.message });
      }
    }
  }

  stats() {
    let players = 0, bots = 0;
    for (const r of this.rooms.values()) { players += r.humanCount; bots += r.players.size - r.humanCount; }
    return { rooms: this.rooms.size, players, bots };
  }
}
