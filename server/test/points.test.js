import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../room.js';
import { GAMES, META } from '../games/index.js';
import { createBoat, boatAct, boatTick, boatAwards, cardTxt } from '../boat.js';

const setup = () => {
  const r = new Room('PNTS'); r.displayToken = 'tv';
  const ps = ['منى', 'ريم', 'ولاء'].map((name) => r.addPlayer({ name }).player);
  return { r, ps };
};

test('all 30 games resolve through server scoring with finite values and no confirmation state', () => {
  assert.equal(GAMES.length, 30);
  for (const g of GAMES) {
    const { r, ps } = setup();
    // Use enough players even for games that require a larger group.
    while (r.players.length < g.minPlayers) r.addPlayer({ name: 'ضيف' });
    r.nextGameId = g.id; r.startGame(0);
    for (let n = 0; n <= g.durationMs + 10000 && r.phase === 'playing'; n += 1000) r.tick(n);
    if (r.phase === 'playing') r.finishGame(g.durationMs + 10001);
    assert.equal(r.phase, 'briefing', g.id);
    const result = r.lastResult;
    for (const p of r.players) {
      assert.ok(Number.isFinite(p.stats.points), g.id);
      const expected = (result.earned[p.id] ?? 0) - (result.deductions[p.id]?.amount ?? 0);
      assert.equal(result.points[p.id], expected, g.id);
      assert.equal(p.stats.points, expected, g.id);
      r.playerReady(p.id);
    }
    assert.equal(r.waitingOn().length, 0, g.id);
    assert.equal('assignments' in result, false);
    assert.equal('noDrinks' in r.settings, false);
    const before = ps.map((p) => p.stats.points);
    r.finishGame(999999); r.tick(999999);
    assert.deepEqual(ps.map((p) => p.stats.points), before, g.id);
  }
  assert.ok(!/يشرب|تشرب|شوت|شفطة|🍺|🥃/.test(JSON.stringify(META)));
});

test('missions reward once, skipped rounds are neutral, tied champions are all shown', () => {
  const { r, ps } = setup();
  r.settings.missions = true; r.assignMission(ps[0].id); r.claimMission(ps[0].id);
  const claim = r.claims[0];
  r.answerClaim(ps[1].id === claim.target ? ps[2].id : ps[1].id, claim.id, true);
  assert.equal(ps[0].stats.points, 0);
  r.answerClaim(claim.target, claim.id, true);
  r.answerClaim(claim.target, claim.id, true);
  assert.equal(ps[0].stats.points, 2);
  r.nextGameId = 'tap-race'; r.startGame(0); r.skipRound('display', 1);
  assert.ok(Object.values(r.lastResult.points).every((n) => n === 0));
  assert.equal(ps[0].stats.points, 2);
  for (const p of ps) p.stats.points = 5;
  r.endNight();
  assert.equal(r.awards.filter((a) => a.key.startsWith('champion-')).length, 3);
});

test('boat plays all five parts with automatic turns, safe pyramid retries and points awards', () => {
  const ids = ['a', 'b']; let clock = 0;
  const ctx = () => ({ now: clock, rng: () => 0.37, connected: () => true, isHost: (id) => id === 'a' });
  let b = createBoat(ids.map((id) => ({ id })), ctx().rng);
  for (let guard = 0; guard < 500 && b.stage !== 'over'; guard++) {
    if (b.stage === 'rules') {
      for (const id of ids) b = boatAct(b, id, { type: 'ready' }, ctx());
      b = boatTick(b, ctx());
    } else if (b.stage === 'play') {
      if (!b.pending) {
        const id = b.order[b.turn]; const other = ids.find((x) => x !== id);
        const pick = { 1: 'red', 2: 'higher', 3: 'between' }[b.part];
        assert.equal(boatAct(b, other, { type: 'pick', pick }, ctx()), b);
        const before = b.points[id];
        b = boatAct(b, id, { type: 'pick', pick }, ctx());
        assert.equal(b.points[id] - before, b.pending.delta);
        assert.equal(boatAct(b, id, { type: 'pick', pick }, ctx()), b);
      }
      clock += 2600; b = boatTick(b, ctx());
    } else if (b.stage === 'pyramid') {
      for (const id of ids) {
        let i = b.hands[id].findIndex((c) => b.rows[b.row].some((r) => r.r === c.r));
        while (i >= 0) {
          const act = { type: 'place', i, card: cardTxt(b.hands[id][i]) };
          const before = b.points[id]; const row = b.row;
          b = boatAct(b, id, act, ctx());
          assert.equal(b.points[id] - before, row + 1);
          assert.equal(boatAct(b, id, act, ctx()), b, 'stale index/card replay ignored');
          i = b.hands[id].findIndex((c) => b.rows[b.row].some((r) => r.r === c.r));
        }
      }
      clock += 31000; b = boatTick(b, ctx());
    } else if (b.stage === 'boat') {
      if (b.flip) { clock += 4000; b = boatTick(b, ctx()); }
      else if (b.boatDeck.length) {
        const pick = b.boatDeck[0].r > b.boatCards[b.idx].r ? 'higher' : 'lower';
        for (const id of [...b.riders]) b = boatAct(b, id, { type: 'guess', pick }, ctx());
      } else { clock += 31000; b = boatTick(b, ctx()); }
    }
  }
  assert.equal(b.stage, 'over');
  assert.equal(b.part, 5);
  assert.ok(Object.values(b.points).every(Number.isFinite));
  assert.ok(boatAwards(b, ids.map((id) => ({ id }))).some((a) => a.key.startsWith('champion-')));
});
