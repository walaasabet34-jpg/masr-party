// Secret-missions experiment + the per-player funnel gaps: driven straight through the analytics
// module (no sockets) against a mock PostHog endpoint, so a full Basra match isn't needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';

const PORT = 21000 + Math.floor(Math.random() * 500);
const events = [];
const raw = [];
const ingest = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let body = Buffer.concat(chunks);
    if (req.headers['content-encoding'] === 'gzip') body = gunzipSync(body);
    raw.push(body.toString());
    try {
      const j = JSON.parse(body.toString());
      for (const e of j.batch ?? [j]) events.push(e);
    } catch {
      /* not an event payload */
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"status":1}');
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const named = (n) => events.filter((e) => e.event === n);
async function until(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(20);
  }
  throw new Error('timeout waiting');
}

process.env.POSTHOG_PROJECT_TOKEN = 'phc_test';
process.env.POSTHOG_HOST = `http://localhost:${PORT}`;
process.env.POSTHOG_FLUSH_AT = '1';
process.env.POSTHOG_FLUSH_INTERVAL_MS = '20';

before(() => new Promise((r) => ingest.listen(PORT, r)));
after(() => ingest.close());

test('missions experiment: arm, claim/answer events, first tap kept, junk dropped', async () => {
  const analytics = await import('../analytics.js');
  const { Room } = await import('../room.js');

  // the arm comes from the host's invite link; anything else is "not in the experiment"
  assert.equal(new Room('AAAA', { missionsArm: 'on' }).settings.missions, true);
  assert.equal(new Room('AAAA', { missionsArm: 'on' }).settings.missionsArm, 'on');
  assert.equal(new Room('AAAA', { missionsArm: 'optional' }).settings.missions, false);
  assert.equal(new Room('AAAA', { missionsArm: 'optional' }).settings.missionsArm, 'optional');
  assert.equal(new Room('AAAA', { missionsArm: 'yes please' }).settings.missionsArm, null);
  assert.equal(new Room('AAAA').settings.missions, false);

  const room = new Room('BBBB', { missionsArm: 'on' });
  const host = room.addPlayer({ name: 'منى السرية' }, { asHost: true }).player;
  const p2 = room.addPlayer({ name: 'كريم السري' }).player;
  const p3 = room.addPlayer({ name: 'سلمى السرية' }).player;
  analytics.roomCreated(room, host.id, { aid: '0199aaaa-bbbb-7ccc-8ddd-000000000001' });
  room.start(host.id, Date.now());
  assert.ok(room.missions[p2.id] && room.missions[p3.id], 'arm "on" hands out missions');

  // p2 claims; the target still holds their own open mission
  const target = room.missions[p2.id].target;
  const claim = room.claimMission(p2.id, 1000);
  analytics.missionClaimed(room, claim);
  assert.equal(room.claimMission(p2.id), null, 'one open claim per player');
  assert.equal(room.answerClaim(p3.id === target ? host.id : p3.id, claim.id, true), null, 'only the target can answer');
  const ans = room.answerClaim(target, claim.id, true, 4500);
  assert.equal(ans.hadOpenMission, true);
  assert.equal(ans.msSinceClaim, 3500);
  analytics.missionAnswered(room, target, ans, { firstTap: 'yes', onOwnMission: true, locked: true, msToFirstTap: 120.4, msToAnswer: 2210, taps: 3, ownCardOpen: false });
  assert.equal(room.answerClaim(target, claim.id, true), null, 'a repeated answer finds nothing');

  // a second claim, answered with a forged tap payload: every unknown value is dropped
  const claim2 = room.claimMission(p3.id === target ? host.id : p3.id);
  const by2 = claim2.target;
  analytics.missionAnswered(room, by2, room.answerClaim(by2, claim2.id, false), { firstTap: '<script>', onOwnMission: 'yes', locked: 1, msToFirstTap: -5, msToAnswer: 1e12, taps: 1.5, name: 'منى السرية' });

  await until(() => named('mission_claim_answered').length === 2 && named('mission_claim_created').length === 1);
  const created = named('mission_claim_created')[0].properties;
  assert.equal(created.claim_id, claim.id);
  assert.equal(created.missions_arm, 'on');
  assert.equal(created.target_has_open_mission, true);

  const [a1, a2] = named('mission_claim_answered').map((e) => e.properties);
  assert.equal(a1.claim_id, claim.id);
  assert.equal(a1.answer, 'yes');
  assert.equal(a1.answerer_had_open_mission, true);
  assert.equal(a1.missions_arm, 'on');
  assert.equal(a1.first_tap, 'yes');
  assert.equal(a1.first_tap_on_own_mission, true);
  assert.equal(a1.first_tap_while_locked, true);
  assert.equal(a1.ms_shown_to_first_tap, 120);
  assert.equal(a1.taps_before_answer, 3);
  assert.equal(a2.answer, 'no');
  for (const k of ['first_tap', 'first_tap_on_own_mission', 'first_tap_while_locked', 'ms_shown_to_first_tap', 'ms_shown_to_answer', 'taps_before_answer']) {
    assert.equal(a2[k], null, `${k} must drop junk`);
  }
  const all = raw.join('\n');
  for (const n of ['منى السرية', 'كريم السري', 'سلمى السرية', 'BBBB']) assert.ok(!all.includes(n), 'name or code leaked');
  for (const m of Object.values(room.missions)) assert.ok(!all.includes(m.text.split(' ')[1] ?? m.text), 'mission text leaked');
});

test('funnel-fix gaps: late joiner enters the player funnel, Basra match completes once', async () => {
  const analytics = await import('../analytics.js');
  events.length = 0;
  const players = [
    { id: 'pa', connected: true },
    { id: 'pb', connected: true },
  ];
  const room = { code: 'CCCC', createdAt: 1, phase: 'lobby', settings: { format: 'boat', mode: 'medium', missions: false, enabledGames: [], totalRounds: 10, missionsArm: null }, players, game: null, lastResult: null, displayToken: null, boat: null };
  analytics.roomCreated(room, 'pa', {});
  analytics.observe(room, 'tick', 1000);

  // joining while still in the lobby is not a late join
  players.push({ id: 'pc', connected: true });
  analytics.roomJoined(room, players[2], {});
  // the match starts
  room.phase = 'boat';
  room.boat = { hand: 1, stage: 'play', order: ['pa', 'pb', 'pc'] };
  analytics.observe(room, 'room:start', 2000);
  // someone arrives mid-match
  players.push({ id: 'pd', connected: true });
  analytics.roomJoined(room, players[3], {});
  // hand 1 ends, hand 2 is played, then the match reaches "over" through handOver
  room.boat = { ...room.boat, stage: 'handOver' };
  analytics.observe(room, 'tick', 3000);
  room.boat = { ...room.boat, hand: 2, stage: 'play' };
  analytics.observe(room, 'tick', 4000);
  room.boat = { ...room.boat, stage: 'handOver' };
  analytics.observe(room, 'tick', 5000);
  room.boat = { ...room.boat, stage: 'over' };
  analytics.observe(room, 'tick', 6000);
  analytics.observe(room, 'tick', 7000); // staying "over" must not report it again

  await until(() => named('basra_match_completed').length >= 1 && named('player_round_completed').length >= 6);
  await sleep(150);
  const starts = named('player_game_started').map((e) => e.properties);
  assert.equal(starts.filter((p) => p.late_join === false).length, 3, 'players seated at the start');
  assert.equal(starts.filter((p) => p.late_join === true).length, 1, 'the mid-match arrival');
  assert.equal(named('round_completed').length, 2, 'one per hand');
  assert.equal(named('player_round_completed').length, 6, 'each of the 3 seated players, per hand');
  const done = named('basra_match_completed');
  assert.equal(done.length, 1, 'match completion reported once');
  assert.equal(done[0].properties.hands_completed, 2);
});
