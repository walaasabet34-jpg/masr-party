// Brain mini-games.
import { rank, pointsFrom } from '../lib/rank.js';
import { nameOf, namesOf, pickFresh, pickFreshMany, pickOne, shuffle, fmtNum } from '../lib/util.js';
import { ODD_PAIRS, COUNT_SETS, TRUE_FALSE, EMOJI_RIDDLES, CLOSE_CALL } from '../content/brain.js';

const MISTAKE = 3000;
const sec = (n) => `${(n / 1000).toFixed(1)} ث`;

// A "race": everyone answers the same list of questions; total time + 3s per mistake.
function race(def) {
  return {
    ...def,
    minPlayers: 2,
    setup: (ctx) => ({ qs: def.generate(ctx), startAt: null, progress: {} }),
    onTick: (s, ctx) => (s.startAt === null ? { ...s, startAt: ctx.now } : s),
    onInput(s, pid, inp, ctx) {
      if (inp.type !== 'answer' || s.startAt === null) return s;
      const { i, choice } = inp.payload ?? {};
      const me = s.progress[pid] ?? { i: 0, mistakes: 0, doneAt: null };
      if (me.doneAt !== null || i !== me.i) return s;
      const q = s.qs[me.i];
      if (!q) return s;
      let next;
      if (choice === q.answer) {
        const ni = me.i + 1;
        next = { ...me, i: ni, doneAt: ni >= s.qs.length ? ctx.now : null };
      } else next = { ...me, mistakes: me.mistakes + 1 };
      return { ...s, progress: { ...s.progress, [pid]: next } };
    },
    isComplete: (s, ctx) => ctx.players.every((p) => s.progress[p.id]?.doneAt != null),
    resolve(s, ctx) {
      const start = s.startAt ?? ctx.now;
      const rows = ctx.players.map((p) => {
        const m = s.progress[p.id];
        if (!m || m.doneAt === null) return { id: p.id, status: 'out', primary: 0, facts: { at: m?.i ?? 0, of: s.qs.length } };
        const total = m.doneAt - start + m.mistakes * MISTAKE;
        return { id: p.id, status: 'ok', primary: total, tiebreak: m.doneAt, facts: { base: m.doneAt - start, mistakes: m.mistakes } };
      });
      const r = rank(rows, { better: 'lower' });
      const top = r.rows[0]?.status === 'ok' ? r.rows[0] : null;
      return {
        headline: top ? `${nameOf(ctx.players, top.id)} كسب في ${sec(top.primary)}` : 'محدش خلّص. كله يشرب!',
        ...r,
        tier: 'small',
        points: pointsFrom(r.rows, r.winners, r.losers),
        table: {
          layout: 'list',
          cols: ['الوقت', 'الغلطات', 'المجموع'],
          rows: r.rows.map((x) => ({
            id: x.id,
            place: x.place,
            value: x.status === 'ok' ? sec(x.primary) : `${x.facts.at}/${x.facts.of}`,
            cells: x.status === 'ok' ? [sec(x.facts.base), x.facts.mistakes ? `${x.facts.mistakes}×(+٣ث)` : '–'] : ['–', '–'],
            why: x.status !== 'ok' ? 'ما خلّصش' : x.facts.mistakes ? `${x.facts.mistakes} غلطة · +${x.facts.mistakes * 3}ث` : undefined,
          })),
        },
      };
    },
    view(s, pid, ctx) {
      const me = s.progress[pid] ?? (ctx.players.some((p) => p.id === pid) ? { i: 0, mistakes: 0, doneAt: null } : null);
      const q = me && me.doneAt === null ? s.qs[me.i] : null;
      const progress = {};
      for (const p of ctx.players) {
        const m = s.progress[p.id];
        progress[p.id] = { i: m?.i ?? 0, done: m?.doneAt != null, mistakes: m?.mistakes ?? 0 };
      }
      return { total: s.qs.length, startAt: s.startAt, q: q ? { prompt: q.prompt, options: q.options } : null, me, progress, mistakeMs: MISTAKE };
    },
  };
}

export const INKS = [
  { id: 'red', hex: '#FF1744', name: 'أحمر' },
  { id: 'blue', hex: '#2979FF', name: 'أزرق' },
  { id: 'green', hex: '#00E676', name: 'أخضر' },
  { id: 'yellow', hex: '#FFD600', name: 'أصفر' },
  { id: 'purple', hex: '#D500F9', name: 'بنفسجي' },
];

export const colourClash = race({
  id: 'colour-clash',
  name: 'لخبطة ألوان',
  icon: '🎨',
  color: 'violet',
  kind: 'brain',
  durationMs: 30000,
  tagline: 'دوس على لون الحبر، مش الكلمة.',
  howTo: 'هتظهر كلمة لون مكتوبة بلون تاني. دوس على اللون اللي «شايفه» مش اللي «قاريه». ٥ ورا بعض، وكل غلطة بـ٣ ثواني.',
  rule: 'أبطأ مخ يشرب.',
  generate(ctx) {
    const r = ctx.rng;
    const qs = [];
    for (let k = 0; k < 5; k++) {
      const ink = Math.floor(r() * INKS.length);
      let word = Math.floor(r() * INKS.length);
      if (word === ink) word = (word + 1 + Math.floor(r() * (INKS.length - 1))) % INKS.length;
      const others = shuffle(r, INKS.map((_, i) => i).filter((i) => i !== ink && i !== word)).slice(0, 2);
      const options = shuffle(r, [ink, word, ...others]);
      qs.push({ prompt: [word, ink], options, answer: options.indexOf(ink) });
    }
    return qs;
  },
});

export const quickMath = race({
  id: 'quick-math',
  name: 'حساب السهرة',
  icon: '🧮',
  color: 'blue',
  kind: 'brain',
  durationMs: 35000,
  tagline: 'خمس مسائل. هي صعبة يعني؟',
  howTo: 'خمس مسائل سريعة. دوس على الإجابة الصح بأسرع ما يمكن. كل إجابة غلط بـ٣ ثواني.',
  rule: 'أبطأ آلة حاسبة تشرب.',
  generate(ctx) {
    const r = ctx.rng;
    const int = (a, b) => a + Math.floor(r() * (b - a + 1));
    const qs = [];
    for (let k = 0; k < 5; k++) {
      let prompt;
      let ans;
      if (k % 3 === 0) {
        const a = int(12, 59);
        const b = int(11, 39);
        prompt = `${a} + ${b}`;
        ans = a + b;
      } else if (k % 3 === 1) {
        const a = int(3, 9);
        const b = int(3, 9);
        prompt = `${a} × ${b}`;
        ans = a * b;
      } else {
        const a = int(30, 90);
        const b = int(11, 29);
        prompt = `${a} − ${b}`;
        ans = a - b;
      }
      const wrong = new Set();
      for (const d of shuffle(r, [1, -1, 2, -2, 10, -10, 9, 11])) {
        if (wrong.size >= 3) break;
        if (ans + d > 0) wrong.add(ans + d);
      }
      const options = shuffle(r, [ans, ...wrong]);
      qs.push({ prompt, options, answer: options.indexOf(ans) });
    }
    return qs;
  },
});

export const oddOneOut = race({
  id: 'odd-one-out',
  name: 'مين الغريب',
  icon: '🔍',
  color: 'yellow',
  kind: 'brain',
  durationMs: 35000,
  tagline: 'واحد فيهم مش زي الباقيين.',
  howTo: 'شبكة إيموجي كلها شبه بعض وفيها واحد بس غريب مستخبي. لاقيه ودوس عليه. ٣ شبكات، كل واحدة أكبر من اللي قبلها. كل دوسة غلط بـ٣ ثواني.',
  rule: 'أبطأ عين تشرب.',
  generate(ctx) {
    const pairs = shuffle(ctx.rng, ODD_PAIRS);
    return [4, 5, 6].map((n, k) => {
      const [base, odd] = pairs[k % pairs.length];
      const at = Math.floor(ctx.rng() * n * n);
      return { prompt: [base, odd, n, at], options: [], answer: at };
    });
  },
});

export const trueOrFalse = race({
  id: 'true-or-false',
  name: 'صح ولا غلط',
  icon: '✅',
  color: 'mint',
  kind: 'brain',
  durationMs: 45000,
  tagline: 'ست معلومات. فيهم كدب.',
  howTo: 'ست جمل، واحدة واحدة. دوس ✓ لو صح و✕ لو غلط. بسرعة، بس كل إجابة غلط بـ٣ ثواني.',
  rule: 'الأبطأ (بالغرامات) يشرب.',
  generate(ctx) {
    return pickFreshMany(ctx, TRUE_FALSE, 6).map((x) => ({ prompt: x.text, options: [true, false], answer: x.true ? 0 : 1 }));
  },
});

export const emojiRiddle = race({
  id: 'emoji-riddle',
  name: 'فزورة إيموجي',
  icon: '🧩',
  color: 'pink',
  kind: 'brain',
  durationMs: 40000,
  tagline: 'اقرا الإيموجي. قول الحاجة.',
  howTo: 'كام إيموجي بيوصفوا فيلم أو مسلسل أو مكان أو أكلة أو ماركة. دوس على الإجابة الصح من أربعة. خمس فوازير، وكل غلطة بـ٣ ثواني.',
  rule: 'أبطأ واحد في الفوازير يشرب.',
  generate(ctx) {
    return pickFreshMany(ctx, EMOJI_RIDDLES, 5).map((x) => {
      const same = EMOJI_RIDDLES.filter((y) => y.cat === x.cat && y.id !== x.id);
      const options = shuffle(ctx.rng, [x.answer, ...shuffle(ctx.rng, same).slice(0, 3).map((y) => y.answer)]);
      return { prompt: x.emoji, options, answer: options.indexOf(x.answer) };
    });
  },
});

// ---------------------------------------------------------------- Count It
const CI_LEAD = 800;
const CI_SHOW = 4500;
const CI_ANSWER = 15000;
export const countIt = {
  id: 'count-it',
  name: 'عِدّ بسرعة',
  icon: '🔢',
  color: 'cyan',
  kind: 'brain',
  minPlayers: 2,
  durationMs: CI_LEAD + CI_SHOW + CI_ANSWER + 1000,
  tagline: 'أربع ثواني. شفت كام واحد؟',
  howTo: 'زحمة إيموجي هتظهر ٤ ثواني على الشاشة الكبيرة وموبايلك. عِد بس اللي هنسألك عليه، وبعدين اكتب رقمك.',
  rule: 'أبعد تخمين يشرب. لو تعادل: اللي جاوب متأخر.',
  setup(ctx) {
    const set = pickFresh(ctx, COUNT_SETS);
    const [target, ...rest] = shuffle(ctx.rng, set.emoji);
    const elsewhere = COUNT_SETS.flatMap((x) => x.emoji).filter((e) => !set.emoji.includes(e));
    const decoys = (ctx.rng() < 0.5 ? rest : shuffle(ctx.rng, elsewhere)).slice(0, 1 + Math.floor(ctx.rng() * 4));
    const W = 9;
    const H = 6;
    const answer = 3 + Math.floor(ctx.rng() * 28);
    const noise = 6 + Math.floor(ctx.rng() * (W * H - answer - 5));
    const cells = shuffle(ctx.rng, Array.from({ length: W * H }, (_, i) => i)).slice(0, answer + noise);
    const items = cells.map((c, k) => ({
      e: k < answer ? target : pickOne(ctx.rng, decoys),
      x: (((c % W) + 0.25 + ctx.rng() * 0.5) / W) * 100,
      y: ((Math.floor(c / W) + 0.25 + ctx.rng() * 0.5) / H) * 100,
      r: Math.floor(ctx.rng() * 50 - 25),
      s: 0.8 + ctx.rng() * 0.5,
    }));
    return { target, answer, items: shuffle(ctx.rng, items), startAt: null, guesses: {}, at: {} };
  },
  onTick: (s, ctx) => (s.startAt === null ? { ...s, startAt: ctx.now } : s),
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'guess' || s.startAt === null || ctx.now < s.startAt + CI_LEAD + CI_SHOW) return s;
    const v = Math.round(Number(inp.payload));
    if (!Number.isFinite(v) || v < 0 || v > 999) return s;
    return { ...s, guesses: { ...s.guesses, [pid]: v }, at: { ...s.at, [pid]: ctx.now } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.guesses),
  resolve(s, ctx) {
    const r = closeness(ctx.players, s.guesses, s.answer, s.at);
    return {
      headline: `كانوا ${s.answer} ${s.target}. ${r.winners.length ? `${namesOf(ctx.players, r.winners)} جابها` : ''}`.trim(),
      ...r,
      tier: 'small',
      points: pointsFrom(r.rows, r.winners, r.losers),
      reveal: { label: 'الإجابة', q: `${s.target} على الشاشة`, value: String(s.answer) },
      table: closeTable(r.rows, (n) => `قال ${n}`, (d) => `بعيد بـ${d}`),
    };
  },
  view: (s, pid) => ({ target: s.target, items: s.items, startAt: s.startAt, showFrom: s.startAt && s.startAt + CI_LEAD, showUntil: s.startAt && s.startAt + CI_LEAD + CI_SHOW, myGuess: s.guesses[pid] ?? null, guessed: Object.keys(s.guesses) }),
};

function closeness(players, guesses, answer, at) {
  const rows = players.map((p) =>
    p.id in guesses ? { id: p.id, status: 'ok', primary: Math.abs(guesses[p.id] - answer), tiebreak: at?.[p.id], facts: { value: guesses[p.id] } } : { id: p.id, status: 'out', primary: 0 },
  );
  return rank(rows, { better: 'lower', deadHeat: 'primary' });
}
function closeTable(rows, said, off) {
  return {
    layout: 'list',
    rows: rows.map((x) => ({ id: x.id, place: x.place, value: x.status === 'ok' ? (x.primary === 0 ? 'بالظبط 🎯' : off(x.primary)) : '—', why: x.status === 'ok' ? said(x.facts.value) : 'ما جاوبش' })),
  };
}

// ---------------------------------------------------------------- Simon Says
const SIMON_START = 3;
const SIMON_MAX = 14;
export const simonSays = {
  id: 'simon-says',
  name: 'افتكر وكرر',
  icon: '🧠',
  color: 'cyan',
  kind: 'brain',
  minPlayers: 2,
  durationMs: 55000,
  tagline: 'بص. افتكر. كرر.',
  howTo: 'موبايلك هينوّر ألوان بترتيب معين. دوس عليهم بنفس الترتيب. كل ما تجيبها صح، السلسلة تزيد واحد. غلطة واحدة وتطلع برة.',
  rule: 'أقصر ذاكرة تشرب.',
  setup(ctx) {
    const seq = [];
    for (let i = 0; i < SIMON_MAX; i++) {
      let v = Math.floor(ctx.rng() * 4);
      if (i >= 2 && seq[i - 1] === v && seq[i - 2] === v) v = (v + 1) % 4;
      seq.push(v);
    }
    return { seq, players: {} };
  },
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'simon') return s;
    const me = s.players[pid] ?? { cleared: 0, out: false, at: 0 };
    if (me.out) return s;
    const { len, seq } = inp.payload ?? {};
    const want = SIMON_START + me.cleared;
    if (len !== want || !Array.isArray(seq)) return s;
    const ok = seq.length === want && seq.every((v, i) => v === s.seq[i]);
    const next = ok ? { cleared: me.cleared + 1, out: SIMON_START + me.cleared + 1 > SIMON_MAX, at: ctx.now } : { ...me, out: true };
    return { ...s, players: { ...s.players, [pid]: next } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => s.players[p.id]?.out),
  resolve(s, ctx) {
    const all = ctx.players.map((p) => ({ id: p.id, ...(s.players[p.id] ?? { cleared: 0, out: false, at: 0 }) }));
    const rows = all.map((x) => (x.cleared ? { id: x.id, status: 'ok', primary: x.cleared, tiebreak: x.at } : { id: x.id, status: 'out', primary: 0 }));
    const r = rank(rows, { better: 'higher' });
    const best = Math.max(...all.map((x) => x.cleared));
    return {
      headline: best > 0 ? `${namesOf(ctx.players, r.winners)} افتكر ${SIMON_START + best - 1} ورا بعض 🧠` : 'ذاكرة سمكة للكل! 🐟',
      ...r,
      tier: 'small',
      points: pointsFrom(r.rows, r.winners, r.losers),
      table: { layout: 'list', rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: x.status === 'ok' ? `🧠 ${SIMON_START + x.primary - 1} ورا بعض` : '🐟 ٠' })) },
    };
  },
  view(s, pid, ctx) {
    const players = {};
    for (const p of ctx.players) players[p.id] = s.players[p.id] ?? { cleared: 0, out: false, at: 0 };
    return { seq: s.seq, start: SIMON_START, me: players[pid] ?? null, players };
  },
};

// ---------------------------------------------------------------- Close Call
export const closeCall = {
  id: 'close-call',
  name: 'قرّب',
  icon: '📏',
  color: 'yellow',
  kind: 'brain',
  minPlayers: 2,
  durationMs: 30000,
  tagline: 'محدش يعرف. خمّن وخلاص.',
  howTo: 'سؤال إجابته رقم. اكتب أحسن تخمين عندك. مش لازم بالظبط، المهم تكون أقرب من الباقيين.',
  rule: 'أبعد تخمين يشرب. أقرب واحد يكسب. لو تعادل: اللي جاوب متأخر.',
  setup(ctx) {
    const q = pickFresh(ctx, CLOSE_CALL);
    return { q: q.text, answer: q.answer, unit: q.unit ?? '', guesses: {}, at: {} };
  },
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'guess' || pid in s.guesses) return s;
    const v = Math.round(Number(inp.payload));
    if (!Number.isFinite(v) || v < 0 || v > 9999999) return s;
    return { ...s, guesses: { ...s.guesses, [pid]: v }, at: { ...s.at, [pid]: ctx.now } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.guesses),
  resolve(s, ctx) {
    const r = closeness(ctx.players, s.guesses, s.answer, s.at);
    const all = ctx.players.map((p) => p.id);
    return {
      headline: r.winners.length ? `الإجابة ${fmtNum(s.answer)}! ${namesOf(ctx.players, r.winners)} كان الأقرب 📏` : `الإجابة ${fmtNum(s.answer)}! محدش خمّن. كله يشرب.`,
      ...r,
      losers: r.winners.length ? r.losers : all,
      tier: 'small',
      points: pointsFrom(r.rows, r.winners, r.winners.length ? r.losers : all),
      reveal: { label: 'الإجابة', q: s.q, value: `${fmtNum(s.answer)} ${s.unit}`.trim() },
      table: closeTable(r.rows, (n) => `قال ${fmtNum(n)}`, (d) => `بعيد بـ${fmtNum(d)}`),
    };
  },
  view: (s, pid) => ({ q: s.q, unit: s.unit, mine: s.guesses[pid] ?? null, guessed: Object.keys(s.guesses) }),
};

export default [colourClash, quickMath, oddOneOut, countIt, simonSays, closeCall, trueOrFalse, emojiRiddle];
