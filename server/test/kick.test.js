// The host can remove a player at any point of a round, and the round always goes on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';

const mk = (n) => {
  const r = new Room('KICK');
  const host = r.addPlayer({ name: 'المضيف' }, { asHost: true }).player;
  for (let i = 1; i < n; i++) r.addPlayer({ name: 'لاعب' + i });
  for (const p of r.players) p.connected = true;
  return { r, host };
};

test('removing a player mid-round drops them from the round, and every game still finishes', () => {
  for (const g of GAMES) {
    const { r, host } = mk(Math.max(4, g.minPlayers + 1));
    r.nextGameId = g.id;
    r.startGame(0);
    r.tick(10);
    assert.equal(r.phase, 'playing', g.id);
    // remove whoever the game is waiting on, when there is such a player
    const s = r.game.state;
    const turn = [s.duelists?.[s.kicks ? s.kicks.length % 2 : 0], s.holder, s.hustler, s.imposter].find((id) => id && id !== host.id);
    const victim = turn ?? r.game.roster.find((p) => p.id !== host.id).id;
    r.kick(host.id, victim);
    assert.ok(!r.players.some((p) => p.id === victim), g.id);
    assert.ok(!r.game.roster.some((p) => p.id === victim), `${g.id}: still in the round`);
    let now = 10;
    while (r.phase === 'playing' && now <= g.durationMs + 5000) r.tick((now += 250));
    assert.notEqual(r.phase, 'playing', `${g.id}: the round got stuck`);
    assert.ok(r.lastResult, g.id);
    assert.ok(Object.values(r.lastResult.points).every(Number.isFinite), g.id);
  }
});

test('only the host can remove players, and never the host', () => {
  const { r, host } = mk(3);
  const [, a, b] = r.players;
  r.nextGameId = GAMES[0].id;
  r.startGame(0);
  r.kick(a.id, b.id);
  assert.ok(r.player(b.id), 'a guest cannot remove anyone');
  r.kick(host.id, host.id);
  assert.ok(r.player(host.id), 'the host cannot be removed');
});
