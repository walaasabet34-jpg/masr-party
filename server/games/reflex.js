// Reflex mini-games. Timings and scoring mirror the reference game.
import { rank, pointsFrom } from '../lib/rank.js';
import { nameOf, namesOf, pickOne, shuffle } from '../lib/util.js';

const ms = (n) => `${n} ملّي ثانية`;
const sec = (n, d = 1) => `${(n / 1000).toFixed(d)} ث`;
const capMs = (v, max) => (v === -1 ? -1 : typeof v !== 'number' || !Number.isFinite(v) || v < 0 ? max : Math.min(Math.round(v), max));

// ---------------------------------------------------------------- Tap Race
export const tapRace = {
  id: 'tap-race',
  name: 'سباق الصوابع',
  icon: '⚡',
  color: 'lime',
  kind: 'reflex',
  minPlayers: 2,
  durationMs: 12000,
  weight: 1.4,
  tagline: 'استنى الأخضر. آخر واحد يدوس ياخد صفر.',
  howTo: 'دوس أول ما الشاشة تقلب أخضر. قبلها هتشوف أحمر وفلاشات خدعة: ما تدوسش عليهم.',
  rule: 'الأبطأ ياخد صفر.',
  details: 'اللي يدوس بدري أو ما يدوسش خالص ياخد صفر برضه.',
  setup(ctx) {
    const delayMs = 1800 + Math.floor(ctx.rng() * 3500);
    const fakeouts = ctx.rng() < 0.5 ? [Math.floor(delayMs * (0.3 + ctx.rng() * 0.4))] : [];
    return { delayMs, goAt: null, goFired: false, taps: {}, fakeouts };
  },
  onTick(s, ctx) {
    if (s.goAt === null) return { ...s, goAt: ctx.now + s.delayMs };
    if (!s.goFired && ctx.now >= s.goAt) return { ...s, goFired: true };
    return s;
  },
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'tap' || pid in s.taps) return s;
    const v = s.goAt === null || ctx.now < s.goAt ? -1 : capMs(inp.payload, ctx.now - s.goAt);
    return { ...s, taps: { ...s.taps, [pid]: v } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.taps),
  resolve(s, ctx) {
    const rows = ctx.players.map((p) => {
      const v = s.taps[p.id];
      return v === undefined ? { id: p.id, status: 'out', primary: 0 } : v < 0 ? { id: p.id, status: 'foul', primary: 0 } : { id: p.id, status: 'ok', primary: v };
    });
    const r = rank(rows, { better: 'lower' });
    const first = r.winners[0];
    return {
      headline: first ? `الأسرع: ${nameOf(ctx.players, first)} (${ms(s.taps[first])})` : r.rows.some((x) => x.status === 'foul') ? 'كله داس بدري!' : 'محدش داس. كله ياخد صفر!',
      ...r,
      points: pointsFrom(r.rows, r.winners, r.losers),
      table: { layout: 'list', rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: x.status === 'ok' ? ms(x.primary) : x.status === 'foul' ? '⚡ بدري' : '—', why: x.status === 'out' ? 'من غير دوس' : undefined })) },
    };
  },
  view(s, pid) {
    return {
      go: s.goFired,
      fakeoutsAt: s.goAt === null ? [] : s.fakeouts.map((f) => s.goAt - s.delayMs + f),
      goAt: s.goFired ? s.goAt : null,
      myMs: s.taps[pid] ?? null,
      tapped: Object.keys(s.taps),
    };
  },
};

// ---------------------------------------------------------------- Tap Frenzy
const FRENZY = 6000;
export const tapFrenzy = {
  id: 'tap-frenzy',
  name: 'دوس دوس',
  icon: '👆',
  color: 'orange',
  kind: 'reflex',
  minPlayers: 2,
  durationMs: FRENZY + 1500,
  tagline: 'ست ثواني. افرم الزرار.',
  howTo: 'دوس على الزرار الكبير أكتر عدد مرات تقدر عليه في ٦ ثواني. استخدم كل صوابعك.',
  rule: 'أقل عدد دوسات ياخد صفر.',
  details: 'لو فيه تعادل، اللي وصل للرقم ده متأخر ياخد صفر.',
  setup: () => ({ startAt: null, counts: {}, lastAt: {} }),
  onTick: (s, ctx) => (s.startAt === null ? { ...s, startAt: ctx.now } : s),
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'tap' || s.startAt === null || ctx.now < s.startAt || ctx.now > s.startAt + FRENZY + 250) return s;
    const add = Math.max(1, Math.min(8, Number(inp.payload?.n) || 1)); // batched taps from the phone
    return { ...s, counts: { ...s.counts, [pid]: (s.counts[pid] ?? 0) + add }, lastAt: { ...s.lastAt, [pid]: ctx.now - s.startAt } };
  },
  isComplete: (s, ctx) => s.startAt !== null && ctx.now >= s.startAt + FRENZY + 300,
  resolve(s, ctx) {
    const rows = ctx.players.map((p) => ({ id: p.id, status: 'ok', primary: s.counts[p.id] ?? 0, tiebreak: s.lastAt[p.id] }));
    const best = Math.max(0, ...rows.map((r) => r.primary));
    const r = rank(rows, { better: 'higher', allTied: best > 0 ? 'nobody' : 'everyone' });
    const winners = best > 0 ? r.winners : [];
    return {
      headline: best === 0 ? 'محدش داس خالص!' : winners.length ? `أعلى رقم: ${nameOf(ctx.players, winners[0])} — ${best} دوسة 🔥` : `تعادل! كله فرم ${best} دوسة 🔥`,
      ...r,
      winners,
      points: pointsFrom(r.rows, winners, r.losers),
      table: { layout: 'list', rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: `${x.primary} دوسة` })) },
    };
  },
  view: (s, pid, ctx) => ({ startAt: s.startAt, endsAt: s.startAt && s.startAt + FRENZY, mine: s.counts[pid] ?? 0, counts: s.counts }),
};

// ---------------------------------------------------------------- Don't Let Go
const GATHER = 8000;
const GO_WINDOW = 4000;
export const dontLetGo = {
  id: 'dont-let-go',
  name: 'ما تسيبش',
  icon: '✋',
  color: 'mint',
  kind: 'reflex',
  minPlayers: 2,
  durationMs: GATHER + 15000 + GO_WINDOW,
  tagline: 'اثبت. وصباعك كمان.',
  howTo: 'دوس على الدايرة وخليك ماسك. أول ما تشوف «سيب!» ارفع صباعك بسرعة. أي حركة قبلها خدعة.',
  rule: 'اللي يسيب بدري ياخد صفر.',
  details: 'لو محدش ساب بدري، أبطأ صباع اترفع ياخد صفر.',
  setup: () => ({ stage: 'gather', gatherUntil: null, goAt: null, fakeouts: [], holding: {}, out: {}, releaseMs: {} }),
  onTick(s, ctx) {
    if (s.gatherUntil === null) return { ...s, gatherUntil: ctx.now + GATHER };
    if (s.stage === 'gather') {
      if (ctx.players.every((p) => s.holding[p.id]) || ctx.now >= s.gatherUntil) {
        const goAt = ctx.now + 4000 + Math.floor(ctx.rng() * 7000);
        const fakeouts = [0.3, 0.65].map((f) => Math.floor(ctx.now + (goAt - ctx.now) * (f + ctx.rng() * 0.15)));
        const out = { ...s.out };
        for (const p of ctx.players) if (!s.holding[p.id]) out[p.id] = 'nohold';
        return { ...s, stage: 'hold', goAt, fakeouts, out };
      }
      return s;
    }
    if (s.stage === 'hold' && ctx.now >= s.goAt) return { ...s, stage: 'go' };
    return s;
  },
  onInput(s, pid, inp, ctx) {
    if (s.stage === 'gather') {
      if (inp.type === 'hold') return { ...s, holding: { ...s.holding, [pid]: true } };
      if (inp.type === 'release') return { ...s, holding: { ...s.holding, [pid]: false } };
      return s;
    }
    if (inp.type !== 'release' || !s.holding[pid] || s.out[pid] || pid in s.releaseMs) return s;
    const holding = { ...s.holding, [pid]: false };
    if (s.stage === 'hold') return { ...s, holding, out: { ...s.out, [pid]: 'early' } };
    return { ...s, holding, releaseMs: { ...s.releaseMs, [pid]: ctx.now - s.goAt } };
  },
  isComplete(s, ctx) {
    if (s.stage === 'gather') return false;
    const alive = ctx.players.filter((p) => !s.out[p.id]);
    if (!alive.length) return true;
    return s.stage === 'go' && (alive.every((p) => p.id in s.releaseMs) || ctx.now >= s.goAt + GO_WINDOW);
  },
  resolve(s, ctx) {
    const rows = ctx.players.map((p) =>
      s.out[p.id] ? { id: p.id, status: 'out', primary: 0, facts: { out: s.out[p.id] } } : { id: p.id, status: 'ok', primary: s.releaseMs[p.id] ?? Number.POSITIVE_INFINITY },
    );
    const r = rank(rows, { better: 'lower', allTied: 'everyone' });
    const cracked = r.rows.some((x) => x.status === 'out');
    const names = namesOf(ctx.players, r.losers);
    const winners = r.winners.filter((id) => Number.isFinite(r.rows.find((x) => x.id === id).primary));
    return {
      headline: cracked ? `اتهزوا: ${names} 😬` : `أعصاب حديد! الأبطأ في السيبان: ${names}`,
      ...r,
      winners,
      points: pointsFrom(r.rows, winners, r.losers),
      table: {
        layout: 'list',
        rows: r.rows.map((x) => ({
          id: x.id,
          place: x.place,
          value: x.status === 'out' ? (x.facts.out === 'early' ? '😬 سيبان بدري' : 'من غير مسكة') : Number.isFinite(x.primary) ? ms(x.primary) : '✋ فضل ماسك',
        })),
      },
    };
  },
  view: (s, pid) => ({
    stage: s.stage,
    gatherUntil: s.gatherUntil,
    goAt: s.stage === 'go' ? s.goAt : null,
    fakeouts: s.fakeouts,
    holding: s.holding,
    out: s.out,
    released: Object.keys(s.releaseMs),
    me: { holding: !!s.holding[pid], out: s.out[pid] ?? null, ms: s.releaseMs[pid] ?? null },
  }),
};

// ---------------------------------------------------------------- Stop at 10
const TARGET = 10000;
export const stopAtTen = {
  id: 'stop-at-ten',
  name: 'وقّف على ١٠',
  icon: '⏱️',
  color: 'cyan',
  kind: 'reflex',
  minPlayers: 2,
  durationMs: 22000,
  tagline: 'عِد لعشرة. وانت مغمّض.',
  howTo: 'دوس «وقّف» لما تحس إن ١٠ ثواني عدّوا بالظبط. العدّاد هيختفي من موبايلك بعد ٣ ثواني، فعِدّ في دماغك.',
  rule: 'أبعد واحد عن ١٠ ثواني ياخد صفر.',
  details: 'لو فيه تعادل، اللي وقّف متأخر ياخد صفر.',
  setup: () => ({ startAt: null, stops: {} }),
  onTick: (s, ctx) => (s.startAt === null ? { ...s, startAt: ctx.now } : s),
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'stop' || s.startAt === null || pid in s.stops) return s;
    return { ...s, stops: { ...s.stops, [pid]: ctx.now - s.startAt } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.stops),
  resolve(s, ctx) {
    const rows = ctx.players.map((p) =>
      p.id in s.stops ? { id: p.id, status: 'ok', primary: Math.abs(s.stops[p.id] - TARGET), tiebreak: s.stops[p.id], facts: { stop: s.stops[p.id] } } : { id: p.id, status: 'out', primary: 0 },
    );
    const r = rank(rows, { better: 'lower', allTied: 'everyone', deadHeat: 'primary' });
    const w = r.winners[0];
    return {
      headline: w ? `الأقرب: ${nameOf(ctx.players, w)} — ${sec(s.stops[w], 2)} 🎯` : 'محدش وقّف الساعة!',
      ...r,
      points: pointsFrom(r.rows, r.winners, r.losers),
      reveal: { label: 'الهدف', value: '١٠٫٠٠ ث' },
      table: {
        layout: 'list',
        rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: x.status === 'ok' ? `±${sec(x.primary, 2)}` : '⏱ الساعة ما وقفتش', why: x.status === 'ok' ? `الساعة عند ${sec(x.facts.stop, 2)}` : undefined })),
      },
    };
  },
  view: (s, pid) => ({ startAt: s.startAt, myStop: s.stops[pid] ?? null, stopped: Object.keys(s.stops) }),
};

// ---------------------------------------------------------------- Quick Draw
export const quickDraw = {
  id: 'quick-draw',
  name: 'مين يسحب الأول',
  icon: '🤠',
  color: 'yellow',
  kind: 'reflex',
  minPlayers: 2,
  durationMs: 15000,
  tagline: 'اتنين بيتبارزوا. والباقي بيراهن.',
  howTo: 'لو انت في المبارزة: استنى «اسحب!» ودوس قبل خصمك. لو مش في المبارزة: راهن على الكسبان قبل «اسحب!».',
  rule: 'كسبان المبارزة ياخد ٢، واللي راهن صح ياخد ١.',
  details: 'الأبطأ في المبارزة، أو اللي داس قبل «اسحب!»، يتخصم منه نقطة. الرهان الغلط أو من غير رهان = صفر.',
  setup(ctx) {
    const ids = shuffle(ctx.rng, ctx.players.map((p) => p.id));
    return { duelists: ids.slice(0, 2), drawAt: null, drawn: false, shots: {}, bets: {} };
  },
  onTick(s, ctx) {
    if (s.drawAt === null) return { ...s, drawAt: ctx.now + 3000 + Math.floor(ctx.rng() * 4000) };
    if (!s.drawn && ctx.now >= s.drawAt) return { ...s, drawn: true };
    return s;
  },
  onInput(s, pid, inp, ctx) {
    const isDuelist = s.duelists.includes(pid);
    if (isDuelist && inp.type === 'shoot' && !(pid in s.shots)) {
      const v = !s.drawn || ctx.now < s.drawAt ? -1 : capMs(inp.payload, ctx.now - s.drawAt);
      return { ...s, shots: { ...s.shots, [pid]: v } };
    }
    if (!isDuelist && inp.type === 'bet' && !s.drawn && s.duelists.includes(String(inp.payload))) {
      return { ...s, bets: { ...s.bets, [pid]: String(inp.payload) } };
    }
    return s;
  },
  isComplete: (s) => s.duelists.every((d) => d in s.shots),
  resolve(s, ctx) {
    const [a, b] = s.duelists;
    const t = (id) => (s.shots[id] === undefined ? Infinity : s.shots[id] === -1 ? Number.MAX_VALUE : s.shots[id]);
    const early = s.duelists.filter((id) => s.shots[id] === -1);
    const slow = early.length ? early : t(a) === t(b) ? [a, b] : [t(a) > t(b) ? a : b];
    const winners = s.duelists.filter((id) => !slow.includes(id));
    const losers = [...slow];
    const deduct = Object.fromEntries(slow.map((id) => [id, s.shots[id] === -1 ? 'ضربة قبل «اسحب!»' : 'خسارة المبارزة']));
    for (const p of ctx.players) {
      if (s.duelists.includes(p.id)) continue;
      const bet = s.bets[p.id];
      if (!bet || !winners.includes(bet)) {
        losers.push(p.id);
      }
    }
    const w = winners[0];
    const shotTxt = (id) => (s.shots[id] === undefined ? '🔫 من غير ضرب' : s.shots[id] < 0 ? '⚡ بدري' : ms(s.shots[id]));
    const points = Object.fromEntries(ctx.players.map((p) => [p.id, losers.includes(p.id) ? 0 : s.duelists.includes(p.id) ? 2 : 1]));
    return {
      deduct,
      headline: w ? `🤠 المبارزة لـ${nameOf(ctx.players, w)}${s.shots[w] >= 0 ? ` (${ms(s.shots[w])})` : ''}` : 'الاتنين باظوا المبارزة!',
      winners,
      losers,
      points,
      table: {
        layout: 'list',
        rows: [
          ...s.duelists.map((id) => ({ id, mark: '🤠', value: shotTxt(id), why: 'المبارزة' })),
          ...ctx.players
            .filter((p) => !s.duelists.includes(p.id))
            .map((p) => {
              const bet = s.bets[p.id];
              const right = bet && winners.includes(bet);
              return { id: p.id, mark: right ? '✓' : '✗', value: bet ? (right ? 'صح' : 'غلط') : 'من غير رهان', why: bet ? `رهان على ${nameOf(ctx.players, bet)}` : undefined };
            }),
        ],
      },
    };
  },
  view: (s, pid) => ({
    duelists: s.duelists,
    drawn: s.drawn,
    drawAt: s.drawn ? s.drawAt : null,
    shot: s.shots[pid] ?? null,
    shotBy: Object.keys(s.shots),
    myBet: s.bets[pid] ?? null,
    betCounts: s.duelists.map((d) => Object.values(s.bets).filter((b) => b === d).length),
    betters: Object.keys(s.bets),
  }),
};

// ---------------------------------------------------------------- Whack-a-Mole
const WHACK = 15000;
const WHACK_LEAD = 1200;
const BOMB = -3;
const GRACE = 450;
const molePoints = (moles, hits = []) => hits.reduce((a, k) => a + (moles[k]?.bomb ? BOMB : 1), 0);
export const whackAMole = {
  id: 'whack-a-mole',
  name: 'اضرب الفار',
  icon: '🔨',
  color: 'lime',
  kind: 'reflex',
  minPlayers: 2,
  durationMs: WHACK_LEAD + WHACK + 1500,
  tagline: 'اضرب الفيران. مش القنابل.',
  howTo: 'اضرب كل فار يطلع على موبايلك قبل ما يستخبى، لمدة ١٥ ثانية. ما تضربش القنبلة 💣: بتشيل ٣ من سكورك.',
  rule: 'أقل سكور ياخد صفر.',
  details: 'لو فيه تعادل، اللي وصل للسكور ده متأخر ياخد صفر.',
  setup(ctx) {
    const moles = [];
    const busy = Array(9).fill(0);
    let at = 300;
    while (at < WHACK - 500) {
      const f = at / WHACK;
      const up = Math.round(1150 - 450 * f);
      const free = busy.map((b, i) => (b <= at ? i : -1)).filter((i) => i >= 0);
      const cell = free.length ? pickOne(ctx.rng, free) : Math.floor(ctx.rng() * 9);
      const bomb = moles.length > 2 && ctx.rng() < 0.18;
      moles.push({ at, up, cell, bomb });
      busy[cell] = at + up + 200;
      at += Math.round(620 - 300 * f + ctx.rng() * 220);
    }
    return { startAt: null, moles, hits: {}, lastAt: {} };
  },
  onTick: (s, ctx) => (s.startAt === null ? { ...s, startAt: ctx.now + WHACK_LEAD } : s),
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'whack' || s.startAt === null) return s;
    const k = Number(inp.payload?.k);
    const m = s.moles[k];
    if (!m) return s;
    const t = ctx.now - s.startAt;
    if (t < m.at - 150 || t > m.at + m.up + GRACE) return s;
    const mine = s.hits[pid] ?? [];
    if (mine.includes(k)) return s;
    return { ...s, hits: { ...s.hits, [pid]: [...mine, k] }, lastAt: { ...s.lastAt, [pid]: t } };
  },
  isComplete: (s, ctx) => s.startAt !== null && ctx.now >= s.startAt + WHACK + GRACE,
  resolve(s, ctx) {
    const rows = ctx.players.map((p) => {
      const h = s.hits[p.id] ?? [];
      const bombs = h.filter((k) => s.moles[k]?.bomb).length;
      return { id: p.id, status: 'ok', primary: molePoints(s.moles, h), tiebreak: s.lastAt[p.id], facts: { moles: h.length - bombs, bombs } };
    });
    const best = Math.max(...rows.map((r) => r.primary));
    const r = rank(rows, best > 0 ? { better: 'higher' } : { better: 'higher', allTied: 'everyone', deadHeat: 'primary' });
    const winners = best > 0 ? r.winners : [];
    return {
      headline: best <= 0 ? 'محدش جاب نقط!' : winners.length ? `أعلى سكور: ${namesOf(ctx.players, winners)} — ${best} 🔨` : `تعادل على ${best} 🔨`,
      ...r,
      winners,
      points: pointsFrom(r.rows, winners, r.losers),
      table: { layout: 'list', rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: `${x.primary}`, why: `${x.facts.moles} فار${x.facts.bombs ? ` · ${x.facts.bombs} 💣 −${3 * x.facts.bombs}` : ''}` })) },
    };
  },
  view(s, pid, ctx) {
    const scores = {};
    for (const p of ctx.players) scores[p.id] = molePoints(s.moles, s.hits[p.id]);
    return { startAt: s.startAt, moles: s.moles, scores, myHits: s.hits[pid] ?? [], duration: WHACK };
  },
};

// ---------------------------------------------------------------- Snap!
const SNAP_CARDS = 20;
const SNAP_LEAD = 1500;
const SNAP_LATE = 350;
const SNAP_MISS = 2000;
const SNAP_SETS = [
  ['🍎', '🍓', '🍒', '🌶️', '🍅'],
  ['😀', '😃', '😄', '😁', '😆'],
  ['🐶', '🐱', '🐭', '🐹', '🐰'],
  ['❤️', '🧡', '💛', '💚', '💙'],
  ['🙈', '🙉', '🙊', '🐵', '🐒'],
  ['🌑', '🌒', '🌓', '🌔', '🌕'],
  ['☕', '🧋', '🥤', '🧉', '🍵'],
];
const isPair = (c) => !!c && c.a === c.b;
function snapScore(s, pid) {
  const hits = s.hits[pid] ?? {};
  const pairs = s.cards.map((c, i) => (isPair(c) ? i : -1)).filter((i) => i >= 0);
  return { points: Object.keys(hits).length - (s.falses[pid]?.length ?? 0), ms: pairs.reduce((a, i) => a + (hits[i] ?? SNAP_MISS), 0) };
}
export const snap = {
  id: 'snap',
  name: 'خبطة!',
  icon: '🃏',
  color: 'red',
  kind: 'reflex',
  minPlayers: 2,
  durationMs: SNAP_LEAD + 21000,
  tagline: 'اتنين زي بعض؟ اخبط!',
  howTo: 'كل شوية هيظهر كارتين جنب بعض. لما الاتنين يبقوا نفس الصورة، دوس «خبطة!» بسرعة. هتحصل ٣ مرات بس.',
  rule: 'أقل نقط ياخد صفر.',
  details: 'لو خبطت والكارتين مختلفين، بتخسر نقطة من سكورك. لو فيه تعادل، الإيد الأبطأ تاخد صفر.',
  setup(ctx) {
    const set = pickOne(ctx.rng, SNAP_SETS);
    const pairAt = new Set();
    while (pairAt.size < 3) {
      const i = 3 + Math.floor(ctx.rng() * (SNAP_CARDS - 4));
      if ([...pairAt].every((j) => Math.abs(j - i) >= 3)) pairAt.add(i);
    }
    const cards = [];
    let at = 0;
    for (let i = 0; i < SNAP_CARDS; i++) {
      const dur = Math.round(1100 - 350 * (i / SNAP_CARDS));
      let a = pickOne(ctx.rng, set);
      let b = a;
      if (!pairAt.has(i)) {
        [a, b] = shuffle(ctx.rng, set);
        const prev = cards[i - 1];
        if (prev && prev.a === a && prev.b === b) [a, b] = [b, a];
      }
      cards.push({ at, dur, a, b });
      at += dur;
    }
    return { startAt: null, cards, hits: {}, falses: {} };
  },
  onTick: (s, ctx) => (s.startAt === null ? { ...s, startAt: ctx.now + SNAP_LEAD } : s),
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'snap' || s.startAt === null) return s;
    const t = ctx.now - s.startAt;
    const i = s.cards.findIndex((c) => t >= c.at && t < c.at + c.dur);
    if (i < 0) return s;
    const mine = s.hits[pid] ?? {};
    const prev = s.cards[i - 1];
    const target = isPair(s.cards[i]) ? i : prev && isPair(prev) && t - prev.at - prev.dur < SNAP_LATE ? i - 1 : -1;
    if (target >= 0) {
      if (target in mine) return s;
      return { ...s, hits: { ...s.hits, [pid]: { ...mine, [target]: Math.max(0, t - s.cards[target].at) } } };
    }
    const f = s.falses[pid] ?? [];
    return f.includes(i) ? s : { ...s, falses: { ...s.falses, [pid]: [...f, i] } };
  },
  isComplete(s, ctx) {
    const last = s.cards[s.cards.length - 1];
    return s.startAt !== null && ctx.now >= s.startAt + last.at + last.dur + SNAP_LATE;
  },
  resolve(s, ctx) {
    const sc = ctx.players.map((p) => ({ id: p.id, ...snapScore(s, p.id) }));
    const best = Math.max(...sc.map((x) => x.points));
    const rows = sc.map((x) => ({ id: x.id, status: 'ok', primary: x.points, tiebreak: x.ms, facts: { wrong: s.falses[x.id]?.length ?? 0 } }));
    const r = rank(rows, { better: 'higher', allTied: best > 0 ? 'nobody' : 'everyone' });
    const nobody = !r.winners.length && !r.losers.length;
    const winners = best <= 0 ? [] : nobody ? sc.map((x) => x.id) : r.winners;
    return {
      headline: best > 0 ? `أسرع إيد: ${nameOf(ctx.players, winners[0])} 🃏` : 'محدش خبط صح!',
      ...r,
      winners,
      points: pointsFrom(r.rows, winners, r.losers),
      table: { layout: 'list', rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: `${x.primary}`, why: x.facts.wrong ? `${x.facts.wrong} خبطة غلط · −${x.facts.wrong}` : undefined })) },
    };
  },
  view(s, pid, ctx) {
    const points = {};
    for (const p of ctx.players) points[p.id] = snapScore(s, p.id).points;
    return { startAt: s.startAt, cards: s.cards, points, myHits: Object.keys(s.hits[pid] ?? {}).map(Number), myFalses: s.falses[pid] ?? [] };
  },
};

export default [tapRace, tapFrenzy, dontLetGo, stopAtTen, quickDraw, whackAMole, snap];
