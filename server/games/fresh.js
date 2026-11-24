// Six replacement games (Nov 2026): simpler rules, one clear action each.
import { rank, pointsFrom } from '../lib/rank.js';
import { nameOf, pickFresh, pickFreshMany, shuffle, cleanText } from '../lib/util.js';
import { race } from './brain.js';
import { PROVERBS, ZOOMS, ORDER_ITEMS, WHO_SAID } from '../content/fresh.js';

const has = (ctx, id) => ctx.players.some((p) => p.id === id);

// ---------------------------------------------------------------- كمّل المثل
export const finishProverb = race({
  id: 'finish-proverb',
  name: 'كمّل المثل',
  icon: '📜',
  color: 'yellow',
  kind: 'brain',
  isNew: true,
  durationMs: 40000,
  tagline: 'أول المثل عندك. كمّله صح.',
  howTo: 'هيظهر أول مثل مصري، ودوس على آخره الصح من أربعة. خمس أمثال، وكل غلطة بـ٣ ثواني زيادة.',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ ياخد صفر.',
  generate(ctx) {
    return pickFreshMany(ctx, PROVERBS, 5).map((x) => {
      const others = shuffle(ctx.rng, PROVERBS.filter((y) => y.id !== x.id)).slice(0, 3).map((y) => y.end);
      const options = shuffle(ctx.rng, [x.end, ...others]);
      return { prompt: x.start + ' …', options, answer: options.indexOf(x.end) };
    });
  },
});

// ---------------------------------------------------------------- زووم
export const zoomIn = race({
  id: 'zoom-in',
  name: 'زووم',
  icon: '🔍',
  color: 'cyan',
  kind: 'brain',
  isNew: true,
  durationMs: 40000,
  tagline: 'صورة قريبة قوي. دي إيه؟',
  howTo: 'هتشوف حتة صغيرة من صورة متكبّرة قوي، وهي بتبعد شوية بشوية. اعرف هي إيه ودوس على اسمها. خمس صور، وكل غلطة بـ٣ ثواني زيادة.',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ ياخد صفر.',
  generate(ctx) {
    return pickFreshMany(ctx, ZOOMS, 5).map((x) => {
      const others = shuffle(ctx.rng, ZOOMS.filter((y) => y.id !== x.id)).slice(0, 3).map((y) => y.name);
      const options = shuffle(ctx.rng, [x.name, ...others]);
      // focus point inside the emoji, so every player sees the same close-up
      const fx = 30 + Math.floor(ctx.rng() * 40);
      const fy = 30 + Math.floor(ctx.rng() * 40);
      return { prompt: { emoji: x.emoji, fx, fy }, options, answer: options.indexOf(x.name) };
    });
  },
});

// ---------------------------------------------------------------- ناديلنا الأوردر
export const ORDER_SHOW_MS = 3500;
export const orderUp = race({
  id: 'order-up',
  name: 'ناديلنا الأوردر',
  icon: '🧾',
  color: 'orange',
  kind: 'brain',
  isNew: true,
  durationMs: 55000,
  tagline: 'احفظ الطلب. وما تلخبطش.',
  howTo: 'طلب من ٣ حاجات هيظهر ثانيتين ونص بس. بعدين اختار الطلب الصح من أربع طلبات شبه بعض. أربع طلبات، وكل غلطة بـ٣ ثواني زيادة.',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ ياخد صفر.',
  generate(ctx) {
    const show = (o) => o.map((x) => ({ e: x.emoji, n: x.name }));
    return Array.from({ length: 4 }, () => {
      const order = shuffle(ctx.rng, ORDER_ITEMS).slice(0, 3);
      const rest = shuffle(ctx.rng, ORDER_ITEMS.filter((x) => !order.includes(x)));
      // each wrong order swaps a different one of the three items, so all four differ
      const variants = [0, 1, 2].map((k) => order.map((x, i) => (i === k ? rest[k] : x)));
      const all = shuffle(ctx.rng, [order, ...variants]);
      return { prompt: { items: show(order), showMs: ORDER_SHOW_MS }, options: all.map(show), answer: all.indexOf(order) };
    });
  },
});

// ---------------------------------------------------------------- دوس بالترتيب
export const RUSH_N = 12;
export const numberRush = race({
  id: 'number-rush',
  name: 'دوس بالترتيب',
  icon: '👆',
  color: 'lime',
  kind: 'reflex',
  isNew: true,
  durationMs: 35000,
  tagline: 'من ١ لـ١٢. بأسرع ما يمكن.',
  howTo: 'الأرقام من ١ لـ١٢ متلخبطة على موبايلك. دوس عليهم بالترتيب: ١ وبعدين ٢ وبعدين ٣… كل دوسة غلط بـ٣ ثواني زيادة.',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ ياخد صفر.',
  generate(ctx) {
    const grid = shuffle(ctx.rng, Array.from({ length: RUSH_N }, (_, i) => i + 1));
    return Array.from({ length: RUSH_N }, (_, i) => ({ prompt: i + 1, options: grid, answer: grid.indexOf(i + 1) }));
  },
});

// ---------------------------------------------------------------- ضربة جزاء
const DIRS = ['right', 'middle', 'left'];
const PK_CHOOSE = 9000;
const PK_REVEAL = 4000;
const PK_ROUNDS = 3;
const targetOf = (s, id, round) => {
  const n = s.order.length;
  const i = s.order.indexOf(id);
  return s.order[(i + 1 + (round % (n - 1))) % n];
};
export const penaltyKicks = {
  id: 'penalty-kicks',
  name: 'ضربة جزاء',
  icon: '⚽',
  color: 'mint',
  kind: 'chaos',
  isNew: true,
  minPlayers: 2,
  durationMs: PK_ROUNDS * (PK_CHOOSE + PK_REVEAL) + 3000,
  tagline: 'شوط. واتنطّط. وخمّن.',
  howTo: 'في كل جولة إنت بتشوط على حارس، وفي نفس الوقت إنت حارس لحد تاني. اختار هتشوط فين (يمين، نص، شمال) وهتنط فين. لو الحارس نط في نفس اتجاه الشوطة يصدّها، غير كده تبقى جون. ٣ جولات.',
  rule: 'كل جون بنقطة وكل صدّة بنقطة. الأعلى ياخد ٣، واللي بعده ٢، والأقل ياخد صفر.',
  setup: (ctx) => ({ order: shuffle(ctx.rng, ctx.players.map((p) => p.id)), round: 0, stage: 'choose', until: null, shots: {}, dives: {}, last: [], goals: {}, saves: {} }),
  onTick(s, ctx) {
    if (s.until === null) return { ...s, until: ctx.now + PK_CHOOSE };
    const everyone = s.order.filter((id) => has(ctx, id));
    if (s.stage === 'choose' && (ctx.now >= s.until || everyone.every((id) => id in s.shots && id in s.dives))) {
      const goals = { ...s.goals };
      const saves = { ...s.saves };
      const last = s.order.map((shooter) => {
        const keeper = targetOf(s, shooter, s.round);
        const shot = s.shots[shooter] ?? null;
        const dive = s.dives[keeper] ?? null;
        const goal = shot !== null && dive !== shot;
        if (goal) goals[shooter] = (goals[shooter] ?? 0) + 1;
        else if (shot !== null) saves[keeper] = (saves[keeper] ?? 0) + 1;
        return { shooter, keeper, shot, dive, goal };
      });
      return { ...s, stage: 'reveal', until: ctx.now + PK_REVEAL, last, goals, saves };
    }
    if (s.stage === 'reveal' && ctx.now >= s.until) {
      if (s.round + 1 >= PK_ROUNDS) return { ...s, stage: 'done', until: null };
      return { ...s, stage: 'choose', round: s.round + 1, until: ctx.now + PK_CHOOSE, shots: {}, dives: {}, last: [] };
    }
    return s;
  },
  onInput(s, pid, inp) {
    if (s.stage !== 'choose' || !s.order.includes(pid) || !DIRS.includes(inp.payload)) return s;
    if (inp.type === 'shoot' && !(pid in s.shots)) return { ...s, shots: { ...s.shots, [pid]: inp.payload } };
    if (inp.type === 'dive' && !(pid in s.dives)) return { ...s, dives: { ...s.dives, [pid]: inp.payload } };
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const score = (id) => (s.goals[id] ?? 0) + (s.saves[id] ?? 0);
    const rows = ctx.players.map((p) => ({ id: p.id, status: 'ok', primary: score(p.id), facts: { g: s.goals[p.id] ?? 0, sv: s.saves[p.id] ?? 0 } }));
    const r = rank(rows, { better: 'higher', allTied: 'nobody' });
    const w = r.winners;
    return {
      headline: w.length ? `⚽ ${w.map((id) => nameOf(ctx.players, id)).join(' و')} — ${score(w[0])} من ${PK_ROUNDS * 2}` : 'تعادل! محدش اتفوّق.',
      ...r,
      points: pointsFrom(r.rows, r.winners, r.losers),
      table: {
        layout: 'list',
        cols: ['أجوان', 'صدّات', 'المجموع'],
        rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: String(x.primary), cells: [String(x.facts.g), String(x.facts.sv)] })),
      },
    };
  },
  view: (s, pid) => {
    const inGame = s.order.includes(pid);
    const shooter = inGame ? s.order.find((id) => targetOf(s, id, s.round) === pid) : null;
    return {
      stage: s.stage,
      round: s.round + 1,
      rounds: PK_ROUNDS,
      until: s.until,
      target: inGame ? targetOf(s, pid, s.round) : null,
      shooter,
      myShot: s.shots[pid] ?? null,
      myDive: s.dives[pid] ?? null,
      ready: s.order.filter((id) => id in s.shots && id in s.dives),
      last: s.stage === 'reveal' ? s.last : [],
      goals: s.goals,
      saves: s.saves,
    };
  },
};

// ---------------------------------------------------------------- مين قالها؟
const WS_WRITE = 40000;
const WS_GUESS = 12000;
const WS_REVEAL = 4000;
const WS_MAX = 4;
export const whoSaidIt = {
  id: 'who-said-it',
  name: 'مين قالها؟',
  icon: '🗣️',
  color: 'pink',
  kind: 'social',
  isNew: true,
  minPlayers: 3,
  durationMs: WS_WRITE + WS_MAX * (WS_GUESS + WS_REVEAL) + 4000,
  tagline: 'جاوب عن نفسك. وخمّن مين كتب إيه.',
  howTo: 'هيظهر سؤال عنك، اكتب إجابتك. بعدين الإجابات هتظهر واحدة واحدة من غير أسماء، وكل واحد يخمّن مين اللي كتبها.',
  rule: 'كل تخمين صح بنقطة، وكل حد ما عرفش إجابتك بنقطة ليك. الأعلى ياخد ٣، واللي بعده ٢، والأقل ياخد صفر.',
  setup: (ctx) => ({ prompt: pickFresh(ctx, WHO_SAID).text, stage: 'write', until: null, answers: {}, queue: [], idx: 0, guesses: {}, score: {} }),
  onTick(s, ctx) {
    if (s.until === null) return { ...s, until: ctx.now + WS_WRITE };
    const everyone = ctx.players.map((p) => p.id);
    if (s.stage === 'write' && (ctx.now >= s.until || everyone.every((id) => id in s.answers))) {
      const queue = shuffle(ctx.rng, Object.keys(s.answers).filter((id) => has(ctx, id))).slice(0, WS_MAX);
      if (queue.length < 2) return { ...s, stage: 'done', until: null, queue };
      return { ...s, stage: 'guess', queue, idx: 0, guesses: {}, until: ctx.now + WS_GUESS };
    }
    const author = s.queue[s.idx];
    const guessers = everyone.filter((id) => id !== author);
    if (s.stage === 'guess' && (ctx.now >= s.until || guessers.every((id) => id in s.guesses))) {
      const score = { ...s.score };
      for (const id of guessers) {
        if (s.guesses[id] === author) score[id] = (score[id] ?? 0) + 1;
        else score[author] = (score[author] ?? 0) + 1;
      }
      return { ...s, stage: 'reveal', score, until: ctx.now + WS_REVEAL };
    }
    if (s.stage === 'reveal' && ctx.now >= s.until) {
      if (s.idx + 1 >= s.queue.length) return { ...s, stage: 'done', until: null };
      return { ...s, stage: 'guess', idx: s.idx + 1, guesses: {}, until: ctx.now + WS_GUESS };
    }
    return s;
  },
  onInput(s, pid, inp, ctx) {
    if (s.stage === 'write' && inp.type === 'answer' && !(pid in s.answers)) {
      const text = cleanText(inp.payload, 60);
      return text ? { ...s, answers: { ...s.answers, [pid]: text } } : s;
    }
    if (s.stage === 'guess' && inp.type === 'guess' && pid !== s.queue[s.idx] && !(pid in s.guesses) && has(ctx, String(inp.payload)) && String(inp.payload) !== pid) {
      return { ...s, guesses: { ...s.guesses, [pid]: String(inp.payload) } };
    }
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const rows = ctx.players.map((p) => ({ id: p.id, status: 'ok', primary: s.score[p.id] ?? 0 }));
    const r = rank(rows, { better: 'higher', allTied: 'nobody' });
    return {
      headline: s.queue.length < 2 ? 'محدش كتب كفاية. الجولة دي من غير نقط.' : r.winners.length ? `🗣️ ${r.winners.map((id) => nameOf(ctx.players, id)).join(' و')} أشطر واحد في السهرة` : 'تعادل!',
      ...(s.queue.length < 2 ? { winners: [], losers: [], rows: [] } : r),
      points: s.queue.length < 2 ? {} : pointsFrom(r.rows, r.winners, r.losers),
      reveal: { label: 'السؤال', value: s.prompt },
      table: { layout: 'list', rows: (s.queue.length < 2 ? [] : r.rows).map((x) => ({ id: x.id, place: x.place, value: `${x.primary} نقطة` })) },
    };
  },
  view: (s, pid, ctx) => {
    const author = s.queue[s.idx];
    const showing = s.stage === 'guess' || s.stage === 'reveal';
    return {
      stage: s.stage,
      prompt: s.prompt,
      until: s.until,
      wrote: Object.keys(s.answers),
      myAnswer: s.answers[pid] ?? null,
      current: showing ? { text: s.answers[author], n: s.idx + 1, of: s.queue.length } : null,
      mine: showing && author === pid,
      myGuess: s.guesses[pid] ?? null,
      guessed: Object.keys(s.guesses),
      author: s.stage === 'reveal' ? author : null,
      guesses: s.stage === 'reveal' ? s.guesses : null,
      score: s.score,
      players: ctx.players.map((p) => p.id),
    };
  },
};

export default [finishProverb, zoomIn, orderUp, numberRush, penaltyKicks, whoSaidIt];
