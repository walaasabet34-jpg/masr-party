// A party room: the server owns state, randomness, timers and scoring.
import { randomBytes } from 'node:crypto';
import { GAMES, getGame, META } from './games/index.js';
import { rng, shuffle, cleanText } from './lib/util.js';
import { penaltyFor } from './penalty.js';
import { MISSIONS } from './content/missions.js';
import { Chat } from './chat.js';
import { createBoat, boatTick, boatAct, boatView, boatAwards, BOAT_MAX } from './boat.js';

export const PARTY_MAX = 20;
const INTRO_MS = 3500;
const ROUND_OPTIONS = [10, 15, 20, 30, 0];
export const COLORS = ['magenta', 'lime', 'cyan', 'orange', 'violet', 'yellow', 'mint', 'pink', 'blue', 'red'];

const token = () => randomBytes(16).toString('hex');
const pid = () => 'p' + randomBytes(5).toString('hex');

export class Room {
  constructor(code, { mode = 'medium', format = 'party', noDrinks = false } = {}) {
    this.code = code;
    this.createdAt = Date.now();
    this.lastActive = Date.now();
    this.hostId = null; // player id of a phone host
    this.displayToken = null; // big-screen host
    this.settings = {
      mode: ['lite', 'medium', 'hardcore'].includes(mode) ? mode : 'medium',
      format: format === 'boat' ? 'boat' : 'party',
      noDrinks: !!noDrinks && format !== 'boat',
      enabledGames: [],
      totalRounds: 10,
      missions: false,
      locked: false,
    };
    this.players = [];
    this.kicked = new Set();
    this.phase = 'lobby';
    this.round = 0;
    this.game = null; // { id, state, roster }
    this.nextGameId = null;
    this.fallbackNote = null;
    this.phaseEndsAt = null;
    this.lastResult = null;
    this.ready = [];
    this.steps = {};
    this.sideDrinks = [];
    this.missions = {};
    this.claims = [];
    this.seen = new Set();
    this.recent = [];
    this.history = [];
    this.awards = null;
    this.boat = null;
    this.closed = null;
    this.version = 0;
    this.chat = new Chat((m) => this.onChat?.(m));
  }

  // ------------------------------------------------------------ helpers
  touch() {
    this.version++;
    this.lastActive = Date.now();
  }
  player(id) {
    return this.players.find((p) => p.id === id);
  }
  active() {
    return this.players.filter((p) => !p.excluded && !p.late);
  }
  isHost(id) {
    return !!id && id === this.hostId;
  }
  canDrink(p) {
    return !!p && !p.sober && !this.settings.noDrinks;
  }
  maxPlayers() {
    return this.settings.format === 'boat' ? BOAT_MAX : PARTY_MAX;
  }

  // ------------------------------------------------------------ joining
  addPlayer(info, { asHost = false } = {}) {
    const existing = info.playerId && this.player(info.playerId);
    if (existing) {
      if (existing.token !== info.token) return { error: 'seat_taken' };
      existing.connected = true;
      existing.awaySince = null;
      if (existing.excluded && this.phase !== 'playing') existing.excluded = false;
      this.applyLook(existing, info);
      this.touch();
      return { player: existing };
    }
    if (info.token && this.kicked.has(info.token)) return { error: 'kicked' };
    if (this.settings.locked) return { error: 'room_locked' };
    if (this.players.length >= this.maxPlayers()) return { error: 'room_full' };
    const p = {
      id: pid(),
      token: token(),
      name: 'لاعب',
      color: COLORS[this.players.length % COLORS.length],
      sticker: '🐙',
      sober: false,
      connected: true,
      awaySince: null,
      excluded: false,
      late: this.phase === 'boat' || this.phase === 'playing' || this.phase === 'intro',
      joinedAt: Date.now(),
      stats: { drinks: 0, sips: 0, points: 0, rouletteHits: 0, reflexWins: 0, wins: 0, missionsDone: 0 },
    };
    this.applyLook(p, info);
    this.players.push(p);
    this.chat.system('join', p);
    if (asHost) this.hostId = p.id;
    if (this.settings.missions && this.phase !== 'lobby') this.assignMission(p.id);
    this.touch();
    return { player: p };
  }

  applyLook(p, info) {
    const name = cleanText(info.name, 16);
    if (name) p.name = name;
    if (COLORS.includes(info.color)) p.color = info.color;
    if (typeof info.sticker === 'string' && [...info.sticker].length <= 3) p.sticker = info.sticker;
    if (typeof info.sober === 'boolean' && this.phase === 'lobby') p.sober = info.sober;
  }

  setConnected(id, on) {
    const p = this.player(id);
    if (!p) return;
    p.connected = on;
    p.awaySince = on ? null : Date.now();
    if (on && p.awayAnnounced) {
      p.awayAnnounced = false;
      this.chat.system('back', p);
    }
    this.touch();
  }

  leave(id) {
    const p = this.player(id);
    if (!p) return;
    if (this.isHost(id) && !this.displayToken) {
      this.closed = 'host_left';
      return;
    }
    this.players = this.players.filter((x) => x.id !== id);
    this.ready = this.ready.filter((x) => x !== id);
    delete this.missions[id];
    this.chat.system('left', p);
    if (this.isHost(id)) this.hostId = null;
    this.touch();
  }

  // ------------------------------------------------------------ host commands
  updateSettings(by, patch) {
    if (!this.canControl(by)) return;
    const s = this.settings;
    if (patch.mode && ['lite', 'medium', 'hardcore'].includes(patch.mode) && this.phase === 'lobby') s.mode = patch.mode;
    if (Array.isArray(patch.enabledGames)) {
      const ids = patch.enabledGames.filter((id) => getGame(id));
      if (!ids.length || ids.some((id) => id !== 'roulette')) s.enabledGames = ids.length === GAMES.length ? [] : ids;
    }
    if (ROUND_OPTIONS.includes(patch.totalRounds) && (patch.totalRounds === 0 || patch.totalRounds > this.round)) s.totalRounds = patch.totalRounds;
    if (typeof patch.missions === 'boolean' && this.phase === 'lobby') s.missions = patch.missions;
    if (typeof patch.locked === 'boolean') s.locked = patch.locked;
    if (typeof patch.noDrinks === 'boolean' && this.phase === 'lobby' && s.format === 'party') s.noDrinks = patch.noDrinks;
    if (patch.format && this.phase === 'lobby' && ['party', 'boat'].includes(patch.format)) {
      s.format = patch.format;
      if (s.format === 'boat') s.noDrinks = false;
    }
    this.touch();
  }

  canControl(by) {
    return by === 'display' || this.isHost(by);
  }

  kick(by, id) {
    if (!this.canControl(by) || id === this.hostId) return;
    const p = this.player(id);
    if (!p) return;
    this.kicked.add(p.token);
    this.players = this.players.filter((x) => x.id !== id);
    this.chat.system('kicked', p);
    this.ready = this.ready.filter((x) => x !== id);
    this.touch();
    return p;
  }

  exclude(by, id) {
    if (!this.canControl(by)) return;
    const p = this.player(id);
    if (!p || p.connected) return;
    p.excluded = true;
    this.touch();
  }

  // ------------------------------------------------------------ flow
  start(by, now) {
    if (!this.canControl(by) || this.phase !== 'lobby') return;
    const n = this.players.filter((p) => p.connected).length;
    if (n < 2) return;
    for (const p of this.players) {
      p.late = false;
      p.excluded = !p.connected;
    }
    if (this.settings.format === 'boat') {
      if (n > BOAT_MAX) return;
      this.boat = createBoat(this.active(), rng);
      this.phase = 'boat';
      this.touch();
      return;
    }
    this.round = 0;
    this.lastResult = null;
    this.history = [];
    if (this.settings.missions) for (const p of this.players) this.assignMission(p.id);
    this.pickNext();
    this.enterBriefing(now);
  }

  enabledIds() {
    const s = this.settings.enabledGames;
    return s.length ? s : GAMES.map((g) => g.id);
  }

  pickNext() {
    const n = this.active().length;
    const enabled = this.enabledIds().map(getGame);
    let pool = enabled.filter((g) => g.minPlayers <= n);
    this.fallbackNote = null;
    if (!pool.length) {
      pool = GAMES.filter((g) => g.minPlayers <= n && g.id !== 'roulette');
      const need = Math.min(...enabled.map((g) => g.minPlayers));
      this.fallbackNote = { need, games: enabled.slice(0, 3).map((g) => g.name) };
    }
    let cand = pool.filter((g) => !this.recent.slice(-3).includes(g.id));
    if (this.round === 0) cand = cand.filter((g) => g.id !== 'roulette');
    if (!cand.length) cand = pool;
    const total = cand.reduce((a, g) => a + (g.weight ?? 1), 0);
    let x = rng() * total;
    let pick = cand[cand.length - 1];
    for (const g of cand) {
      x -= g.weight ?? 1;
      if (x <= 0) {
        pick = g;
        break;
      }
    }
    this.nextGameId = pick.id;
    if (this.fallbackNote) this.fallbackNote.game = pick.name;
  }

  enterBriefing(now) {
    this.phase = 'briefing';
    this.phaseEndsAt = null;
    this.ready = [];
    this.steps = {};
    for (const p of this.players) {
      p.late = false;
      if (p.excluded && p.connected) p.excluded = false;
    }
    this.touch();
  }

  isFinal() {
    return this.settings.totalRounds > 0 && this.round >= this.settings.totalRounds;
  }

  playerReady(id) {
    if (this.phase !== 'briefing' || this.ready.includes(id)) return;
    const p = this.player(id);
    if (!p) return;
    if (this.owesDrink(id)) return; // finish your drink first
    this.ready.push(id);
    this.steps[id] = 'ready';
    this.touch();
  }

  setStep(id, step) {
    if (this.phase !== 'briefing' || !['results', 'rules', 'check'].includes(step)) return;
    if (this.steps[id] === step) return;
    this.steps[id] = step;
    this.touch();
  }

  owesDrink(id) {
    const a = this.lastResult?.assignments.find((x) => x.playerId === id && x.resolved === 'pending');
    return !!a || this.sideDrinks.some((d) => d.playerId === id && d.resolved === 'pending');
  }

  waitingOn() {
    const people = this.players.filter((p) => !p.excluded);
    return people.filter((p) => !this.ready.includes(p.id) || this.owesDrink(p.id));
  }

  forceStart(by, now) {
    if (!this.canControl(by)) return;
    if (this.phase === 'briefing') {
      for (const a of this.lastResult?.assignments ?? []) if (a.resolved === 'pending') a.resolved = 'done';
      for (const d of this.sideDrinks) if (d.resolved === 'pending') d.resolved = 'done';
      this.advanceFromBriefing(now);
    }
  }

  advanceFromBriefing(now) {
    if (this.isFinal()) return this.endNight();
    this.phase = 'intro';
    this.phaseEndsAt = now + INTRO_MS;
    this.game = null;
    this.touch();
  }

  startGame(now) {
    const g = getGame(this.nextGameId);
    const roster = this.active().filter((p) => p.connected || !p.awaySince || now - p.awaySince < 20000);
    const players = roster.map((p) => ({ id: p.id, name: p.name, sober: !this.canDrink(p) }));
    const ctx = { rng, players, mode: this.settings.mode, seen: this.seen, now };
    this.game = { id: g.id, roster: players, state: g.setup(ctx), startedAt: now };
    this.round += 1;
    this.recent.push(g.id);
    this.phase = 'playing';
    this.phaseEndsAt = now + g.durationMs;
    this.touch();
  }

  gameCtx(now) {
    return { rng, players: this.game.roster, mode: this.settings.mode, seen: this.seen, now };
  }

  input(id, inp, now) {
    if (this.phase !== 'playing' || !this.game || !this.game.roster.some((p) => p.id === id)) return;
    if (!inp || typeof inp.type !== 'string') return;
    const g = getGame(this.game.id);
    const next = g.onInput(this.game.state, id, inp, this.gameCtx(now));
    if (next !== this.game.state) {
      this.game.state = next;
      this.touch();
    }
  }

  tick(now) {
    for (const p of this.players) {
      if (!p.connected && !p.awayAnnounced && p.awaySince && now - p.awaySince > 8000) {
        p.awayAnnounced = true;
        this.chat.system('away', p);
      }
    }
    if (this.phase === 'intro' && now >= this.phaseEndsAt) this.startGame(now);
    else if (this.phase === 'playing') {
      const g = getGame(this.game.id);
      const ctx = this.gameCtx(now);
      if (g.onTick) {
        const n = g.onTick(this.game.state, ctx);
        if (n !== this.game.state) {
          this.game.state = n;
          this.touch();
        }
      }
      if (g.isComplete(this.game.state, ctx) || now >= this.phaseEndsAt + 2000) this.finishGame(now);
    } else if (this.phase === 'briefing') {
      if (this.players.some((p) => !p.excluded) && !this.waitingOn().length) this.advanceFromBriefing(now);
    } else if (this.phase === 'boat' && this.boat) {
      const n = boatTick(this.boat, this.boatCtx(now));
      if (n !== this.boat) {
        this.boat = n;
        this.touch();
      }
    }
  }

  finishGame(now, skipped = false) {
    const g = getGame(this.game.id);
    const ctx = this.gameCtx(now);
    const res = skipped ? { headline: 'الجولة اتلغت. محدش يشرب المرة دي.', winners: [], losers: [], tier: 'small', points: {}, table: { layout: 'list', rows: [] } } : g.resolve(this.game.state, ctx);
    const assignments = [];
    for (const id of res.losers) {
      const p = this.player(id);
      if (!p) continue;
      const tier = res.tierByPlayer?.[id] ?? res.tier;
      const canDrink = this.canDrink(p);
      const judge = canDrink ? this.pickJudge(id, res.losers) : null;
      assignments.push({ playerId: id, tier, penalty: penaltyFor(this.settings.mode, tier, rng), judge, resolved: canDrink ? 'pending' : 'skipped', saidNo: 0 });
      p.stats.drinks += canDrink ? 1 : 0;
      if (g.id === 'roulette') p.stats.rouletteHits += 1;
    }
    for (const [id, pts] of Object.entries(res.points ?? {})) {
      const p = this.player(id);
      if (p) p.stats.points += pts;
    }
    for (const id of res.winners) {
      const p = this.player(id);
      if (!p) continue;
      p.stats.wins += 1;
      if (g.kind === 'reflex') p.stats.reflexWins += 1;
    }
    this.lastResult = {
      gameId: g.id,
      round: this.round,
      headline: res.headline,
      winners: res.winners,
      losers: res.losers,
      tier: res.tier,
      table: res.table,
      reveal: res.reveal ?? null,
      points: res.points ?? {},
      gallery: res.gallery ?? null,
      assignments,
      roster: this.game.roster.map((p) => p.id),
    };
    this.history.push({ round: this.round, gameId: g.id, headline: res.headline });
    this.game = null;
    if (!this.isFinal()) this.pickNext();
    else this.nextGameId = null;
    this.enterBriefing(now);
  }

  skipRound(by, now) {
    if (!this.canControl(by)) return;
    if (this.phase === 'playing') this.finishGame(now, true);
    else if (this.phase === 'intro') {
      this.pickNext();
      this.enterBriefing(now);
    }
  }

  pickJudge(drinker, losers = []) {
    const others = this.players.filter((p) => p.id !== drinker && p.connected && !p.excluded);
    const sober = others.filter((p) => !losers.includes(p.id));
    const pool = sober.length ? sober : others;
    return pool.length ? pool[Math.floor(rng() * pool.length)].id : null;
  }

  judgeDrink(by, { kind, id, yes }) {
    const item = kind === 'side' ? this.sideDrinks.find((d) => d.id === id) : this.lastResult?.assignments.find((a) => a.playerId === id);
    if (!item || item.resolved !== 'pending') return;
    const allowed = this.canControl(by) || by === item.judge || (!item.judge && by !== item.playerId);
    if (!allowed) return;
    if (yes) {
      item.resolved = 'done';
      const p = this.player(item.playerId);
      if (p) p.stats.sips += item.penalty.kind === 'sip' ? item.penalty.count : item.penalty.kind === 'shot' ? 3 : 6;
    } else item.saidNo = (item.saidNo ?? 0) + 1;
    this.touch();
  }

  // judge went away? hand the job to someone else on request of the drinker
  reassignJudge(by, { kind, id }) {
    const item = kind === 'side' ? this.sideDrinks.find((d) => d.id === id) : this.lastResult?.assignments.find((a) => a.playerId === id);
    if (!item || item.resolved !== 'pending' || item.playerId !== by) return;
    const j = this.player(item.judge);
    if (j && j.connected) return;
    item.judge = this.pickJudge(item.playerId, this.lastResult?.losers);
    this.touch();
  }

  // ------------------------------------------------------------ missions
  assignMission(id) {
    const others = this.players.filter((p) => p.id !== id);
    if (!others.length) return;
    const target = others[Math.floor(rng() * others.length)];
    this.missions[id] = { text: MISSIONS[Math.floor(rng() * MISSIONS.length)], target: target.id };
  }

  claimMission(id) {
    const m = this.missions[id];
    if (!m || this.claims.some((c) => c.from === id)) return;
    this.claims.push({ id: 'c' + randomBytes(3).toString('hex'), from: id, target: m.target, text: m.text });
    this.touch();
  }

  answerClaim(by, claimId, yes) {
    const c = this.claims.find((x) => x.id === claimId);
    if (!c || c.target !== by) return;
    this.claims = this.claims.filter((x) => x !== c);
    if (yes) {
      const from = this.player(c.from);
      const target = this.player(c.target);
      if (from) from.stats.missionsDone += 1;
      if (target && this.canDrink(target)) {
        this.sideDrinks.push({ id: 's' + randomBytes(3).toString('hex'), playerId: target.id, judge: c.from, penalty: penaltyFor(this.settings.mode, 'small', rng), resolved: 'pending', reason: 'mission', from: c.from, saidNo: 0 });
        target.stats.drinks += 1;
      }
      if (from) from.stats.points += 2;
      this.assignMission(c.from);
    }
    this.touch();
  }

  // ------------------------------------------------------------ the end
  endNight() {
    // nothing is left to judge once the night is over
    for (const a of this.lastResult?.assignments ?? []) if (a.resolved === 'pending') a.resolved = 'skipped';
    for (const d of this.sideDrinks) if (d.resolved === 'pending') d.resolved = 'skipped';
    this.claims = [];
    if (this.phase === 'boat') {
      this.awards = boatAwards(this.boat, this.players);
      for (const p of this.players) p.stats.sips = this.boat.sips[p.id]?.drunk ?? 0;
      this.phase = 'ended';
      this.touch();
      return;
    }
    const ps = this.players;
    const best = (f) => (ps.length ? [...ps].sort((a, b) => f(b) - f(a))[0] : null);
    const awards = [];
    if (ps.length) {
      const champ = best((p) => p.stats.points);
      awards.push({ key: 'champion', title: 'البطل', icon: '🏆', pid: champ.id, value: `${champ.stats.points} نقطة` });
      if (!this.settings.noDrinks) {
        const drunk = best((p) => p.stats.drinks);
        if (drunk.stats.drinks) awards.push({ key: 'mostDrunk', title: 'أكتر واحد شرب', icon: '🍺', pid: drunk.id, value: `${drunk.stats.drinks} مرة` });
      }
      const fast = best((p) => p.stats.reflexWins);
      if (fast.stats.reflexWins) awards.push({ key: 'fastest', title: 'أسرع صوابع', icon: '⚡', pid: fast.id, value: `${fast.stats.reflexWins} مكسب` });
      const surv = best((p) => -p.stats.drinks * 100 + p.stats.points);
      awards.push({ key: 'survivor', title: 'الناجي', icon: '🛟', pid: surv.id, value: this.settings.noDrinks ? `${surv.stats.points} نقطة` : `${surv.stats.drinks} مرة بس` });
      const mag = best((p) => p.stats.rouletteHits);
      if (mag.stats.rouletteHits) awards.push({ key: 'magnet', title: 'مغناطيس الروليت', icon: '🎯', pid: mag.id, value: `${mag.stats.rouletteHits}×` });
      const agent = best((p) => p.stats.missionsDone);
      if (agent.stats.missionsDone) awards.push({ key: 'agent', title: 'العميل السري', icon: '🕶️', pid: agent.id, value: `${agent.stats.missionsDone} مهمة` });
    }
    this.awards = awards;
    this.phase = 'ended';
    this.phaseEndsAt = null;
    this.touch();
  }

  end(by) {
    if (!this.canControl(by)) return;
    if (this.phase === 'lobby' || this.phase === 'ended') return;
    if (this.phase === 'playing' && this.game) this.game = null;
    this.endNight();
  }

  toLobby(by) {
    if (!this.canControl(by)) return;
    this.phase = 'lobby';
    this.round = 0;
    this.game = null;
    this.boat = null;
    this.lastResult = null;
    this.awards = null;
    this.ready = [];
    this.steps = {};
    this.sideDrinks = [];
    this.claims = [];
    this.missions = {};
    this.recent = [];
    this.history = [];
    for (const p of this.players) {
      p.late = false;
      p.excluded = false;
      p.stats = { drinks: 0, sips: 0, points: 0, rouletteHits: 0, reflexWins: 0, wins: 0, missionsDone: 0 };
    }
    this.touch();
  }

  playAgain(by, now) {
    if (!this.canControl(by) || this.phase !== 'ended') return;
    this.toLobby(by);
    this.start(by, now);
  }

  // ------------------------------------------------------------ boat
  boatCtx(now) {
    return {
      now,
      rng,
      connected: (id) => !!this.player(id)?.connected,
      isHost: (id) => this.canControl(id),
      skipDrink: (id) => !this.canDrink(this.player(id)),
    };
  }
  boatAction(by, act, now) {
    if (this.phase !== 'boat' || !this.boat) return;
    const n = boatAct(this.boat, by, act, this.boatCtx(now));
    if (n !== this.boat) {
      this.boat = n;
      this.touch();
    }
  }

  // ------------------------------------------------------------ snapshots
  snapshot(viewer, now) {
    const me = viewer.role === 'player' ? viewer.playerId : null;
    const g = this.game && getGame(this.game.id);
    const gameView = this.phase === 'playing' && g ? g.view(this.game.state, me, this.gameCtx(now)) : null;
    const snap = {
      code: this.code,
      serverNow: now,
      version: this.version,
      role: viewer.role,
      me,
      hostId: this.hostId,
      hasDisplay: !!this.displayToken,
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        sticker: p.sticker,
        sober: p.sober,
        connected: p.connected,
        awayFor: p.awaySince ? now - p.awaySince : 0,
        excluded: p.excluded,
        late: p.late,
        stats: { drinks: p.stats.drinks, points: p.stats.points, sips: p.stats.sips },
      })),
      phaseEndsAt: this.phaseEndsAt,
      currentGameId: this.game?.id ?? null,
      roster: this.game ? this.game.roster.map((p) => p.id) : null,
      nextGameId: this.nextGameId,
      fallbackNote: this.fallbackNote,
      final: this.isFinal(),
      game: gameView,
      lastResult: this.lastResult,
      ready: this.ready,
      steps: this.steps,
      waitingOn: this.phase === 'briefing' ? this.waitingOn().map((p) => p.id) : [],
      sideDrinks: this.sideDrinks.filter((d) => d.resolved === 'pending'),
      mission: me && this.missions[me] ? { ...this.missions[me], claimed: this.claims.some((c) => c.from === me) } : null,
      claims: me ? this.claims.filter((c) => c.target === me) : [],
      history: this.history.slice(-30),
      awards: this.awards,
      boat: this.phase === 'boat' && this.boat ? boatView(this.boat, me) : null,
      waterBreak: this.phase === 'briefing' && this.round > 0 && this.round % 5 === 0 && !this.isFinal(),
    };
    if (me) {
      const p = this.player(me);
      if (p) snap.token = p.token;
    }
    return snap;
  }
}

export { META };
