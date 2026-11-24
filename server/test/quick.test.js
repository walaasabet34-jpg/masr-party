// «سهرة سريعة»: 5 rounds, opening with an easy game the host allowed and the room can play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { Room, QUICK_OPENERS } from '../room.js';
import { getGame } from '../games/index.js';

const mk = (n, settings = {}) => {
  const r = new Room('TEST');
  r.displayToken = 'tv';
  for (let i = 0; i < n; i++) r.addPlayer({ name: `p${i}` });
  r.updateSettings('display', { totalRounds: 5, ...settings });
  return r;
};
const firstPicks = (n, settings, trials = 150) => {
  const seen = new Set();
  for (let i = 0; i < trials; i++) {
    const r = mk(n, settings);
    r.start('display', 0);
    seen.add(r.nextGameId);
  }
  return seen;
};

test('quick night opens with an easy game that fits the players', () => {
  for (const n of [2, 3, 5]) {
    const picks = firstPicks(n, {});
    const allowed = QUICK_OPENERS.filter((id) => getGame(id).minPlayers <= n);
    assert.ok([...picks].every((id) => allowed.includes(id)), `${n} players: ${[...picks]}`);
    if (n === 2) assert.ok(!picks.has('most-likely-to'));
  }
});

test('quick night respects the host\'s game list', () => {
  // only one opener allowed: it is always the first game
  assert.deepEqual([...firstPicks(3, { enabledGames: ['hot-potato', 'tap-race', 'quick-math'] })], ['hot-potato']);
  // every opener excluded: falls back to the games the host did allow
  const picks = firstPicks(2, { enabledGames: ['tap-race', 'quick-math', 'snap'] });
  assert.ok([...picks].every((id) => ['tap-race', 'quick-math', 'snap'].includes(id)));
  assert.ok(picks.size > 1);
  // an opener that needs 3 players is skipped with 2 connected
  assert.deepEqual([...firstPicks(2, { enabledGames: ['most-likely-to', 'tap-race'] })], ['tap-race']);
});

test('the opener rule is only for quick nights, and only for the first round', () => {
  const picks = new Set();
  for (let i = 0; i < 150; i++) {
    const x = mk(3, { totalRounds: 10 });
    x.start('display', 0);
    picks.add(x.nextGameId);
  }
  assert.ok([...picks].some((id) => !QUICK_OPENERS.includes(id)), 'a normal night is not restricted');
});

test('quick night ends after round 5 with awards, and play again restarts it', () => {
  const r = mk(3);
  r.start('display', 0);
  let now = 0;
  const games = [];
  for (let round = 1; round <= 5; round++) {
    assert.equal(r.phase, 'briefing');
    for (const p of r.players) r.playerReady(p.id);
    r.tick((now += 100));
    r.tick((now += 4000));
    assert.equal(r.phase, 'playing', `round ${round}`);
    games.push(r.game.id);
    r.skipRound('display', (now += 100));
    if (round < 5) assert.equal(r.phase, 'briefing');
  }
  assert.ok(QUICK_OPENERS.includes(games[0]));
  assert.equal(r.round, 5);
  // after the 5th round, ready-up leads to the end of the night (no 6th game)
  for (const p of r.players) r.playerReady(p.id);
  r.forceStart('display', (now += 100));
  assert.equal(r.phase, 'ended');
  assert.ok(r.awards.some((a) => a.key.startsWith('champion-')));
  r.playAgain('display', (now += 100));
  assert.equal(r.phase, 'briefing');
  assert.equal(r.round, 0);
  assert.equal(r.settings.totalRounds, 5);
  assert.ok(QUICK_OPENERS.includes(r.nextGameId));
});

// ---- real sockets, 2 and 3 players
const PORT = 18600 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const c = { ws, snap: null, seq: 0, acks: new Map() };
  ws.on('message', (d) => {
    const s = d.toString();
    if (s === 'pong') return;
    const m = JSON.parse(s);
    if (typeof m.ack === 'number') return c.acks.get(m.ack)?.(m.a[0]);
    if (m.t === 'room:state') c.snap = m.a[0];
  });
  c.open = new Promise((r) => ws.on('open', r));
  c.req = (t, ...a) => new Promise((r) => { const id = ++c.seq; c.acks.set(id, r); ws.send(JSON.stringify({ t, a, id })); });
  c.emit = (t, ...a) => ws.send(JSON.stringify({ t, a }));
  return c;
}
async function until(fn, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return; await sleep(30); }
  throw new Error('timeout waiting');
}

test('quick night over WebSockets with 2 and 3 players', async (t) => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  t.after(() => srv.kill());
  // wait until the server answers instead of a fixed sleep (cold starts can be slow)
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break; } catch { /* not up yet */ }
    await sleep(100);
  }
  for (const n of [2, 3]) {
    const host = client(PORT); await host.open;
    const made = await host.req('room:create', { name: 'مضيف', format: 'party' });
    const phones = [host];
    for (let i = 1; i < n; i++) {
      const p = client(PORT); await p.open;
      assert.ok((await p.req('room:join', { code: made.code, name: 'لاعب' + i })).ok);
      phones.push(p);
    }
    await until(() => host.snap?.players.length === n);
    host.emit('room:settings', { totalRounds: 5 });
    await until(() => host.snap.settings.totalRounds === 5);
    host.emit('room:start');
    await until(() => host.snap.phase === 'briefing');
    const first = host.snap.nextGameId;
    assert.ok(QUICK_OPENERS.includes(first) && getGame(first).minPlayers <= n, `${n}: ${first}`);
    for (let round = 1; round <= 5; round++) {
      for (const p of phones) p.emit('player:ready');
      await until(() => host.snap.phase === 'playing');
      host.emit('room:skipRound');
      await until(() => host.snap.round === round && host.snap.phase === 'briefing');
    }
    for (const p of phones) p.emit('player:ready');
    host.emit('room:forceStart');
    await until(() => host.snap.phase === 'ended');
    assert.ok(host.snap.awards.length >= 1);
    host.emit('room:playAgain');
    await until(() => host.snap.phase === 'briefing' && host.snap.round === 0);
    assert.equal(host.snap.settings.totalRounds, 5);
    for (const p of phones) p.ws.close();
  }
});
