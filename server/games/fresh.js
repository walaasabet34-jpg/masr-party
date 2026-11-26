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
  howTo: 'كمّل المثل المصري: دوس على آخره الصح من ٤ اختيارات. ٥ أمثال.',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ صفر.',
  details: 'كل غلطة بتزوّد ٣ ثواني على وقتك.',
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
  howTo: 'اعرف الصورة دي إيه ودوس على اسمها. هتبدأ قريبة قوي وتبعد شوية بشوية. ٥ صور.',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ صفر.',
  details: 'كل غلطة بتزوّد ٣ ثواني على وقتك.',
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
  howTo: 'احفظ الطلب (٣ حاجات) في ثانيتين ونص، وبعدين اختاره من ٤ طلبات شبه بعض. ٤ طلبات.',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ صفر.',
  details: 'كل غلطة بتزوّد ٣ ثواني على وقتك.',
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
  howTo: 'دوس على الأرقام بالترتيب من ١ لـ١٢: ١ وبعدين ٢ وبعدين ٣…',
  rule: 'الأسرع ياخد ٣، واللي بعده ٢، والأبطأ صفر.',
  details: 'كل دوسة غلط بتزوّد ٣ ثواني على وقتك.',
  generate(ctx) {
    const grid = shuffle(ctx.rng, Array.from({ length: RUSH_N }, (_, i) => i + 1));
    return Array.from({ length: RUSH_N }, (_, i) => ({ prompt: i + 1, options: grid, answer: grid.indexOf(i + 1) }));
  },
});

// ---------------------------------------------------------------- ضربة جزاء
// One match per round: two players take turns, 3 kicks each. Shooter and keeper pick in secret;
// the kick is revealed on both phones at the same moment. Everyone else calls the winner.
const DIRS = ['right', 'middle', 'left'];
const PK_CHOOSE = 8000;
const PK_REVEAL = 3500;
const PK_EACH = 3; // kicks per player
const PK_SUDDEN = 2; // extra kicks per player if tied
const PK_MAX = 2 * (PK_EACH + PK_SUDDEN);
const pkShooter = (s) => s.duelists[s.kicks.length % 2];
const pkKeeper = (s) => s.duelists[(s.kicks.length + 1) % 2];
const pkGoals = (s, id) => s.kicks.filter((k) => k.shooter === id && k.goal).length;
const pkDecided = (s) => {
  const n = s.kicks.length;
  if (n < 2 * PK_EACH || n % 2) return false;
  const [a, b] = s.duelists;
  return pkGoals(s, a) !== pkGoals(s, b) || n >= PK_MAX;
};
const pkWinner = (s) => {
  if (s.forfeit) return s.duelists.find((id) => id !== s.forfeit) ?? null;
  const [a, b] = s.duelists;
  const ga = pkGoals(s, a);
  const gb = pkGoals(s, b);
  return ga === gb ? null : ga > gb ? a : b;
};
export const penaltyKicks = {
  id: 'penalty-kicks',
  name: 'ضربة جزاء',
  icon: '⚽',
  color: 'mint',
  kind: 'chaos',
  isNew: true,
  minPlayers: 2,
  durationMs: PK_MAX * (PK_CHOOSE + PK_REVEAL) + 3000,
  tagline: 'واحد قصاد واحد. شوط ونُط.',
  howTo: 'لو عليك الدور: اختار في السر هتشوط فين، أو هتنط فين لو انت الحارس، والشوطة بتظهر على الموبايلين في نفس اللحظة. ماتش بين اتنين، وكل واحد بيشوط ٣ مرات بالتبادل. الباقي بيتوقّع مين هيكسب.',
  rule: 'اللي يجيب أجوان أكتر ياخد ٢، واللي توقّع الكسبان صح ياخد ١.',
  details: 'لو اتعادلوا بعد ٣ شوطات: ضربة قصاد ضربة لحد ما واحد يسبق (لحد شوطتين زيادة لكل واحد). لو فضلوا متعادلين، الاتنين ياخدوا ١. الحارس اللي ينط في اتجاه الشوطة يصدّها، والشوّاط اللي ما يختارش شوطته بتضيع. التوقّع بيقفل أول ما أول شوطة تتشاط.',
  setup: (ctx) => ({ duelists: shuffle(ctx.rng, ctx.players.map((p) => p.id)).slice(0, 2), stage: 'choose', until: null, shot: null, dive: null, kicks: [], bets: {}, forfeit: null }),
  onTick(s, ctx) {
    if (s.stage === 'done') return s;
    const gone = s.duelists.find((id) => !has(ctx, id));
    if (gone) return { ...s, stage: 'done', until: null, forfeit: gone };
    if (s.until === null) return { ...s, until: ctx.now + PK_CHOOSE };
    if (s.stage === 'choose' && ((s.shot !== null && s.dive !== null) || ctx.now >= s.until)) {
      const kick = { shooter: pkShooter(s), keeper: pkKeeper(s), shot: s.shot, dive: s.dive, goal: s.shot !== null && s.dive !== s.shot };
      return { ...s, stage: 'reveal', until: ctx.now + PK_REVEAL, shot: null, dive: null, kicks: [...s.kicks, kick] };
    }
    if (s.stage === 'reveal' && ctx.now >= s.until) {
      if (pkDecided(s)) return { ...s, stage: 'done', until: null };
      return { ...s, stage: 'choose', until: ctx.now + PK_CHOOSE };
    }
    return s;
  },
  onInput(s, pid, inp) {
    if (inp.type === 'bet') {
      const ok = !s.duelists.includes(pid) && !s.kicks.length && s.stage !== 'done' && s.duelists.includes(String(inp.payload));
      return ok ? { ...s, bets: { ...s.bets, [pid]: String(inp.payload) } } : s;
    }
    if (s.stage !== 'choose' || !DIRS.includes(inp.payload)) return s;
    if (inp.type === 'shoot' && pid === pkShooter(s) && s.shot === null) return { ...s, shot: inp.payload };
    if (inp.type === 'dive' && pid === pkKeeper(s) && s.dive === null) return { ...s, dive: inp.payload };
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const [a, b] = s.duelists;
    const w = pkWinner(s);
    const draw = !w;
    const fans = ctx.players.filter((p) => !s.duelists.includes(p.id));
    const rightFans = fans.filter((p) => w && s.bets[p.id] === w).map((p) => p.id);
    const points = {};
    for (const p of ctx.players) {
      if (s.duelists.includes(p.id)) points[p.id] = draw ? 1 : p.id === w ? 2 : 0;
      else points[p.id] = rightFans.includes(p.id) ? 1 : 0;
    }
    const winners = [...(draw ? s.duelists : [w]), ...rightFans].filter((id) => has(ctx, id));
    const losers = ctx.players.map((p) => p.id).filter((id) => !winners.includes(id));
    const score = `${pkGoals(s, a)}–${pkGoals(s, b)}`;
    const headline = s.forfeit
      ? `⚽ الماتش لـ${nameOf(ctx.players, w)} (الخصم خرج من السهرة)`
      : draw
        ? `🤝 تعادل ${score} حتى بعد الضربات الزيادة`
        : `⚽ الماتش لـ${nameOf(ctx.players, w)} (${score})`;
    return {
      headline,
      winners,
      losers,
      points,
      table: {
        layout: 'list',
        rows: [
          ...s.duelists.filter((id) => has(ctx, id)).map((id) => ({ id, mark: '⚽', value: `${pkGoals(s, id)} جون`, why: 'الماتش' })),
          ...fans.map((p) => {
            const bet = s.bets[p.id];
            const right = rightFans.includes(p.id);
            return { id: p.id, mark: right ? '✓' : '✗', value: bet ? (right ? 'صح' : 'غلط') : 'من غير توقّع', why: bet ? `توقّع ${nameOf(ctx.players, bet)}` : undefined };
          }),
        ],
      },
    };
  },
  view: (s, pid) => {
    const shooter = pkShooter(s);
    const keeper = pkKeeper(s);
    const role = s.stage !== 'choose' ? null : pid === shooter ? 'shooter' : pid === keeper ? 'keeper' : null;
    const betCounts = Object.fromEntries(s.duelists.map((id) => [id, Object.values(s.bets).filter((x) => x === id).length]));
    return {
      stage: s.stage,
      until: s.until,
      duelists: s.duelists,
      shooter,
      keeper,
      role,
      kickNo: s.kicks.length + (s.stage === 'choose' ? 1 : 0),
      sudden: s.kicks.length >= 2 * PK_EACH,
      each: PK_EACH,
      // each player only ever sees their own pick until the kick is revealed
      myPick: role === 'shooter' ? s.shot : role === 'keeper' ? s.dive : null,
      shotLocked: s.shot !== null,
      diveLocked: s.dive !== null,
      kicks: s.kicks,
      last: s.stage === 'reveal' ? s.kicks[s.kicks.length - 1] : null,
      goals: Object.fromEntries(s.duelists.map((id) => [id, pkGoals(s, id)])),
      myBet: s.bets[pid] ?? null,
      betsOpen: !s.kicks.length && s.stage === 'choose' && !s.duelists.includes(pid),
      betCounts,
      forfeit: s.forfeit,
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
  howTo: 'جاوب على السؤال عن نفسك. بعدين الإجابات هتظهر من غير أسامي، وخمّن مين كتب كل واحدة.',
  rule: 'الأعلى ياخد ٣، واللي بعده ٢، والأقل صفر.',
  details: 'كل تخمين صح بنقطة، وكل حد ما عرفش إجابتك بنقطة ليك.',
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
      headline: s.queue.length < 2 ? 'محدش كتب كفاية. الجولة دي من غير نقط.' : r.winners.length ? `🗣️ أشطر واحد في السهرة: ${r.winners.map((id) => nameOf(ctx.players, id)).join(' و')}` : 'تعادل!',
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
