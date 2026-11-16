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

test('points are applied once; losing does not block readiness and scores may be negative', () => {
  const { r, ps } = mk(3);
  r.updateSettings('display', { enabledGames: ['most-likely-to'], totalRounds: 0 });
  r.start('display', 0); play(r, 0);
  for (const p of ps) r.input(p.id, { type: 'vote', payload: ps[0].id }, 5000);
  r.tick(5100);
  assert.equal(ps[0].stats.points, -1);
  assert.equal(ps[1].stats.points, 1);
  assert.equal(r.lastResult.points[ps[0].id], -1);
  assert.equal(r.lastResult.deductions[ps[0].id].amount, 1);
  r.finishGame(5200); // duplicate completion must be harmless
  assert.equal(ps[0].stats.points, -1);
  r.playerReady(ps[0].id);
  assert.ok(r.ready.includes(ps[0].id));
});

test('intensity filters content; roulette applies one signed points card', () => {
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
  play(r, 6000);
  r.tick(10000); // intro over, wheel set up
  r.tick(10100); // wheel starts spinning
  r.tick(17000); // wheel stopped
  assert.equal(r.lastResult.gameId, 'roulette');
  const changed = Object.values(r.lastResult.points).filter((n) => n !== 0);
  assert.equal(changed.length, 1);
  assert.ok([2, 3, -1, -2].includes(changed[0]));
});

test('one participating host and one guest can start; larger games unlock for the very next round', () => {
  const r = new Room('DUO');
  const host = r.addPlayer({ name: 'المضيف' }, { asHost: true }).player;
  r.start(host.id, 0);
  assert.equal(r.phase, 'lobby', 'one person alone cannot start');
  r.addPlayer({ name: 'صاحب' });
  r.updateSettings(host.id, { enabledGames: ['most-likely-to'], totalRounds: 0 });
  r.start(host.id, 0);
  assert.equal(r.phase, 'briefing');
  assert.ok(getGame(r.nextGameId).minPlayers <= 2, 'fallback game supports a pair');
  play(r, 0);
  assert.equal(r.phase, 'playing');
  assert.equal(r.game.roster.length, 2);
  assert.ok(r.game.roster.some((p) => p.id === host.id));
  const third = r.addPlayer({ name: 'صاحب كمان' }).player;
  assert.equal(third.late, true);
  assert.equal(r.game.roster.length, 2, 'joining does not disrupt current round');
  r.finishGame(60000);
  assert.equal(third.late, false);
  assert.equal(r.nextGameId, 'most-likely-to', '3-player game is eligible immediately');
  play(r, 70000);
  assert.equal(r.game.roster.length, 3);
});

test('a pair cannot be forced to start with only one connected player', () => {
  const { r, ps } = mk(2);
  r.start('display', 0);
  r.setConnected(ps[1].id, false);
  r.forceStart('display', 1);
  assert.equal(r.phase, 'briefing');
  r.setConnected(ps[1].id, true);
  play(r, 100);
  assert.equal(r.phase, 'playing');
  for (const p of ps) r.setConnected(p.id, false);
  r.finishGame(20000);
  assert.equal(r.phase, 'briefing');
  r.forceStart('display', 20001);
  assert.equal(r.phase, 'briefing', 'empty room waits for two connected players');
});

test('rooms keep accepting more than two players up to their documented limits', () => {
  for (const [format, cap] of [['party', 20], ['boat', 4]]) {
    const r = new Room('MORE', { format });
    r.addPlayer({ name: 'المضيف' }, { asHost: true });
    for (let i = 1; i < cap; i++) assert.ok(r.addPlayer({ name: 'صاحب' + i }).player);
    assert.equal(r.players.length, cap);
    assert.equal(r.addPlayer({ name: 'زيادة' }).error, 'room_full');
  }
});
