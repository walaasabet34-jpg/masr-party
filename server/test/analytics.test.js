// Analytics: the real server talks to a mock PostHog ingestion endpoint. We drive real sockets
// through a party night and a Basra hand and check each event fires once, with no personal data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import WebSocket from 'ws';

const PORT = 19000 + Math.floor(Math.random() * 500);
const INGEST = PORT + 600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['منى الخاصة', 'كريم السري', 'سارة المخفية', 'زياد المطرود'];

const events = [];
const raw = [];
const ingest = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);
    if (req.headers['content-encoding'] === 'gzip') body = gunzipSync(body);
    const text = body.toString();
    raw.push(text);
    try {
      const j = JSON.parse(text);
      for (const e of j.batch ?? [j]) events.push(e);
    } catch {
      /* not an event payload */
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":1}');
  });
});

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
async function until(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(30); }
  throw new Error('timeout waiting');
}
const named = (n, room) => events.filter((e) => e.event === n && (!room || e.properties.room_id === room));
const aid = (i) => `0199aaaa-bbbb-7ccc-8ddd-00000000000${i}`;
const sid = (i) => `0199ffff-eeee-7ddd-8ccc-00000000000${i}`;

test('server analytics: each lifecycle event once, refresh-safe, no personal data', async (t) => {
  await new Promise((r) => ingest.listen(INGEST, r));
  t.after(() => ingest.close());
  const srv = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), POSTHOG_PROJECT_TOKEN: 'phc_test', POSTHOG_HOST: `http://localhost:${INGEST}`, POSTHOG_FLUSH_AT: '1', POSTHOG_FLUSH_INTERVAL_MS: '50', ANALYTICS_EXIT_AFTER_MS: '1200' },
    stdio: 'pipe',
  });
  t.after(() => srv.kill());
  await sleep(700);

  // ---------------- party night
  const host = client(); await host.open;
  const made = await host.req('room:create', { name: NAMES[0], mode: 'medium', format: 'party', aid: aid(0), sid: sid(0) });
  assert.ok(made.ok);
  const phones = [host];
  host.id = made.playerId;
  for (let i = 1; i < 4; i++) {
    const p = client(); await p.open;
    const r = await p.req('room:join', { code: made.code, name: NAMES[i], aid: aid(i), sid: sid(i) });
    assert.ok(r.ok); p.id = r.playerId; p.token = r.token; phones.push(p);
  }
  // a refresh: same seat comes back with its token -> not a new join
  phones[1].ws.close(); await sleep(150);
  const back = client(); await back.open;
  assert.ok((await back.req('room:join', { code: made.code, playerId: phones[1].id, token: phones[1].token, aid: aid(1), sid: sid(1) })).ok);
  back.id = phones[1].id; phones[1] = back;

  await until(() => named('room_joined').length === 3);
  const room = named('room_created')[0].properties.room_id;

  host.emit('room:kick', phones[3].id);
  await until(() => host.snap?.players.length === 3);
  phones.pop();

  host.emit('room:settings', { totalRounds: 10, enabledGames: ['would-you-rather'] });
  host.emit('room:start');
  await until(() => host.snap?.phase === 'briefing');
  // round 1 played to the end
  for (const p of phones) p.emit('player:ready');
  await until(() => host.snap.phase === 'playing');
  await until(() => phones.every((p) => p.snap?.game));
  for (const [i, p] of phones.entries()) p.emit('game:input', { type: 'pick', payload: i === 0 ? 1 : 0 });
  await until(() => host.snap.phase === 'briefing' && host.snap.lastResult);
  // round 2 skipped by the host
  for (const p of phones) p.emit('player:ready');
  await until(() => host.snap.phase === 'playing');
  host.emit('room:skipRound');
  await until(() => host.snap.phase === 'briefing' && host.snap.round === 2);
  // another refresh mid-night: still nothing new
  phones[2].ws.close(); await sleep(100);
  const back2 = client(); await back2.open;
  assert.ok((await back2.req('room:join', { code: made.code, playerId: phones[2].id, token: phones[2].token, aid: aid(2) })).ok);
  back2.id = phones[2].id; phones[2] = back2;
  // phone 1 goes away for good -> game_exited(disconnected) after the grace period
  phones[1].ws.close();
  await until(() => named('game_exited').some((e) => e.properties.exit_reason === 'disconnected'), 6000);
  host.emit('room:end');
  await until(() => host.snap.phase === 'ended');
  host.emit('room:playAgain');
  await until(() => host.snap.phase === 'briefing');
  await sleep(300);
  host.emit('room:leave');
  await until(() => named('party_ended').length === 2 && named('game_exited').length === 4);
  await sleep(400);

  const count = (n) => named(n, room).length;
  assert.equal(count('room_created'), 1);
  assert.equal(count('room_joined'), 3, 'refreshes are not joins');
  assert.equal(count('game_started'), 2);
  assert.deepEqual(named('game_started', room).map((e) => e.properties.play_again), [false, true]);
  assert.equal(count('game_selected'), 2);
  assert.ok(named('game_selected', room).every((e) => e.properties.game_id === 'would-you-rather'));
  const rounds = named('round_completed', room);
  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds.map((e) => e.properties.skipped), [false, true]);
  assert.ok(rounds.every((e) => e.properties.round_duration_ms >= 0 && e.properties.player_count === 3));
  assert.deepEqual(named('party_ended', room).map((e) => e.properties.end_reason), ['host_ended', 'room_closed']);
  assert.equal(named('party_ended', room)[0].properties.rounds_completed, 2);
  const exits = Object.fromEntries(named('game_exited', room).map((e) => [e.distinct_id, e.properties]));
  assert.equal(exits[aid(3)].exit_reason, 'kicked');
  assert.equal(exits[aid(1)].exit_reason, 'disconnected');
  assert.equal(exits[aid(0)].exit_reason, 'left');
  assert.equal(exits[aid(2)].exit_reason, 'room_closed');
  assert.equal(exits[aid(0)].rounds_played, 2);
  assert.ok(exits[aid(0)].session_duration_ms > 0);
  // attribution: anonymous browser ids, linked to replay sessions, never person profiles
  assert.deepEqual(named('room_joined', room).map((e) => [e.distinct_id, e.session_id ?? e.properties.$session_id]).sort(), [1, 2, 3].map((i) => [aid(i), sid(i)]));
  assert.ok(events.every((e) => (e.options?.process_person_profile ?? e.properties.$process_person_profile) === false));

  // ---------------- Basra
  const a = client(); await a.open;
  const r = await a.req('room:create', { name: NAMES[0], format: 'boat', aid: aid(5) });
  const b = client(); await b.open;
  const g = await b.req('room:join', { code: r.code, name: NAMES[1], aid: aid(6) });
  a.emit('room:start'); await until(() => a.snap?.phase === 'boat');
  a.emit('boat:act', { type: 'ready' }); b.emit('boat:act', { type: 'ready' });
  await until(() => a.snap.boat.stage === 'play' && b.snap?.boat.stage === 'play');
  const byId = { [r.playerId]: a, [g.playerId]: b };
  for (let i = 0; i < 48; i++) {
    const s = a.snap.boat, cur = byId[s.turn];
    await until(() => cur.snap.boat.move === s.move);
    cur.emit('boat:act', { type: 'play', card: cur.snap.boat.myHand[0], move: s.move });
    await until(() => a.snap.boat.move > s.move);
  }
  await until(() => a.snap.boat.stage === 'handOver');
  a.emit('room:end'); await until(() => a.snap.phase === 'ended');
  await sleep(400);
  const broom = named('room_created').at(-1).properties.room_id;
  assert.notEqual(broom, room);
  assert.equal(named('game_selected', broom).length, 1);
  assert.equal(named('game_selected', broom)[0].properties.game_id, 'basra');
  assert.equal(named('round_completed', broom).length, 1);
  assert.equal(named('round_completed', broom)[0].properties.game_id, 'basra');
  assert.equal(named('party_ended', broom)[0].properties.end_reason, 'host_ended');

  // ---------------- privacy: nothing personal or identifying in any payload
  const all = raw.join('\n');
  for (const n of NAMES) assert.ok(!all.includes(n), 'player name leaked');
  for (const code of [made.code, r.code]) assert.ok(!new RegExp(`"${code}"`).test(all), 'room code leaked');
  assert.ok(!/token|"name"|chat|text"/.test(all.replace(/"\$lib[^"]*"/g, '')), 'sensitive field leaked');
});
