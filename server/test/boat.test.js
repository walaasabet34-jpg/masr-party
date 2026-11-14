// The Boat in points: pyramid cards pay the row number, the boat ride costs 1 per miss, +3 to get off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoat, boatAct, boatTick } from '../boat.js';

const ctx = (now, host = 'a') => ({ now, rng: Math.random, connected: () => true, isHost: (id) => id === host });
const players = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('pyramid: laying a matching card pays the row number once, and only for a match', () => {
  let b = createBoat(players, Math.random);
  b = { ...b, part: 4, stage: 'pyramid', row: 2, rows: [[], [], [{ r: 9, s: 'H' }]], hands: { a: [{ r: 9, s: 'S' }, { r: 4, s: 'D' }], b: [], c: [] } };
  const n = boatAct(b, 'a', { type: 'place', i: 0 }, ctx(0));
  assert.equal(n.score.a.points, 3);
  assert.equal(n.hands.a.length, 1);
  const again = boatAct(n, 'a', { type: 'place', i: 0 }, ctx(0)); // the 4 doesn't match row 3
  assert.equal(again.score.a.points, 3);
});

test('boat ride: −1 per wrong guess, +3 for getting off, applied once per flip', () => {
  let b = createBoat(players, Math.random);
  const boatCards = [5, 5, 5, 5, 5].map((r) => ({ r, s: 'C' }));
  const boatDeck = [{ r: 2, s: 'H' }, ...[9, 9, 9, 9, 9].map((r) => ({ r, s: 'H' }))];
  b = { ...b, part: 5, stage: 'boat', crew: ['a', 'b'], riders: ['a', 'b'], off: [], splashed: [], idx: 0, boatCards, revealed: [false, false, false, false, false], boatDeck, guesses: {}, guessUntil: 1e12, attempts: 1 };
  // card 2 vs 5: "lower" right for a, "higher" wrong for b
  b = boatAct(b, 'a', { type: 'guess', pick: 'lower' }, ctx(0));
  b = boatAct(b, 'b', { type: 'guess', pick: 'higher' }, ctx(0));
  assert.equal(b.score.b.points, -1);
  assert.equal(b.score.a.points, 0);
  b = boatTick(b, { ...ctx(10000) }); // after the flip shows
  b = boatTick(b, { ...ctx(10001) });
  assert.equal(b.score.b.points, -1, 'ticks must not apply the flip again');
  for (let i = 1; i < 5; i++) {
    b = boatAct(b, 'a', { type: 'guess', pick: 'higher' }, ctx(i * 20000));
    b = boatTick(b, ctx(i * 20000 + 5000));
  }
  assert.ok(b.off.includes('a'));
  assert.equal(b.score.a.points, 3);
});

test('boat ride losses are capped at 5 points', () => {
  let b = createBoat(players, Math.random);
  const boatCards = [5, 5, 5, 5, 5].map((r) => ({ r, s: 'C' }));
  const boatDeck = Array.from({ length: 20 }, () => ({ r: 9, s: 'H' }));
  b = { ...b, part: 5, stage: 'boat', crew: ['a'], riders: ['a'], off: [], splashed: [], idx: 0, boatCards, revealed: [false, false, false, false, false], boatDeck, guesses: {}, guessUntil: 1e12, attempts: 1 };
  for (let i = 0; i < 12; i++) {
    b = boatAct(b, 'a', { type: 'guess', pick: 'lower' }, ctx(i * 20000));
    b = boatTick(b, ctx(i * 20000 + 5000));
  }
  assert.equal(b.score.a.points, -5);
  assert.ok(b.score.a.wrong >= 10);
});
