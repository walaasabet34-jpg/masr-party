// HTTP + WebSocket server. One process holds every room in memory.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import { Room, META } from './room.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
const PORT = Number(process.env.PORT) || 8787;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;

const rooms = new Map();
const conns = new Set();

function newCode() {
  for (let i = 0; i < 1000; i++) {
    const c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    if (!rooms.has(c)) return c;
  }
  throw new Error('no codes left');
}

// ------------------------------------------------------------------ static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, version: '0.3.0', cards: 'egyptian-basra', scoring: 'points', rooms: rooms.size, uptime: Math.round(process.uptime()) }));
  }
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json' });
    // LAN addresses let a big screen opened on localhost print a QR that phones can reach.
    const lanUrls = Object.values(networkInterfaces())
      .flat()
      .filter((n) => n && n.family === 'IPv4' && !n.internal)
      .map((n) => `http://${n.address}:${PORT}`);
    return res.end(JSON.stringify({ games: META, lanUrls }));
  }
  let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(ROOT, 'index.html');
  }
  try {
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('ابني الواجهة الأول: npm run build');
  }
});

// ------------------------------------------------------------------ sockets
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });

function send(c, obj) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(obj));
}

function push(room) {
  const now = Date.now();
  for (const c of conns) if (c.room === room) send(c, { t: 'room:state', a: [room.snapshot(c, now)] });
  room.sentVersion = room.version;
}

function closeRoom(room, reason) {
  for (const c of conns) {
    if (c.room !== room) continue;
    send(c, { t: 'room:closed', a: [reason] });
    c.room = null;
  }
  rooms.delete(room.code);
}

function wireChat(room) {
  if (room.onChat) return;
  room.onChat = (m) => {
    for (const c of conns) if (c.room === room) send(c, { t: 'chat:msg', a: [m] });
  };
}

function bind(c, room, role, playerId = null) {
  wireChat(room);
  if (c.room && c.room !== room && c.role === 'player') c.room.setConnected(c.playerId, false);
  c.room = room;
  c.role = role;
  c.playerId = playerId;
  if (playerId) room.setConnected(playerId, true);
  // full history for whoever (re)joins, sent right after the join reply (see the dispatcher);
  // the client merges by id, so nothing shows twice
  c.needsHistory = true;
}

const handlers = {
  'room:peek'(c, { code } = {}) {
    const r = rooms.get(String(code ?? '').toUpperCase());
    if (!r) return { ok: false, error: 'room_not_found' };
    return { ok: true, code: r.code, format: r.settings.format, phase: r.phase, players: r.players.map((p) => ({ name: p.name, color: p.color, sticker: p.sticker })), locked: r.settings.locked };
  },
  'room:create'(c, info = {}) {
    const code = newCode();
    const room = new Room(code, info);
    rooms.set(code, room);
    const { player } = room.addPlayer(info, { asHost: true });
    bind(c, room, 'player', player.id);
    return { ok: true, code, playerId: player.id, token: player.token };
  },
  'room:createDisplay'(c, info = {}) {
    const code = newCode();
    const room = new Room(code, info);
    room.displayToken = randomBytes(16).toString('hex');
    rooms.set(code, room);
    bind(c, room, 'display');
    return { ok: true, code, displayToken: room.displayToken };
  },
  'room:attachDisplay'(c, { code, displayToken } = {}) {
    const room = rooms.get(String(code ?? '').toUpperCase());
    if (!room) return { ok: false, error: 'room_not_found' };
    if (!displayToken || room.displayToken !== displayToken) return { ok: false, error: 'not_display' };
    bind(c, room, 'display');
    return { ok: true, code: room.code };
  },
  'room:join'(c, info = {}) {
    const room = rooms.get(String(info.code ?? '').toUpperCase());
    if (!room) return { ok: false, error: 'room_not_found' };
    if (room.closed) return { ok: false, error: 'room_not_found' };
    const r = room.addPlayer(info);
    if (r.error) return { ok: false, error: r.error };
    bind(c, room, 'player', r.player.id);
    return { ok: true, code: room.code, playerId: r.player.id, token: r.player.token };
  },
  'player:look'(c, info = {}) {
    const p = c.room?.player(c.playerId);
    if (!p) return;
    c.room.applyLook(p, info);
    c.room.touch();
  },
  'room:settings'(c, patch = {}) {
    c.room?.updateSettings(who(c), patch);
  },
  'room:start'(c) {
    c.room?.start(who(c), Date.now());
  },
  'player:ready'(c) {
    c.room?.playerReady(c.playerId);
  },
  'player:step'(c, step) {
    c.room?.setStep(c.playerId, step);
  },
  'game:input'(c, inp) {
    c.room?.input(c.playerId, inp, Date.now());
  },

  'mission:claim'(c) {
    c.room?.claimMission(c.playerId);
  },
  'mission:answer'(c, id, yes) {
    c.room?.answerClaim(c.playerId, id, !!yes);
  },
  'room:exclude'(c, id) {
    c.room?.exclude(who(c), id);
  },
  'room:kick'(c, id) {
    const room = c.room;
    const p = room?.kick(who(c), id);
    if (!p) return;
    for (const x of conns) if (x.room === room && x.playerId === id) {
      send(x, { t: 'room:closed', a: ['kicked'] });
      x.room = null;
    }
  },
  'room:forceStart'(c) {
    c.room?.forceStart(who(c), Date.now());
  },
  'room:skipRound'(c) {
    c.room?.skipRound(who(c), Date.now());
  },
  'room:end'(c) {
    c.room?.end(who(c));
  },
  'room:lobby'(c) {
    c.room?.toLobby(who(c));
  },
  'room:playAgain'(c) {
    c.room?.playAgain(who(c), Date.now());
  },
  'chat:send'(c, { text, cid } = {}) {
    const room = c.room;
    const p = c.role === 'player' && room?.player(c.playerId);
    if (!p) return { ok: false, error: 'not_member' };
    return room.chat.send(p, text, cid);
  },
  'chat:history'(c, { after } = {}) {
    if (!c.room) return { ok: false, error: 'not_member' };
    return { ok: true, messages: c.room.chat.since(Number(after) || 0) };
  },
  'boat:act'(c, act) {
    c.room?.boatAction(who(c), act ?? {}, Date.now());
  },
  'room:leave'(c) {
    const room = c.room;
    if (!room) return;
    if (c.role === 'display') {
      // the big screen is the host: closing it ends the party for everyone
      closeRoom(room, 'host_left');
      return;
    }
    room.leave(c.playerId);
    c.room = null;
    if (room.closed) closeRoom(room, room.closed);
    else push(room);
  },
};
const who = (c) => (c.role === 'display' ? 'display' : c.playerId);

wss.on('connection', (ws) => {
  const c = { ws, room: null, role: null, playerId: null, budget: 80, lastRefill: Date.now() };
  conns.add(c);
  ws.on('message', (raw) => {
    const str = raw.toString();
    if (str === 'ping') return ws.send('pong');
    // simple flood guard: 80 messages, refilled at 40/s
    const now = Date.now();
    c.budget = Math.min(80, c.budget + ((now - c.lastRefill) / 1000) * 40);
    c.lastRefill = now;
    if (c.budget < 1) return;
    c.budget -= 1;
    let msg;
    try {
      msg = JSON.parse(str);
    } catch {
      return;
    }
    const h = handlers[msg?.t];
    if (!h) return;
    const before = c.room;
    let result;
    try {
      result = h(c, ...(Array.isArray(msg.a) ? msg.a : []));
    } catch (e) {
      console.error('handler error', msg.t, e);
      result = { ok: false, error: 'server_error' };
    }
    if (typeof msg.id === 'number') send(c, { ack: msg.id, a: [result ?? { ok: true }] });
    if (c.needsHistory && c.room) {
      c.needsHistory = false;
      send(c, { t: 'chat:history', a: [c.room.chat.since(0)] });
    }
    for (const r of new Set([before, c.room])) if (r && rooms.has(r.code) && r.version !== r.sentVersion) push(r);
  });
  ws.on('close', () => {
    conns.delete(c);
    if (c.room && c.role === 'player') {
      c.room.setConnected(c.playerId, false);
      push(c.room);
    }
  });
});

// ------------------------------------------------------------------ clock
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.closed) {
      closeRoom(room, room.closed);
      continue;
    }
    if (now - room.lastActive > ROOM_IDLE_MS && ![...conns].some((c) => c.room === room)) {
      rooms.delete(room.code);
      continue;
    }
    try {
      room.tick(now);
    } catch (e) {
      console.error('tick error', room.code, e);
    }
    if (room.version !== room.sentVersion) push(room);
  }
}, 100);

// Heartbeat so away-timers on screens keep moving even when nothing else changes.
setInterval(() => {
  for (const room of rooms.values()) if (room.players.some((p) => !p.connected)) room.touch();
}, 1000);

server.listen(PORT, () => console.log(`طلقة شغّالة على http://localhost:${PORT}`));
