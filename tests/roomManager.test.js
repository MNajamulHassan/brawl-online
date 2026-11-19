import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager, ERRORS } from '../server/game/RoomManager.js';

const profile = { name: 'P', color: '#f5c542', hat: 0 };

test('create, join by code, and leave', () => {
  const m = new RoomManager();
  const { room } = m.createAndJoin('host', profile, { mode: 'dm', map: 'field', visibility: 'private', bots: false });
  assert.equal(m.join(room.code, 'guest', profile).room, room);
  assert.equal(room.humanCount, 2);
  m.leave('guest');
  assert.equal(room.humanCount, 1);
});

test('room is destroyed when the last human leaves', () => {
  const m = new RoomManager();
  const { room } = m.createAndJoin('host', profile, { mode: 'dm', map: 'field', visibility: 'public', bots: true });
  m.leave('host');
  assert.equal(m.rooms.has(room.code), false);
  assert.equal(m.stats().rooms, 0);
});

test('unknown codes and practice rooms cannot be joined', () => {
  const m = new RoomManager();
  assert.equal(m.join('zzzzz', 'x', profile).error, ERRORS.ROOM_NOT_FOUND);
  const { room } = m.createAndJoin('solo', profile, { mode: 'dm', map: 'field', visibility: 'public', practice: true });
  assert.equal(m.join(room.code, 'x', profile).error, ERRORS.ROOM_NOT_FOUND);
});

test('a player cannot be in two rooms', () => {
  const m = new RoomManager();
  m.createAndJoin('p', profile, { mode: 'dm', map: 'field', visibility: 'public' });
  assert.equal(m.createAndJoin('p', profile, { mode: 'dm', map: 'field', visibility: 'public' }).error, ERRORS.ALREADY_IN_ROOM);
});

test('only public, non-practice rooms are listed', () => {
  const m = new RoomManager();
  m.createAndJoin('a', profile, { mode: 'dm', map: 'field', visibility: 'public' });
  m.createAndJoin('b', profile, { mode: 'tdm', map: 'streets', visibility: 'private' });
  m.createAndJoin('c', profile, { mode: 'dm', map: 'field', visibility: 'public', practice: true });
  const list = m.listPublic();
  assert.equal(list.length, 1);
  assert.equal(list[0].mode, 'dm');
});

test('quick play joins the fullest public room, or creates one', () => {
  const m = new RoomManager();
  const first = m.quickPlay('a', profile).room;
  assert.equal(first.visibility, 'public');
  const second = m.quickPlay('b', profile).room;
  assert.equal(second, first);
});

test('server refuses new rooms at capacity', () => {
  const m = new RoomManager({ maxRooms: 1 });
  m.createAndJoin('a', profile, { mode: 'dm', map: 'field', visibility: 'public' });
  assert.equal(m.createAndJoin('b', profile, { mode: 'dm', map: 'field', visibility: 'public' }).error, ERRORS.SERVER_FULL);
});

test('room codes are unique', () => {
  const m = new RoomManager();
  const codes = new Set();
  for (let i = 0; i < 100; i++) codes.add(m.createAndJoin(`p${i}`, profile, { mode: 'dm', map: 'field', visibility: 'private' }).room.code);
  assert.equal(codes.size, 100);
});
