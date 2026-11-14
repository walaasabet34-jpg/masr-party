// End-to-end protocol test: a big-screen host + 3 phones play several rounds over real WebSockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, snap: null, seq: 0, acks: new Map(), closed: null };
  ws.on('message', (d) => {
    const s = d.toString();
    if (s === 'pong') return;
    const m = JSON.parse(s);
    if (typeof m.ack === 'number') return c.acks.get(m.ack)?.(m.a[0]);
    if (m.t === 'room:state') c.snap = m.a[0];
    if (m.t === 'room:closed') c.closed = m.a[0];
  });
  c.open = new Promise((r) => ws.on('open', r));
  c.req = (t, ...a) => new Promise((r) => { const id = ++c.seq; c.acks.set(id, r); ws.send(JSON.stringify({ t, a, id })); });
  c.emit = (t, ...a) => ws.send(JSON.stringify({ t, a }));
  return c;
}
async function until(fn, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(30); }
  throw new Error('timeout waiting');
}

test('full party flow with display host, 3 phones, reconnect and points', async (t) => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  t.after(() => srv.kill());
  await sleep(600);

  const tv = client(); await tv.open;
  const made = await tv.req('room:createDisplay', { mode: 'medium', format: 'party' });
  assert.ok(made.ok); assert.match(made.code, /^[A-Z]{4}$/);

  const peek = await client(); await peek.open;
  assert.equal((await peek.req('room:peek', { code: 'ZZZZ' })).error, 'room_not_found');

  const phones = [];
  for (const name of ['منى', 'كريم', 'سارة']) {
    const p = client(); await p.open;
    const r = await p.req('room:join', { code: made.code.toLowerCase(), name, color: 'lime', sticker: '🦊' });
    assert.ok(r.ok, JSON.stringify(r));
    p.id = r.playerId; p.token = r.token; phones.push(p);
  }
  await until(() => tv.snap?.players.length === 3);
  // seat theft is refused
  const thief = client(); await thief.open;
  assert.equal((await thief.req('room:join', { code: made.code, playerId: phones[0].id, token: 'nope' })).error, 'seat_taken');

  // only the host can start; a phone is not the host here
  phones[0].emit('room:start'); await sleep(200);
  assert.equal(tv.snap.phase, 'lobby');
  tv.emit('room:settings', { totalRounds: 10, enabledGames: ['most-likely-to', 'would-you-rather', 'lone-wolf'] });
  tv.emit('room:start');
  await until(() => tv.snap.phase === 'briefing');
  assert.ok(['most-likely-to', 'would-you-rather', 'lone-wolf'].includes(tv.snap.nextGameId));

  // reconnect: phone 2 drops and comes back with its token
  phones[1].ws.close();
  await until(() => tv.snap.players.find((p) => p.id === phones[1].id)?.connected === false);
  const back = client(); await back.open;
  const rj = await back.req('room:join', { code: made.code, playerId: phones[1].id, token: phones[1].token });
  assert.ok(rj.ok); back.id = phones[1].id; phones[1] = back;
  await until(() => tv.snap.players.every((p) => p.connected));

  for (let round = 1; round <= 3; round++) {
    for (const p of phones) p.emit('player:ready');
    await until(() => tv.snap.phase === 'playing');
    const gid = tv.snap.currentGameId;
    await until(() => phones.every((p) => p.snap.game));
    for (const [i, p] of phones.entries()) {
      if (gid === 'most-likely-to') { p.emit('game:input', { type: 'vote', payload: phones[0].id }); p.emit('game:input', { type: 'vote', payload: phones[2].id }); }
      if (gid === 'would-you-rather') p.emit('game:input', { type: 'pick', payload: i === 0 ? 1 : 0 });
      if (gid === 'lone-wolf') p.emit('game:input', { type: 'pick', payload: i === 2 ? 3 : 1 });
    }
    await until(() => tv.snap.phase === 'briefing');
    const res = tv.snap.lastResult;
    assert.equal(res.gameId, gid);
    if (gid === 'most-likely-to') assert.deepEqual(res.losers, [phones[2].id]); // votes can change until the vote closes; the last one counts
    if (gid !== 'roulette') assert.ok(res.losers.length >= 1, res.headline);
    // Scores are final immediately; a losing player can ready without any extra step.
    const loser = phones.find((p) => p.id === res.losers[0]);
    assert.equal(res.points[loser.id], -1);
    loser.emit('player:ready'); await sleep(150);
    assert.ok(tv.snap.ready.includes(loser.id));
    assert.equal(tv.snap.round, round);
  }
  // inputs outside of play are ignored, end the night shows awards
  tv.emit('room:end');
  await until(() => tv.snap.phase === 'ended');
  assert.ok(tv.snap.awards.some((a) => a.key.startsWith('champion-')));
  assert.ok(tv.snap.awards.every((a) => tv.snap.players.some((p) => p.id === a.pid)));
  tv.emit('room:lobby');
  await until(() => tv.snap.phase === 'lobby');
});

test('boat: deal, parts 1-3 turn order and automatic points', async (t) => {
  const port = PORT + 1;
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
  t.after(() => srv.kill());
  await sleep(600);
  const mk = () => { const ws = new WebSocket(`ws://localhost:${port}/ws`); const c = { ws, snap: null, seq: 0, acks: new Map() };
    ws.on('message', (d) => { const s = d.toString(); if (s === 'pong') return; const m = JSON.parse(s); if (typeof m.ack === 'number') return c.acks.get(m.ack)?.(m.a[0]); if (m.t === 'room:state') c.snap = m.a[0]; });
    c.open = new Promise((r) => ws.on('open', r)); c.req = (tt, ...a) => new Promise((r) => { const id = ++c.seq; c.acks.set(id, r); ws.send(JSON.stringify({ t: tt, a, id })); }); c.emit = (tt, ...a) => ws.send(JSON.stringify({ t: tt, a })); return c; };
  const host = mk(); await host.open;
  const r = await host.req('room:create', { name: 'المضيف', format: 'boat' });
  const guest = mk(); await guest.open;
  const g = await guest.req('room:join', { code: r.code, name: 'ضيف' });
  host.emit('room:start');
  await until(() => host.snap?.phase === 'boat');
  host.emit('boat:act', { type: 'ready' }); guest.emit('boat:act', { type: 'ready' });
  await until(() => host.snap.boat.stage === 'play');
  const byId = { [r.playerId]: host, [g.playerId]: guest };
  for (let guard = 0; guard < 20 && host.snap.boat.part < 4; guard++) {
    const b = host.snap.boat;
    if (b.stage === 'rules') { host.emit('boat:act', { type: 'ready' }); guest.emit('boat:act', { type: 'ready' }); await until(() => host.snap.boat.stage === 'play'); continue; }
    const cur = byId[b.turn];
    const opt = { 1: 'red', 2: 'higher', 3: 'between' }[b.part];
    // wrong player can't act
    byId[b.turn === r.playerId ? g.playerId : r.playerId].emit('boat:act', { type: 'pick', pick: opt });
    await sleep(100); assert.equal(host.snap.boat.pending, null);
    cur.emit('boat:act', { type: 'pick', pick: opt });
    await until(() => host.snap.boat.pending);
    const p = host.snap.boat.pending;
    await until(() => !host.snap.boat.pending);
  }
  const s = host.snap.boat;
  assert.equal(s.part, 4);
  assert.equal(s.hands[r.playerId].length, 3);
  const guesses = s.log.filter((x) => x.t === 'guess');
  const total = guesses.reduce((sum, x) => sum + (x.right ? x.part : -1), 0);
  assert.equal(Object.values(s.points).reduce((a, x) => a + x, 0), total);
});
