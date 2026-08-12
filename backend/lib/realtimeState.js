import crypto from 'crypto';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const compatible = (left, right) => (
  left.preferredRole === 'Random' || right.preferredRole === 'Random' || left.preferredRole !== right.preferredRole
);

export const createRealtimeCoordinator = async ({ io, redisUrl = process.env.REDIS_URL } = {}) => {
  const instanceId = process.env.INSTANCE_ID || crypto.randomUUID();
  if (!redisUrl) {
    return {
      enabled: false,
      instanceId,
      saveRoom: async () => {},
      loadRoom: async () => null,
      deleteRoom: async () => {},
      matchmake: async () => null,
      removeQueuedSocket: async () => 0,
      acquireTimerLease: async () => true,
      renewTimerLease: async () => true,
      releaseTimerLease: async () => {},
      setPresence: async () => {},
      removePresence: async () => {},
      setSocketRoom: async () => {},
      getSocketRoom: async () => null,
      clearSocketRoom: async () => {},
      ping: async () => true,
      health: () => ({ mode: 'single-instance', connected: false }),
    };
  }

  const state = createClient({ url: redisUrl });
  const publisher = state.duplicate();
  const subscriber = state.duplicate();
  for (const client of [state, publisher, subscriber]) {
    client.on('error', error => console.error('[Redis Realtime]', error.message));
  }
  await Promise.all([state.connect(), publisher.connect(), subscriber.connect()]);
  io.adapter(createAdapter(publisher, subscriber));

  const roomKey = roomId => `arena:room:${roomId}`;
  const queueKey = topicId => `arena:queue:${topicId}`;
  const leaseKey = roomId => `arena:timer:${roomId}`;
  const socketRoomKey = socketId => `arena:socket-room:${socketId}`;

  const saveRoom = async (roomId, room) => {
    if (!roomId || !room) return;
    await state.set(roomKey(roomId), JSON.stringify({ ...room, persistedAt: Date.now() }), { EX: 60 * 60 * 3 });
  };

  const loadRoom = async (roomId) => {
    const value = await state.get(roomKey(roomId));
    return value ? JSON.parse(value) : null;
  };

  const matchmake = async (topicId, player) => {
    const key = queueKey(topicId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await state.watch(key);
      const rawPlayers = await state.lRange(key, 0, -1);
      const selectedRaw = rawPlayers.find(raw => {
        try {
          const waiting = JSON.parse(raw);
          return waiting.socketId !== player.socketId && compatible(waiting, player);
        } catch {
          return false;
        }
      });
      const transaction = state.multi();
      if (selectedRaw) transaction.lRem(key, 1, selectedRaw);
      else transaction.rPush(key, JSON.stringify(player));
      transaction.expire(key, 60 * 15);
      const result = await transaction.exec();
      if (result !== null) return selectedRaw ? JSON.parse(selectedRaw) : null;
    }
    throw new Error('Distributed matchmaking contention exceeded retry limit');
  };

  const removeQueuedSocket = async (socketId) => {
    let removed = 0;
    for await (const key of state.scanIterator({ MATCH: 'arena:queue:*', COUNT: 100 })) {
      const players = await state.lRange(key, 0, -1);
      for (const raw of players) {
        try {
          if (JSON.parse(raw).socketId === socketId) removed += await state.lRem(key, 0, raw);
        } catch {
          removed += await state.lRem(key, 0, raw);
        }
      }
    }
    return removed;
  };

  const acquireTimerLease = async (roomId) => (
    (await state.set(leaseKey(roomId), instanceId, { NX: true, PX: 5000 })) === 'OK' || (await state.get(leaseKey(roomId))) === instanceId
  );
  const renewTimerLease = async (roomId) => {
    if ((await state.get(leaseKey(roomId))) !== instanceId) return false;
    await state.pExpire(leaseKey(roomId), 5000);
    return true;
  };
  const releaseTimerLease = async (roomId) => {
    if ((await state.get(leaseKey(roomId))) === instanceId) await state.del(leaseKey(roomId));
  };

  return {
    enabled: true,
    instanceId,
    saveRoom,
    loadRoom,
    deleteRoom: async roomId => { await state.del(roomKey(roomId), leaseKey(roomId)); },
    matchmake,
    removeQueuedSocket,
    acquireTimerLease,
    renewTimerLease,
    releaseTimerLease,
    setPresence: async (userId, socketId) => {
      if (!userId || !socketId) return;
      await state.hSet(`arena:presence:${userId}`, socketId, JSON.stringify({ instanceId, connectedAt: Date.now() }));
      await state.expire(`arena:presence:${userId}`, 60 * 60);
    },
    removePresence: async (userId, socketId) => { if (userId && socketId) await state.hDel(`arena:presence:${userId}`, socketId); },
    setSocketRoom: async (socketId, roomId) => {
      if (socketId && roomId) await state.set(socketRoomKey(socketId), roomId, { EX: 60 * 60 * 3 });
    },
    getSocketRoom: async socketId => (socketId ? state.get(socketRoomKey(socketId)) : null),
    clearSocketRoom: async socketId => { if (socketId) await state.del(socketRoomKey(socketId)); },
    ping: async () => (await state.ping()) === 'PONG',
    health: () => ({ mode: 'redis-distributed', connected: state.isReady, instanceId }),
  };
};
