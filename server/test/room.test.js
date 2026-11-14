// Unit tests for room rules that don't need sockets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../room.js';
import { rank } from '../lib/rank.js';
import { sameAnswer, clusterAnswers, pickFresh } from '../lib/util.js';
import { getGame } from '../games/index.js';

const mk = (n = 3, opts = {}) => {
  const r = new Room('TEST', opts);
  r.displayToken = 'tv';
  const ps = Array.from({ length: n }, (_, i) => r.addPlayer({ name: `p${i}` }).player);
  return { r, ps };
};
const play = (r, now) => {
  for (const p of r.players) r.playerReady(p.id);
  r.tick(now);
  r.tick(now + 4000);
};

test('ranking: ties, fouls and "everyone ties" rules', () => {
  const row = (id, primary, status = 'ok', tiebreak) => ({ id, primary, status, tiebreak });
  let r = rank([row('a', 100), row('b', 200), row('c', 300)], { better: 'lower' });
  assert.deepEqual([r.winners, r.losers], [['a'], ['c']]);
  r = rank([row('a', 100), row('b', 100)], { better: 'lower', allTied: 'everyone' });
  assert.deepEqual(r.losers.sort(), ['a', 'b']);
  r = rank([row('a', 100), row('b', 100)], { better: 'lower' });
  assert.deepEqual(r.losers, []);
  r = rank([row('a', 100), row('b', 0, 'foul'), row('c', 200)], { better: 'lower' });
  assert.deepEqual(r.losers.sort(), ['b', 'c']); // a foul doesn't save the slowest
  r = rank([row('a', 100), row('b', 0, 'out'), row('c', 200)], { better: 'lower' });
  assert.deepEqual(r.losers, ['b']); // someone who never played takes it alone
  r = rank([row('a', 5, 'ok', 10), row('b', 5, 'ok', 20)], { better: 'higher' });
  assert.deepEqual([r.winners, r.losers], [['a'], ['b']]); // equal score: later one loses
});

test('Arabic answer matching for Herd Mentality', () => {
  assert.ok(sameAnswer('الكشري', 'كشرى'));
  assert.ok(sameAnswer('عمرو دياب', 'عمر دياب'));
  assert.ok(sameAnswer('٣', 'تلاته'));
  assert.ok(!sameAnswer('شاي', 'قهوة'));
  const g = clusterAnswers({ a: 'محمد صلاح', b: 'صلاح', c: 'محمد  صلاح', d: 'تريكة' });
  assert.equal(g[0].ids.length, 3); // 'صلاح' counts as 'محمد صلاح' (one extra word allowed)
  assert.equal(g[1].label, 'تريكة');
});

test('content does not repeat within a session until the bank is used up', () => {
  const seen = new Set();
  const bank = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i }));
  const got = Array.from({ length: 20 }, () => pickFresh({ rng: Math.random, seen }, bank).id);
  assert.equal(new Set(got).size, 20);
});

test('late joiner sits out the running round and plays the next one', () => {
  const { r } = mk(3);
  r.updateSettings('display', { enabledGames: ['would-you-rather'], totalRounds: 0 });
  r.start('display', 0);
  play(r, 0);
  assert.equal(r.phase, 'playing');
  const late = r.addPlayer({ name: 'متأخر' }).player;
  assert.ok(late.late);
  assert.ok(!r.game.roster.some((p) => p.id === late.id));
  r.input(late.id, { type: 'pick', payload: 0 }, 1000);
  assert.ok(!(late.id in r.game.state.votes));
  r.tick(60000); // timer runs out
  assert.equal(r.phase, 'briefing');
  assert.ok(!late.late);
  for (const a of r.lastResult.assignments) a.resolved = 'done';
  play(r, 70000);
  assert.ok(r.game.roster.some((p) => p.id === late.id));
});

test('only the host controls the room; kicked players cannot return; locked rooms refuse strangers', () => {
  const { r, ps } = mk(3);
  r.updateSettings(ps[0].id, { mode: 'hardcore' });
  assert.equal(r.settings.mode, 'medium');
  r.kick('display', ps[1].id);
  assert.equal(r.addPlayer({ playerId: ps[1].id, token: ps[1].token }).error, 'kicked');
  r.updateSettings('display', { locked: true });
  assert.equal(r.addPlayer({ name: 'غريب' }).error, 'room_locked');
  assert.ok(r.addPlayer({ playerId: ps[2].id, token: ps[2].token }).player); // a known player can come back
});

test('phone host leaving closes the party', () => {
  const r = new Room('HOST');
  const host = r.addPlayer({ name: 'المضيف' }, { asHost: true }).player;
  r.addPlayer({ name: 'ضيف' });
  r.leave(host.id);
  assert.equal(r.closed, 'host_left');
});

test('sober players and no-drinks parties never get a drink, but still score', () => {
  const { r, ps } = mk(3);
  ps[0].sober = true;
  r.updateSettings('display', { enabledGames: ['most-likely-to'], totalRounds: 0 });
  r.start('display', 0);
  play(r, 0);
  for (const p of ps) r.input(p.id, { type: 'vote', payload: ps[0].id }, 5000);
  r.tick(5100);
  const a = r.lastResult.assignments.find((x) => x.playerId === ps[0].id);
  assert.equal(a.resolved, 'skipped');
  assert.ok(!r.owesDrink(ps[0].id));

  const dry = mk(3, { noDrinks: true }).r;
  dry.updateSettings('display', { enabledGames: ['most-likely-to'], totalRounds: 0 });
  dry.start('display', 0);
  play(dry, 0);
  const [x, y, z] = dry.players;
  for (const p of dry.players) dry.input(p.id, { type: 'vote', payload: x.id }, 5000);
  dry.tick(5100);
  assert.ok(dry.lastResult.assignments.every((q) => q.resolved === 'skipped'));
  assert.equal(y.stats.points, 1);
  assert.equal(x.stats.points, 0);
  void z;
});

test('intensity changes the drink and the content pool', () => {
  const g = getGame('most-likely-to');
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const s = g.setup({ rng: Math.random, players: [], mode: 'lite', seen });
    assert.ok(!/إكس|يندم|يبوس/.test(s.prompt), s.prompt);
  }
  const { r, ps } = mk(3, { mode: 'hardcore' });
  r.updateSettings('display', { enabledGames: ['roulette', 'lone-wolf'], totalRounds: 0 });
  r.start('display', 0); // round 1 never opens with the roulette
  assert.equal(r.nextGameId, 'lone-wolf');
  play(r, 0);
  for (const [i, p] of ps.entries()) r.input(p.id, { type: 'pick', payload: i + 1 }, 5000);
  r.tick(5100);
  assert.equal(r.nextGameId, 'roulette');
  for (const a of r.lastResult.assignments) a.resolved = 'done';
  play(r, 6000);
  r.tick(10000); // intro over, wheel set up
  r.tick(10100); // wheel starts spinning
  r.tick(17000); // wheel stopped
  assert.equal(r.lastResult.gameId, 'roulette');
  assert.equal(r.lastResult.assignments[0].penalty.label, 'الكاس كله');
});
