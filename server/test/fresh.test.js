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

test('penalty kicks: goals and saves add up over 3 rounds', () => {
  for (const n of [2, 3]) {
    const { r, ps } = room(n);
    run(r, 'penalty-kicks');
    let now = 10;
    const s0 = r.game.state;
    for (let round = 0; round < 3; round++) {
      const s = r.game.state;
      // everyone shoots right; the first player in the order dives right (saves), the rest dive left
      for (const id of s.order) {
        r.input(id, { type: 'shoot', payload: 'right' }, now);
        r.input(id, { type: 'dive', payload: id === s0.order[0] ? 'right' : 'left' }, now);
        r.input(id, { type: 'shoot', payload: 'left' }, now); // a second choice is ignored
      }
      r.tick((now += 100));
      assert.equal(r.game.state.stage, 'reveal');
      r.tick((now += 4100));
    }
    if (r.phase === 'playing') r.tick((now += 100));
    assert.equal(r.phase, 'briefing', `n=${n}`);
    const keeper = s0.order[0];
    // the keeper saved one shot per round and scored on everyone except
    const score = (id) => (r.lastResult.table.rows.find((x) => x.id === id).value | 0);
    assert.equal(score(keeper), 3 + 3); // 3 saves + 3 goals (nobody else dives right)
    assert.ok(ps.every((p) => Number.isFinite(r.lastResult.points[p.id])));
    assert.ok(r.lastResult.winners.includes(keeper));
  }
});

test('penalty kicks: no shot is no goal, no dive is no save', () => {
  const { r, ps } = room(2);
  run(r, 'penalty-kicks');
  r.input(ps[0].id, { type: 'shoot', payload: 'middle' }, 20);
  r.tick(10 + 9100); // time runs out
  const last = r.game.state.last;
  assert.equal(last.find((k) => k.shooter === ps[0].id).goal, true); // keeper never dived
  assert.equal(last.find((k) => k.shooter === ps[1].id).goal, false); // never shot
  assert.equal(r.game.state.saves[ps[0].id] ?? 0, 0);
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
