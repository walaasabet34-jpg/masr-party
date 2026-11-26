// Rules of the six replacement games.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../room.js';
import { GAMES, getGame } from '../games/index.js';
import { PROVERBS } from '../content/fresh.js';

const NEW = ['finish-proverb', 'zoom-in', 'order-up', 'number-rush', 'penalty-kicks', 'who-said-it'];
const OLD = ['would-you-rather', 'odd-one-out', 'big-fat-lie', 'herd-mentality', 'shell-shock', 'lone-wolf'];
const room = (n) => {
  const r = new Room('FRSH');
  r.displayToken = 'tv';
  const ps = Array.from({ length: n }, (_, i) => r.addPlayer({ name: 'p' + i }).player);
  return { r, ps };
};
const run = (r, id, at = 0) => {
  r.nextGameId = id;
  r.startGame(at);
  r.tick(at + 10);
};

test('the six old games are gone and the six new ones are offered', () => {
  assert.equal(GAMES.length, 30);
  for (const id of OLD) assert.equal(getGame(id), undefined, id);
  for (const id of NEW) assert.ok(getGame(id)?.isNew, id);
});

test('multiple-choice games: 4 different options and the right answer marked', () => {
  for (const id of ['finish-proverb', 'zoom-in', 'order-up']) {
    for (let k = 0; k < 30; k++) {
      const { r } = room(2);
      run(r, id);
      for (const q of r.game.state.qs) {
        assert.equal(q.options.length, 4, id);
        assert.equal(new Set(q.options.map((o) => JSON.stringify(o))).size, 4, id);
        assert.ok(q.answer >= 0 && q.answer < 4, id);
      }
    }
  }
  // proverbs: the marked option is the real ending
  const { r } = room(2);
  run(r, 'finish-proverb');
  for (const q of r.game.state.qs) {
    const p = PROVERBS.find((x) => x.start + ' …' === q.prompt);
    assert.equal(q.options[q.answer], p.end);
  }
  // order: the marked option is exactly the order that was shown
  const o = room(2);
  run(o.r, 'order-up');
  for (const q of o.r.game.state.qs) assert.deepEqual(q.options[q.answer], q.prompt.items);
});

test('number rush: tapping 1..12 in order wins; a wrong tap costs time', () => {
  const { r, ps } = room(2);
  run(r, 'number-rush');
  const qs = r.game.state.qs;
  assert.equal(qs.length, 12);
  assert.deepEqual(qs.map((q) => q.options[q.answer]), Array.from({ length: 12 }, (_, i) => i + 1));
  r.input(ps[1].id, { type: 'answer', payload: { i: 0, choice: qs[0].options.indexOf(5) } }, 50); // wrong tap
  qs.forEach((q, k) => {
    r.input(ps[0].id, { type: 'answer', payload: { i: k, choice: q.answer } }, 100 + k);
    r.input(ps[1].id, { type: 'answer', payload: { i: k, choice: q.answer } }, 100 + k);
  });
  r.tick(200);
  assert.equal(r.phase, 'briefing');
  assert.deepEqual(r.lastResult.winners, [ps[0].id]);
  assert.equal(r.lastResult.points[ps[0].id], 3);
  assert.equal(r.lastResult.points[ps[1].id], 0);
  assert.deepEqual(r.lastResult.deductions, {});
});

// penalty kicks: one match per round, turns alternate, picks secret until both lock
const pkSides = (r) => {
  const s = r.game.state;
  return { shooter: s.duelists[s.kicks.length % 2], keeper: s.duelists[(s.kicks.length + 1) % 2] };
};
// plays one kick; shot/dive null means that side never picks (the timer runs out)
const pkKick = (r, shot, dive, now) => {
  const { shooter, keeper } = pkSides(r);
  if (shot) r.input(shooter, { type: 'shoot', payload: shot }, now);
  if (dive) r.input(keeper, { type: 'dive', payload: dive }, now);
  r.tick(now + (shot && dive ? 50 : 8100));
  assert.equal(r.game.state.stage, 'reveal');
  const t = now + (shot && dive ? 50 : 8100) + 3600;
  r.tick(t);
  return t + 10;
};

test('penalty kicks: one match, turns alternate, a pick stays secret until both lock in', () => {
  const { r, ps } = room(2);
  run(r, 'penalty-kicks');
  const s0 = r.game.state;
  assert.deepEqual([...s0.duelists].sort(), ps.map((p) => p.id).sort());
  const { shooter, keeper } = pkSides(r);
  r.input(keeper, { type: 'shoot', payload: 'left' }, 20); // the keeper can't shoot
  r.input(shooter, { type: 'dive', payload: 'left' }, 20); // the shooter can't dive
  r.input(shooter, { type: 'shoot', payload: 'right' }, 20);
  r.input(shooter, { type: 'shoot', payload: 'left' }, 21); // a second pick is ignored
  r.tick(30);
  assert.equal(r.game.state.stage, 'choose', 'waits for the keeper');
  const keeperView = getGame('penalty-kicks').view(r.game.state, keeper, {});
  assert.ok(!JSON.stringify(keeperView).includes('right'), 'the keeper cannot see the shot');
  assert.equal(keeperView.shotLocked, true);
  r.input(keeper, { type: 'dive', payload: 'right' }, 40);
  r.tick(50);
  const k = r.game.state.kicks[0];
  assert.deepEqual([k.shooter, k.shot, k.dive, k.goal], [shooter, 'right', 'right', false]);
  r.tick(50 + 3600);
  assert.equal(pkSides(r).shooter, keeper, 'roles swap for the next kick');
});

test('penalty kicks: more goals after 3 each wins 2; fans who called it before the first kick get 1', () => {
  const { r, ps } = room(4);
  run(r, 'penalty-kicks');
  const [a, b] = r.game.state.duelists;
  const [early, late] = ps.map((p) => p.id).filter((id) => id !== a && id !== b);
  r.input(early, { type: 'bet', payload: a }, 15);
  r.input(a, { type: 'bet', payload: a }, 15); // players in the match can't bet
  let now = 20;
  now = pkKick(r, 'left', 'right', now); // a scores
  r.input(late, { type: 'bet', payload: a }, now); // too late: the first kick is taken
  for (let i = 0; i < 5; i++) now = pkKick(r, 'left', pkSides(r).shooter === a ? 'right' : 'left', now); // a always scores, b never
  if (r.phase === 'playing') r.tick(now + 100);
  assert.equal(r.phase, 'briefing');
  assert.equal(r.lastResult.points[a], 2);
  assert.equal(r.lastResult.points[b], 0);
  assert.equal(r.lastResult.points[early], 1);
  assert.equal(r.lastResult.points[late], 0);
  assert.match(r.lastResult.headline, /3–0|0–3/);
});

test('penalty kicks: a tie goes to extra kicks; still tied after them, both get 1', () => {
  const { r } = room(2);
  run(r, 'penalty-kicks');
  const [a, b] = r.game.state.duelists;
  let now = 20;
  for (let i = 0; i < 6; i++) now = pkKick(r, 'middle', 'middle', now); // every kick saved: 0–0
  assert.equal(r.phase, 'playing', 'tied after 3 each: extra kicks');
  assert.equal(r.game.state.stage, 'choose');
  for (let i = 0; i < 4; i++) now = pkKick(r, 'middle', 'middle', now);
  if (r.phase === 'playing') r.tick(now + 100);
  assert.equal(r.phase, 'briefing');
  assert.equal(r.lastResult.points[a], 1);
  assert.equal(r.lastResult.points[b], 1);
  assert.match(r.lastResult.headline, /تعادل/);
});

test('penalty kicks: extra kicks stop as soon as a pair is decided', () => {
  const { r } = room(2);
  run(r, 'penalty-kicks');
  const [a, b] = r.game.state.duelists;
  let now = 20;
  for (let i = 0; i < 6; i++) now = pkKick(r, 'middle', 'middle', now);
  now = pkKick(r, 'left', 'right', now); // a scores in extra time
  now = pkKick(r, 'left', 'left', now); // b is saved
  if (r.phase === 'playing') r.tick(now + 100);
  assert.equal(r.phase, 'briefing');
  assert.equal(r.lastResult.points[a], 2);
  assert.equal(r.lastResult.points[b], 0);
});

test('penalty kicks: no shot is a miss, no dive lets a shot in', () => {
  const { r } = room(2);
  run(r, 'penalty-kicks');
  pkKick(r, null, 'left', 20); // shooter never picks
  assert.equal(r.game.state.kicks[0].goal, false);
  const { r: r2 } = room(2);
  run(r2, 'penalty-kicks');
  pkKick(r2, 'left', null, 20); // keeper never picks
  assert.equal(r2.game.state.kicks[0].goal, true);
});

test('penalty kicks: if a player in the match is removed, the other wins and the round ends', () => {
  const { r } = room(3);
  run(r, 'penalty-kicks');
  const [a, b] = r.game.state.duelists;
  r.kick('display', pkSides(r).shooter); // the one whose turn it is
  const stayed = pkSides(r).shooter === a ? b : a;
  r.tick(100);
  if (r.phase === 'playing') r.tick(200);
  assert.equal(r.phase, 'briefing');
  assert.equal(r.lastResult.points[stayed], 2);
  assert.match(r.lastResult.headline, /خرج/);
});

test('who said it: anonymous answers, guesses score for guessers and authors', () => {
  const { r, ps } = room(3);
  run(r, 'who-said-it');
  const [a, b, c] = ps.map((p) => p.id);
  r.input(a, { type: 'answer', payload: 'كشري' }, 20);
  r.input(b, { type: 'answer', payload: '  ' }, 20); // blank is ignored
  r.input(b, { type: 'answer', payload: 'فول' }, 21);
  r.input(c, { type: 'answer', payload: 'محشي' }, 22);
  r.input(c, { type: 'answer', payload: 'تاني' }, 23); // only the first answer counts
  r.tick(100);
  let s = r.game.state;
  assert.equal(s.stage, 'guess');
  assert.equal(s.answers[c], 'محشي');
  let now = 100;
  for (let k = 0; k < s.queue.length; k++) {
    const author = r.game.state.queue[r.game.state.idx];
    // the view never names the author while guessing
    const v = getGame('who-said-it').view(r.game.state, a, r.gameCtx(now));
    assert.equal(v.author, null);
    r.input(author, { type: 'guess', payload: a }, now); // authors can't guess their own
    for (const id of [a, b, c].filter((x) => x !== author)) {
      r.input(id, { type: 'guess', payload: id }, now); // nor pick themselves
      r.input(id, { type: 'guess', payload: id === a ? author : [a, b, c].find((x) => x !== id && x !== author) }, now);
    }
    r.tick((now += 100));
    assert.equal(r.game.state.stage, 'reveal');
    r.tick((now += 4100));
  }
  assert.equal(r.phase, 'briefing');
  // a always guessed right (3 answers, 2 of them not his): +2
  assert.ok(r.lastResult.winners.includes(a));
  assert.equal(r.lastResult.points[a], 3);
  s = r.lastResult;
  assert.ok(!JSON.stringify(s.table).includes('كشري')); // results never list who wrote what
});

test('who said it: fewer than two answers ends with no points', () => {
  const { r, ps } = room(3);
  run(r, 'who-said-it');
  r.input(ps[0].id, { type: 'answer', payload: 'بس أنا' }, 20);
  r.tick(10 + 40100);
  assert.equal(r.phase, 'briefing');
  assert.ok(ps.every((p) => p.stats.points === 0));
});
