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

test('boat ride: losses stop at 5 per player, getting off still pays +3', () => {
  const players = [{ id: 'a' }, { id: 'b' }];
  let b = createBoat(players, Math.random);
  const ctx = (now) => ({ now, rng: Math.random, connected: () => true, isHost: () => true });
  const boatCards = [5, 5, 5, 5, 5].map((r) => ({ r, s: 'C' }));
  const boatDeck = Array.from({ length: 30 }, () => ({ r: 9, s: 'H' }));
  b = { ...b, part: 5, stage: 'boat', crew: ['a'], riders: ['a'], off: [], splashed: [], idx: 0, boatCards, revealed: [false, false, false, false, false], boatDeck, guesses: {}, guessUntil: 1e12, attempts: 1 };
  const start = b.points.a;
  for (let i = 0; i < 12; i++) {
    b = boatAct(b, 'a', { type: 'guess', pick: 'lower' }, ctx(i * 20000)); // always wrong (9 > 5)
    b = boatTick(b, ctx(i * 20000 + 5000));
  }
  assert.equal(b.points.a - start, -5);
  for (let i = 12; i < 17; i++) {
    b = boatAct(b, 'a', { type: 'guess', pick: 'higher' }, ctx(i * 20000));
    b = boatTick(b, ctx(i * 20000 + 5000));
  }
  assert.ok(b.off.includes('a'));
  assert.equal(b.points.a - start, -5 + 3);
});

test('a normal loss scores 0 with no deduction; only stated worst cases cost 1, with a reason', () => {
  const r = new Room('WRST'); r.displayToken = 'tv';
  const ps = ['منى', 'ريم', 'ولاء'].map((name) => r.addPlayer({ name }).player);
  // Number Rush: the one who doesn't finish loses but is not deducted
  r.nextGameId = 'number-rush'; r.startGame(0);
  r.tick(10);
  r.game.state.qs.forEach((q, k) => {
    for (const p of ps.slice(1)) r.input(p.id, { type: 'answer', payload: { i: k, choice: q.answer } }, 100 + k);
  });
  r.tick(r.phaseEndsAt + 2100);
  assert.ok(r.lastResult.losers.includes(ps[0].id));
  assert.equal(r.lastResult.deductions[ps[0].id], undefined);
  assert.equal(ps[0].stats.points, 0);
  // Most Likely To: the sole most-voted is deducted, with the reason shown
  r.nextGameId = 'most-likely-to'; r.startGame(1000);
  for (const p of ps) r.input(p.id, { type: 'vote', payload: ps[1].id }, 1100);
  r.tick(1200);
  assert.deepEqual(r.lastResult.deductions[ps[1].id], { amount: 1, reason: 'خدت أكتر أصوات لوحدك' });
  assert.equal(r.lastResult.points[ps[1].id], -1);
  // a tie for most votes: nobody is deducted
  r.nextGameId = 'most-likely-to'; r.startGame(2000);
  r.input(ps[0].id, { type: 'vote', payload: ps[1].id }, 2100);
  r.input(ps[1].id, { type: 'vote', payload: ps[0].id }, 2100);
  r.input(ps[2].id, { type: 'vote', payload: ps[2].id }, 2100);
  r.tick(2200);
  assert.deepEqual(r.lastResult.deductions, {});
});

test('mission: +2 agent, −1 target, once, and only the target can confirm', () => {
  const r = new Room('MSSN'); r.displayToken = 'tv';
  const ps = ['منى', 'ريم', 'ولاء'].map((name) => r.addPlayer({ name }).player);
  r.updateSettings('display', { missions: true, enabledGames: ['most-likely-to'] });
  r.start('display', 0);
  const agent = ps[0];
  const target = r.player(r.missions[agent.id].target);
  r.claimMission(agent.id);
  const id = r.claims[0].id;
  r.answerClaim(agent.id, id, true); // not the target: ignored
  assert.equal(agent.stats.points, 0);
  r.answerClaim(target.id, id, true);
  r.answerClaim(target.id, id, true); // a repeat finds nothing
  assert.equal(agent.stats.points, 2);
  assert.equal(target.stats.points, -1);
});
