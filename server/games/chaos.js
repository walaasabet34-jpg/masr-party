// Chaos mini-games: luck, bluff and pure mayhem.
import { rank, pointsFrom } from '../lib/rank.js';
import { nameOf, namesOf, shuffle } from '../lib/util.js';

const has = (ctx, id) => ctx.players.some((p) => p.id === id);

// ---------------------------------------------------------------- Roulette
export const roulette = {
  id: 'roulette',
  name: 'الروليت',
  icon: '💀',
  color: 'magenta',
  kind: 'chaos',
  minPlayers: 2,
  durationMs: 7500,
  tagline: 'العجلة بتختار لاعب ومفاجأة نقط.',
  howTo: 'الكل على العجلة. لاعب واحد ياخد كارت عشوائي: +٢ أو +٣ أو −١ أو −٢ نقطة. الباقي نقطهم ثابتة.',
  rule: 'كارت واحد للاعب واحد. الرصيد ممكن يبقى بالسالب.',
  setup(ctx) {
    const wedges = ctx.players.map((p) => p.id);
    const cards = [2, 3, -1, -2];
    return { wedges, targetId: wedges[Math.floor(ctx.rng() * wedges.length)], delta: cards[Math.floor(ctx.rng() * cards.length)], turns: 5 + Math.floor(ctx.rng() * 3), startAt: null };
  },
  onTick: (s, ctx) => (s.startAt === null ? { ...s, startAt: ctx.now } : s),
  onInput: (s) => s,
  isComplete: (s, ctx) => s.startAt !== null && ctx.now >= s.startAt + 6500,
  resolve(s, ctx) {
    return {
      headline: `العجلة اختارت ${nameOf(ctx.players, s.targetId)}: ${s.delta > 0 ? "+" : ""}${s.delta} نقطة 🎯`,
      winners: s.delta > 0 ? [s.targetId] : [],
      losers: s.delta < 0 ? [s.targetId] : [],
      points: Object.fromEntries(ctx.players.map((p) => [p.id, p.id === s.targetId ? s.delta : 0])),
      table: { layout: 'list', rows: ctx.players.map((p) => (p.id === s.targetId ? { id: p.id, mark: '💀', value: `${s.delta > 0 ? '+' : ''}${s.delta} نقطة`, why: 'العجلة اختارته' } : { id: p.id, value: 'المرة دي لأ' })).sort((a) => (a.mark ? 1 : -1)) },
    };
  },
  view: (s) => ({ wedges: s.wedges, targetId: s.targetId, turns: s.turns, startAt: s.startAt }),
};

// ---------------------------------------------------------------- Hot Potato
export const hotPotato = {
  id: 'hot-potato',
  name: 'القنبلة',
  icon: '💣',
  color: 'red',
  kind: 'chaos',
  minPlayers: 2,
  durationMs: 30000,
  tagline: 'عدّي القنبلة قبل ما تفرقع.',
  howTo: 'موبايل واحد هياخد القنبلة 💣. لو معاك، دوس على أي حد تاني تعدّيهاله. محدش يعرف هتفرقع إمتى.',
  rule: 'اللي ماسك القنبلة وهي بتفرقع يتخصم منه نقطة، والباقي ياخدوا نقطة.',
  setup: (ctx) => ({ holder: ctx.players[Math.floor(ctx.rng() * ctx.players.length)].id, startAt: null, explodeAt: null, exploded: false, lastPassAt: 0, passes: 0, from: null }),
  onTick(s, ctx) {
    let n = s;
    if (n.startAt === null) n = { ...n, startAt: ctx.now, explodeAt: ctx.now + 9000 + Math.floor(ctx.rng() * 13000) };
    if (!has(ctx, n.holder) && ctx.players.length) n = { ...n, holder: ctx.players[Math.floor(ctx.rng() * ctx.players.length)].id };
    if (!n.exploded && n.explodeAt !== null && ctx.now >= n.explodeAt) n = { ...n, exploded: true };
    return n;
  },
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'pass' || s.exploded || pid !== s.holder) return s;
    const to = String(inp.payload);
    if (to === pid || !has(ctx, to) || ctx.now - s.lastPassAt < 350) return s;
    return { ...s, holder: to, from: pid, lastPassAt: ctx.now, passes: s.passes + 1 };
  },
  isComplete: (s) => s.exploded,
  resolve(s, ctx) {
    return {
      headline: `💥 بوووم! ${nameOf(ctx.players, s.holder)} كان ماسك القنبلة`,
      winners: [],
      losers: [s.holder],
      deduct: { [s.holder]: 'القنبلة فرقعت في إيدك' },
      points: Object.fromEntries(ctx.players.map((p) => [p.id, p.id === s.holder ? 0 : 1])),
      reveal: { label: 'فرقعت بعد', value: `${s.passes} تمريرة` },
      table: { layout: 'list', rows: ctx.players.map((p) => (p.id === s.holder ? { id: p.id, mark: '💥', value: 'بوم', why: 'كانت معاه وهي بتفرقع' } : { id: p.id, value: 'عدّاها في وقتها' })).sort((a) => (a.mark ? 1 : -1)) },
    };
  },
  view: (s) => ({ holder: s.holder, from: s.from, startAt: s.startAt, passes: s.passes, exploded: s.exploded }),
};

// ---------------------------------------------------------------- Musical Chairs
const GRAB = 5000;
const PAUSE = 3500;
export const musicalChairs = {
  id: 'musical-chairs',
  name: 'الكراسي الموسيقية',
  icon: '🪑',
  color: 'orange',
  kind: 'chaos',
  minPlayers: 2,
  durationMs: 3 * (15000 + GRAB + PAUSE) + 5000,
  tagline: 'ارقص. وبعدين اتخانق على كرسي.',
  howTo: 'قوم ارقص طول ما المزيكا شغالة. أول ما تقف (الشاشة هتقلب أخضر ويتكتب «المزيكا وقفت!» حتى لو موبايلك صامت)، دوس على كرسي فاضي على موبايلك. دايمًا فيه كرسي ناقص. لو دوست والمزيكا لسه شغالة تطلع برة.',
  rule: 'اللي يقعد من غير كرسي ياخد صفر. لحد تلات جولات.',
  setup: (ctx) => ({ stage: 'music', round: 1, rounds: Math.min(3, ctx.players.length - 1), musicFrom: null, stopAt: null, until: null, alive: ctx.players.map((p) => p.id), chairs: [], early: [], out: [], lastOut: [] }),
  onTick(s, ctx) {
    if (s.stopAt === null) return { ...s, musicFrom: ctx.now, stopAt: ctx.now + 6000 + Math.floor(ctx.rng() * 8000) };
    const alive = s.alive.filter((id) => has(ctx, id));
    if (s.stage === 'music' && ctx.now >= s.stopAt) return { ...s, alive, stage: 'grab', chairs: Array(Math.max(1, alive.length - 1)).fill(null), until: ctx.now + GRAB };
    if (s.stage === 'grab' && (s.chairs.every((c) => c !== null) || ctx.now >= s.until)) {
      const seated = new Set(s.chairs.filter(Boolean));
      const out = alive.filter((id) => !seated.has(id));
      return { ...s, stage: 'pause', alive: alive.filter((id) => seated.has(id)), out: [...s.out, ...out], lastOut: out, until: ctx.now + PAUSE };
    }
    if (s.stage === 'pause' && ctx.now >= s.until) {
      if (s.round >= s.rounds || alive.length < 2) return { ...s, stage: 'done', until: null };
      return { ...s, stage: 'music', round: s.round + 1, early: [], chairs: [], lastOut: [], musicFrom: ctx.now, stopAt: ctx.now + 6000 + Math.floor(ctx.rng() * 8000), until: null };
    }
    return s;
  },
  onInput(s, pid, inp) {
    if (inp.type !== 'sit' || !s.alive.includes(pid) || s.early.includes(pid)) return s;
    if (s.stage === 'music') return { ...s, early: [...s.early, pid] };
    if (s.stage !== 'grab' || s.chairs.includes(pid)) return s;
    const c = Number(inp.payload?.chair);
    if (!Number.isInteger(c) || c < 0 || c >= s.chairs.length || s.chairs[c] !== null) return s;
    const chairs = [...s.chairs];
    chairs[c] = pid;
    return { ...s, chairs };
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const recent = s.lastOut.filter((id) => !s.alive.includes(id));
    const earlier = s.out.filter((id) => !recent.includes(id));
    const groups = [
      [s.alive, '🪑 فضل قاعد'],
      [recent, '🚶 طلع في آخر جولة'],
      [earlier, '🚶 طلع بدري'],
    ].filter(([ids]) => ids.length);
    const rows = groups.flatMap(([ids], g) => ids.map((id) => ({ id, group: g, value: ids === s.alive ? 'لقى كرسي' : 'برة' })));
    for (const p of ctx.players) if (!rows.some((r) => r.id === p.id)) rows.push({ id: p.id, value: 'ما قعدش' });
    const losers = s.alive.length ? s.out.filter((id) => has(ctx, id)) : ctx.players.map((p) => p.id);
    return {
      headline: s.alive.length ? `🪑 ${namesOf(ctx.players, s.alive)} لقوا كرسي!` : 'محدش لقى كرسي!',
      winners: s.alive,
      losers,
      points: Object.fromEntries(ctx.players.map((p) => [p.id, losers.includes(p.id) ? 0 : 2])),
      table: { layout: 'groups', groups: groups.map(([ids, t]) => ({ title: t, count: ids.length })), rows },
    };
  },
  view: (s) => ({ stage: s.stage, round: s.round, rounds: s.rounds, musicFrom: s.stage === 'music' ? s.musicFrom : null, until: s.until, alive: s.alive, chairs: s.chairs, early: s.early, out: s.out, lastOut: s.lastOut }),
};

// ---------------------------------------------------------------- Shell Shock
const CUPS = 3;
const SHOW = 3000;
const SHUFFLE = 10000;
const SWAP_MS = 420;
const PICK = 12000;
const REVEAL = 4000;
const MAX_SWAPS = 40;
const order = (swaps) => {
  const o = [0, 1, 2];
  for (const { a, b } of swaps) [o[a], o[b]] = [o[b], o[a]];
  return o;
};
const coinSlot = (s) => order(s.swaps).indexOf(s.coin);
const lastSwapEnd = (s) => (s.swaps.length ? s.swaps[s.swaps.length - 1].at + SWAP_MS : 0);
const shuffleEnd = (s) => Math.max(s.shuffleUntil ?? 0, lastSwapEnd(s));
const guessers = (s, ctx) => ctx.players.filter((p) => p.id !== s.hustler).map((p) => p.id);
function advance(s, ctx) {
  for (let i = 0; i < 8; i++) {
    const t = ctx.now;
    let n = s;
    if (s.startAt === null) n = { ...s, startAt: t, shuffleUntil: t + SHOW + SHUFFLE };
    else if (s.stage === 'show' && t >= s.startAt + SHOW) n = { ...s, stage: 'shuffle' };
    else if (s.stage === 'shuffle' && t >= shuffleEnd(s)) n = { ...s, stage: 'pick', until: t + PICK };
    else if (s.stage === 'pick' && (t >= s.until || guessers(s, ctx).every((id) => id in s.picks))) n = { ...s, stage: 'reveal', until: t + REVEAL };
    else if (s.stage === 'reveal' && t >= s.until) n = { ...s, stage: 'done', until: null };
    if (n === s) break;
    s = n;
  }
  return s;
}
export const shellShock = {
  id: 'shell-shock',
  name: 'التلات كبايات',
  icon: '🎩',
  color: 'red',
  kind: 'chaos',
  minPlayers: 3,
  durationMs: SHOW + SHUFFLE + SWAP_MS + PICK + REVEAL + 3000,
  tagline: 'تابع العملة. وما تثقش في حد.',
  howTo: 'عملة هتتحط تحت كباية من تلاتة. واحد فيكم هو النصّاب وبيلخبط الكبايات بأسرع ما عنده. الباقي يتابعوا العملة ويختاروا الكباية اللي فاكرين إنه تحتها.',
  rule: 'اللي يختار كباية فاضية ياخد صفر. لو محدش اتضحك عليه، النصّاب يتخصم منه نقطة.',
  setup: (ctx) => ({ stage: 'show', hustler: ctx.players[Math.floor(ctx.rng() * ctx.players.length)].id, coin: Math.floor(ctx.rng() * CUPS), startAt: null, shuffleUntil: null, swaps: [], until: null, picks: {} }),
  onTick: (s, ctx) => advance(s, ctx),
  onInput(s, pid, inp, ctx) {
    const isHustler = pid === s.hustler;
    if (s.stage === 'shuffle' && isHustler && inp.type === 'swap') {
      const { a, b } = inp.payload ?? {};
      if (![0, 1, 2].includes(a) || ![0, 1, 2].includes(b) || a === b) return s;
      const at = Math.max(ctx.now, lastSwapEnd(s));
      if (at >= s.shuffleUntil || at - ctx.now > 2 * SWAP_MS || s.swaps.length >= MAX_SWAPS) return s;
      return { ...s, swaps: [...s.swaps, { a, b, at }] };
    }
    if (s.stage === 'shuffle' && isHustler && inp.type === 'done') return advance({ ...s, shuffleUntil: Math.min(s.shuffleUntil, ctx.now) }, ctx);
    if (isHustler) return s;
    if (s.stage === 'pick' && inp.type === 'pick' && !(pid in s.picks)) {
      const c = Number(inp.payload);
      return [0, 1, 2].includes(c) ? advance({ ...s, picks: { ...s.picks, [pid]: c } }, ctx) : s;
    }
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const at = coinSlot(s);
    const gs = guessers(s, ctx);
    const found = gs.filter((id) => s.picks[id] === at);
    const fooled = gs.filter((id) => !found.includes(id));
    const h = nameOf(ctx.players, s.hustler);
    const usedCups = [0, 1, 2].filter((c) => gs.some((id) => s.picks[id] === c));
    const table = {
      layout: 'groups',
      groups: usedCups.map((c) => ({ title: `${c === at ? '🪙' : '🥤'} كباية ${c + 1}`, count: gs.filter((id) => s.picks[id] === c).length })),
      rows: [
        ...usedCups.flatMap((c, g) => gs.filter((id) => s.picks[id] === c).map((id) => ({ id, group: g, value: c === at ? 'لقاه' : 'فاضية' }))),
        ...gs.filter((id) => s.picks[id] === undefined).map((id) => ({ id, value: 'ما اختارش' })),
        { id: s.hustler, mark: '🎩', value: `ضحك على ${fooled.length}`, why: 'النصّاب' },
      ],
    };
    const points = (losers) => Object.fromEntries(ctx.players.map((p) => [p.id, losers.includes(p.id) ? 0 : p.id === s.hustler ? fooled.length : 2]));
    if (fooled.length) {
      return {
        headline: found.length ? `العملة كانت تحت كباية ${at + 1}. ${h} ضحك على ${namesOf(ctx.players, fooled)} 🎩` : `${h} نصب على الكل! العملة كانت تحت كباية ${at + 1} 🎩`,
        winners: [...found, s.hustler],
        losers: fooled,
        points: points(fooled),
        reveal: { label: 'العملة تحت', value: `كباية ${at + 1}` },
        table,
      };
    }
    return { headline: `محدش اتضحك عليه! العملة كانت تحت كباية ${at + 1}. النصّاب ${h} يتخصم منه نقطة 🎩`, winners: found, losers: [s.hustler], deduct: { [s.hustler]: 'نصّاب ومحدش اتضحك عليه' }, points: points([s.hustler]), reveal: { label: 'العملة تحت', value: `كباية ${at + 1}` }, table };
  },
  view(s, pid) {
    const sees = pid === s.hustler || s.stage === 'reveal' || s.stage === 'done';
    return { stage: s.stage, hustler: s.hustler, coin: s.coin, startAt: s.startAt, shuffleUntil: s.shuffleUntil, swaps: s.swaps, swapMs: SWAP_MS, until: s.until, picked: Object.keys(s.picks), myPick: s.picks[pid] ?? null, picks: sees ? s.picks : null };
  },
};

// ---------------------------------------------------------------- Rock Paper Royale
const WIN_TO = 2;
const MAX_THROWS = 5;
const THROW_MS = 8000;
const SHOW_MS = 4000;
const beats = (a, b) => (a - b + 3) % 3 === 1; // 0 rock, 1 paper, 2 scissors
function scoreThrow(group, picks) {
  const d = {};
  for (const a of group) {
    let v = 0;
    for (const b of group) {
      if (a === b) continue;
      const pa = picks[a];
      const pb = picks[b];
      if (pa === undefined && pb === undefined) continue;
      if (pa === undefined) v -= 1;
      else if (pb === undefined || beats(pa, pb)) v += 1;
      else if (beats(pb, pa)) v -= 1;
    }
    d[a] = v;
  }
  return d;
}
const winsOf = (hist) => {
  const w = {};
  for (const h of hist) for (const [id, v] of Object.entries(h.delta)) w[id] = (w[id] ?? 0) + (v > 0 ? 1 : 0);
  return w;
};
const netOf = (hist) => {
  const w = {};
  for (const h of hist) for (const [id, v] of Object.entries(h.delta)) w[id] = (w[id] ?? 0) + v;
  return w;
};
const live = (d, ctx) => d.filter((id) => has(ctx, id));
const duelOver = (d, hist) => {
  const w = winsOf(hist);
  const throws = hist.filter((h) => d.some((id) => id in h.delta)).length;
  return d.length < 2 || throws >= MAX_THROWS || d.some((id) => (w[id] ?? 0) >= WIN_TO);
};
const activeIds = (s, ctx) => s.duels.map((d) => live(d, ctx)).filter((d) => !duelOver(d, s.history)).flat();
export const rockPaperScissors = {
  id: 'rock-paper-scissors',
  name: 'حجرة ورقة مقص',
  icon: '✊',
  color: 'orange',
  kind: 'chaos',
  minPlayers: 2,
  durationMs: MAX_THROWS * (THROW_MS + SHOW_MS) + 3000,
  tagline: 'مبارزات عشوائية. أحسن من تلاتة.',
  howTo: 'هيطلعلك خصم عشوائي. اختار ✊ حجرة أو ✋ ورقة أو ✌️ مقص في السر. أول واحد يكسب رميتين ياخد المبارزة، والتعادل ما بيتحسبش.',
  rule: 'خسران كل مبارزة ياخد صفر.',
  setup(ctx) {
    const ids = shuffle(ctx.rng, ctx.players.map((p) => p.id));
    const duels = [];
    for (let i = 0; i + 1 < ids.length; i += 2) duels.push([ids[i], ids[i + 1]]);
    if (ids.length % 2 === 1 && duels.length) duels[duels.length - 1].push(ids[ids.length - 1]);
    return { stage: 'throw', n: 1, until: null, picks: {}, history: [], duels };
  },
  onTick(s, ctx) {
    if (s.until === null) return { ...s, until: ctx.now + THROW_MS };
    const act = activeIds(s, ctx);
    if (s.stage === 'throw' && (act.every((id) => id in s.picks) || ctx.now >= s.until)) {
      const delta = {};
      const picks = {};
      for (const d of s.duels.map((x) => live(x, ctx)).filter((x) => !duelOver(x, s.history))) {
        Object.assign(delta, scoreThrow(d, s.picks));
        for (const id of d) if (id in s.picks) picks[id] = s.picks[id];
      }
      return { ...s, stage: 'reveal', until: ctx.now + SHOW_MS, history: [...s.history, { picks, delta }] };
    }
    if (s.stage === 'reveal' && ctx.now >= s.until) return act.length ? { ...s, stage: 'throw', n: s.n + 1, picks: {}, until: ctx.now + THROW_MS } : { ...s, stage: 'done', until: null };
    return s;
  },
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'throw' || s.stage !== 'throw' || pid in s.picks || !activeIds(s, ctx).includes(pid)) return s;
    const v = Number(inp.payload);
    return Number.isInteger(v) && v >= 0 && v <= 2 ? { ...s, picks: { ...s.picks, [pid]: v } } : s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const wins = winsOf(s.history);
    const net = netOf(s.history);
    const duels = s.duels.map((d) => live(d, ctx)).filter((d) => d.length);
    const HAND = ['✊', '✋', '✌️'];
    const trail = (id) => s.history.filter((h) => id in h.delta).map((h) => HAND[h.picks[id]] ?? '·').join(' ');
    const rows = duels.flatMap((d, g) => d.map((id) => ({ id, status: 'ok', primary: wins[id] ?? 0, tiebreak: -(net[id] ?? 0), group: g, facts: { throws: trail(id) } })));
    const r = rank(rows, { better: 'higher', allTied: 'everyone' });
    let headline;
    if (!r.winners.length && r.losers.length) headline = 'لسه متعادلين، محدش كسب! ⭐';
    else if (duels.length === 1 && duels[0].length === 2 && r.winners.length === 1) {
      const w = r.winners[0];
      const l = duels[0].find((id) => id !== w);
      headline = `${nameOf(ctx.players, w)} غلب ${nameOf(ctx.players, l)} ${wins[w] ?? 0}–${wins[l] ?? 0} ✊`;
    } else headline = `${namesOf(ctx.players, r.winners)} كسبوا مبارزاتهم ✊`;
    return {
      headline,
      ...r,
      points: pointsFrom(r.rows, r.winners, r.losers, 'duel'),
      table: { layout: 'pairs', groups: duels.map(() => ({ title: '' })), rows: r.rows.map((x) => ({ id: x.id, group: x.group, place: x.place, value: String(x.primary), why: x.facts.throws })) },
    };
  },
  view(s, pid, ctx) {
    const mine = s.duels.find((d) => d.includes(pid)) ?? [];
    return { stage: s.stage, n: s.n, until: s.until, mine: s.picks[pid] ?? null, thrown: Object.keys(s.picks), history: s.history, wins: winsOf(s.history), duels: s.duels, opponents: mine.filter((id) => id !== pid), dueling: activeIds(s, ctx) };
  },
};

// ---------------------------------------------------------------- Lone Wolf
export const loneWolf = {
  id: 'lone-wolf',
  name: 'الديب الوحداني',
  icon: '🐺',
  color: 'violet',
  kind: 'chaos',
  minPlayers: 3,
  durationMs: 20000,
  tagline: 'اختار رقم محدش غيرك يختاره.',
  howTo: 'كل واحد يختار رقم في السر. لو حد تاني اختار نفس الرقم، انتو الاتنين تاخدوا صفر. خليك الديب الوحداني. لو محدش اتخبط في حد، أصغر رقم ياخد صفر.',
  rule: 'نفس الرقم = تاخد صفر. مفيش تخبيط؟ أصغر رقم ياخد صفر.',
  setup: (ctx) => ({ max: Math.min(10, Math.max(4, ctx.players.length + 1)), picks: {} }),
  onInput(s, pid, inp) {
    if (inp.type !== 'pick' || pid in s.picks) return s;
    const v = Number(inp.payload);
    return Number.isInteger(v) && v >= 1 && v <= s.max ? { ...s, picks: { ...s.picks, [pid]: v } } : s;
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.picks),
  resolve(s, ctx) {
    const ids = ctx.players.map((p) => p.id);
    const count = new Map();
    for (const id of ids) if (id in s.picks) count.set(s.picks[id], (count.get(s.picks[id]) ?? 0) + 1);
    const lone = ids.filter((id) => id in s.picks && count.get(s.picks[id]) === 1);
    const clash = ids.filter((id) => id in s.picks && count.get(s.picks[id]) > 1);
    const asleep = ids.filter((id) => !(id in s.picks));
    const top = Math.max(0, ...lone.map((id) => s.picks[id]));
    const topWolves = lone.filter((id) => s.picks[id] === top);
    const nums = [...new Set(Object.values(s.picks))].sort((a, b) => b - a);
    const table = {
      layout: 'groups',
      groups: nums.map((n) => ({ title: `${count.get(n) > 1 ? '💥' : '🐺'} ${n}`, count: count.get(n) })),
      rows: [...nums.flatMap((n, g) => ids.filter((id) => s.picks[id] === n).map((id) => ({ id, group: g, value: count.get(n) > 1 ? 'تخبيط' : 'ديب وحداني' }))), ...asleep.map((id) => ({ id, value: 'نام' }))],
    };
    const points = (losers, winners) => Object.fromEntries(ids.map((id) => [id, losers.includes(id) || !(id in s.picks) ? 0 : winners.includes(id) ? 3 : 1]));
    if (clash.length + asleep.length) {
      const losers = [...clash, ...asleep];
      const clashNums = [...new Set(clash.map((id) => s.picks[id]))].sort((a, b) => a - b).join('، ');
      return { headline: clash.length ? `تخبيط على ${clashNums}! ${namesOf(ctx.players, clash)} ياخدوا صفر 🐺` : `${namesOf(ctx.players, asleep)} ناموا. صفر ليهم!`, winners: topWolves, losers, points: points(losers, topWolves), table };
    }
    const low = Math.min(...lone.map((id) => s.picks[id]));
    const losers = lone.filter((id) => s.picks[id] === low);
    return { headline: `كلكم ديابة وحدانية! أصغر رقم (${low}) ياخد صفر: ${namesOf(ctx.players, losers)}`, winners: topWolves, losers, points: points(losers, topWolves), table };
  },
  view: (s, pid) => ({ max: s.max, mine: s.picks[pid] ?? null, picked: Object.keys(s.picks) }),
};

export default [roulette, hotPotato, musicalChairs, shellShock, rockPaperScissors, loneWolf];
