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
  tv.emit('room:settings', { totalRounds: 10, enabledGames: ['most-likely-to'] });
  tv.emit('room:start');
  await until(() => tv.snap.phase === 'briefing');
  assert.equal(tv.snap.nextGameId, 'most-likely-to');

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
    }
    await until(() => tv.snap.phase === 'briefing');
    const res = tv.snap.lastResult;
    assert.equal(res.gameId, gid);
    if (gid === 'most-likely-to') assert.deepEqual(res.losers, [phones[2].id]); // votes can change until the vote closes; the last one counts
    if (gid !== 'roulette') assert.ok(res.losers.length >= 1, res.headline);
    // Scores are final immediately; a losing player can ready without any extra step.
    const loser = phones.find((p) => p.id === res.losers[0]);
    // a normal loss is 0; only a stated worst case (sole most-voted, here) costs 1, with its reason
    const ded = res.deductions[loser.id];
    assert.equal(res.points[loser.id], (res.earned[loser.id] ?? 0) - (ded?.amount ?? 0));
    if (ded) assert.ok(ded.reason && ded.reason.length > 3);
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

test('Egyptian Basra: two sockets play a full hand, see private cards and continue', async (t) => {
  const port = PORT + 1;
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
  t.after(() => srv.kill());
  await sleep(600);
  const mk = () => { const ws = new WebSocket(`ws://localhost:${port}/ws`); const c = { ws, snap: null, seq: 0, acks: new Map() };
    ws.on('message', (d) => { const s = d.toString(); if (s === 'pong') return; const m = JSON.parse(s); if (typeof m.ack === 'number') return c.acks.get(m.ack)?.(m.a[0]); if (m.t === 'room:state') c.snap = m.a[0]; });
    c.open = new Promise((r) => ws.on('open', r)); c.req = (tt, ...a) => new Promise((r) => { const id = ++c.seq; c.acks.set(id, r); ws.send(JSON.stringify({ t: tt, a, id })); }); c.emit = (tt, ...a) => ws.send(JSON.stringify({ t: tt, a })); t.after(()=>ws.close()); return c; };
  const host = mk(); await host.open;
  const r = await host.req('room:create', { name: 'المضيف', format: 'boat' });
  const guest = mk(); await guest.open;
  const g = await guest.req('room:join', { code: r.code, name: 'ضيف' });
  host.emit('room:start'); await until(() => host.snap?.phase === 'boat');
  host.emit('boat:act', { type: 'ready' }); guest.emit('boat:act', { type: 'ready' });
  await until(() => host.snap.boat.stage === 'play' && guest.snap?.boat.stage === 'play');
  assert.equal(host.snap.boat.kind,'basra');
  assert.equal(host.snap.boat.myHand.length,4); assert.equal(host.snap.boat.hands,undefined);
  assert.ok(!host.snap.boat.myHand.some(c=>guest.snap.boat.myHand.includes(c)));
  const byId = { [r.playerId]: host, [g.playerId]: guest };
  for (let i=0;i<48;i++) {
    const b=host.snap.boat, cur=byId[b.turn], wrong=cur===host?guest:host;
    await until(()=>cur.snap.boat.move===b.move);
    const act={type:'play',card:cur.snap.boat.myHand[0],move:b.move};
    wrong.emit('boat:act',act); await sleep(30); assert.equal(host.snap.boat.move,b.move);
    cur.emit('boat:act',act);
    await until(()=>host.snap.boat.move>b.move);
    cur.emit('boat:act',act); // replay is ignored
  }
  await until(()=>host.snap.boat.stage==='handOver');
  assert.equal(host.snap.boat.result.counts.reduce((a,n)=>a+n,0),52);
  guest.emit('boat:act',{type:'next'});await sleep(80);assert.equal(host.snap.boat.stage,'handOver');
  host.emit('boat:act',{type:'next'});await until(()=>host.snap.boat.hand===2);
  assert.equal(host.snap.boat.stage,'rules');
  host.emit('room:end');await until(()=>host.snap.phase==='ended');
});
