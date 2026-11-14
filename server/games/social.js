// Social mini-games: votes, writing, drawing, bluffing.
import { rank, pointsFrom } from '../lib/rank.js';
import { nameOf, namesOf, pickFresh, pickFreshMany, forMode, shuffle, cleanText, sameAnswer, clusterAnswers, normalize } from '../lib/util.js';
import { MOST_LIKELY, WOULD_RATHER, IMPOSTER_WORDS, QUIPS, FIBS, TELEPHONE, DOODLES, HERD, HOT_TAKES } from '../content/social.js';

const votesTxt = (n) => (n === 0 ? '٠ صوت' : n === 1 ? 'صوت واحد' : n === 2 ? 'صوتين' : `${n} أصوات`);
const has = (ctx, id) => ctx.players.some((p) => p.id === id);

// ---------------------------------------------------------------- Most Likely To
export const mostLikelyTo = {
  id: 'most-likely-to',
  name: 'مين أكتر واحد',
  icon: '👉',
  color: 'orange',
  kind: 'social',
  minPlayers: 3,
  durationMs: 25000,
  tagline: 'شاوِر بصباعك. في السر.',
  howTo: 'هيظهر سؤال. صوّت في السر للي ينطبق عليه أكتر واحد. ومسموح… آه، مسموح تصوّت لنفسك.',
  rule: 'اللي ياخد أكتر أصوات يتخصم منه نقطة. لو تعادل كلهم يتخصم منهم نقطة.',
  setup(ctx) {
    const q = pickFresh(ctx, forMode(MOST_LIKELY, ctx.mode));
    return { prompt: q.text, votes: {} };
  },
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'vote' || !has(ctx, String(inp.payload))) return s; // can change until the vote closes (as in the reference)
    return { ...s, votes: { ...s.votes, [pid]: String(inp.payload) } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.votes),
  resolve(s, ctx) {
    const count = (id) => Object.values(s.votes).filter((v) => v === id).length;
    const max = Math.max(0, ...ctx.players.map((p) => count(p.id)));
    const losers = max > 0 ? ctx.players.filter((p) => count(p.id) === max).map((p) => p.id) : [];
    const rows = ctx.players.map((p) => ({ id: p.id, n: count(p.id) })).sort((a, b) => b.n - a.n);
    return {
      headline: losers.length ? `${namesOf(ctx.players, losers)} — أكتر واحد ${s.prompt}` : 'محدش صوّت. حاجة تشك!',
      winners: [],
      losers,
      points: Object.fromEntries(ctx.players.map((p) => [p.id, losers.includes(p.id) ? 0 : 1])),
      reveal: { label: 'أكتر واحد', value: s.prompt },
      table: { layout: 'bars', rows: rows.map((x) => ({ id: x.id, n: x.n, value: votesTxt(x.n) })) },
    };
  },
  view: (s, pid) => ({ prompt: s.prompt, myVote: s.votes[pid] ?? null, voted: Object.keys(s.votes) }),
};

// ---------------------------------------------------------------- Would You Rather
export const wouldYouRather = {
  id: 'would-you-rather',
  name: 'تختار إيه',
  icon: '⚖️',
  color: 'pink',
  kind: 'social',
  minPlayers: 3,
  durationMs: 25000,
  tagline: 'اختار جنب. وامشي مع الناس.',
  howTo: 'اختيارين وحشين. اختار اللي «انت» هتختاره فعلًا. إنك تبقى مختلف الليلة دي خطر.',
  rule: 'الأقلية يتخصم منك نقطة. لو اتقسموا بالظبط، كله يتخصم منه نقطة.',
  setup(ctx) {
    const q = pickFresh(ctx, forMode(WOULD_RATHER, ctx.mode));
    return { a: q.a, b: q.b, votes: {} };
  },
  onInput(s, pid, inp) {
    if (inp.type !== 'pick' || (inp.payload !== 0 && inp.payload !== 1)) return s;
    return { ...s, votes: { ...s.votes, [pid]: inp.payload } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.votes),
  resolve(s, ctx) {
    const A = ctx.players.filter((p) => s.votes[p.id] === 0).map((p) => p.id);
    const B = ctx.players.filter((p) => s.votes[p.id] === 1).map((p) => p.id);
    const none = ctx.players.filter((p) => !(p.id in s.votes)).map((p) => p.id);
    let losers;
    let headline;
    if (A.length === B.length && A.length > 0) {
      losers = ctx.players.map((p) => p.id);
      headline = `${A.length} قصاد ${B.length}. اتقسموا بالظبط، كله يتخصم منه نقطة!`;
    } else if (!A.length || !B.length) {
      losers = none;
      headline = 'كلكم على قلب واحد! 🤝';
    } else {
      const minority = A.length < B.length ? A : B;
      losers = [...minority, ...none];
      headline = `${A.length} قصاد ${B.length}. المتمردين يتخصم منهم نقطة: ${namesOf(ctx.players, minority)}`;
    }
    const big = A.length >= B.length ? [0, 1] : [1, 0];
    const label = (k) => `${k === 0 ? '🅰️' : '🅱️'} ${k === 0 ? s.a : s.b}`;
    const rows = [];
    big.forEach((k, g) => ctx.players.filter((p) => s.votes[p.id] === k).forEach((p) => rows.push({ id: p.id, group: g, value: k === 0 ? '🅰️' : '🅱️' })));
    none.forEach((id) => rows.push({ id, value: 'ما صوّتش' }));
    return {
      headline,
      winners: [],
      losers,
      points: Object.fromEntries(ctx.players.map((p) => [p.id, losers.includes(p.id) ? 0 : 1])),
      table: { layout: 'groups', groups: big.map((k) => ({ title: label(k), count: (k === 0 ? A : B).length })), rows },
    };
  },
  view: (s, pid) => ({ a: s.a, b: s.b, myVote: s.votes[pid] ?? null, voted: Object.keys(s.votes) }),
};

// ---------------------------------------------------------------- Imposter
const IMP_TALK = 90000;
const IMP_VOTE = 30000;
export const imposter = {
  id: 'imposter',
  name: 'الدخيل',
  icon: '🕵️',
  color: 'violet',
  kind: 'social',
  minPlayers: 3,
  weight: 0.7,
  durationMs: IMP_TALK + IMP_VOTE + 2000,
  tagline: 'كله عارف الكلمة. إلا واحد.',
  howTo: 'اضغط مطوّل على موبايلك عشان تشوف الكلمة السرية. واحد فيكم دخيل وبيشوف التصنيف بس. ابتدوا من اللي ظاهر على الشاشة ولفّوا، كل واحد يقول كلمة واحدة بصوت عالي عنها. وبعدين صوّتوا مين اللي بيفبرك.',
  rule: 'لو اتمسك الدخيل؟ الدخيل يتخصم منه نقطة. لو هرب؟ كل الباقيين يتخصم منهم نقطة.',
  setup(ctx) {
    const imp = ctx.players[Math.floor(ctx.rng() * ctx.players.length)].id;
    const others = ctx.players.filter((p) => p.id !== imp);
    return {
      secret: pickFresh(ctx, IMPOSTER_WORDS),
      imposter: imp,
      starter: others[Math.floor(ctx.rng() * others.length)].id,
      stage: 'discuss',
      discussUntil: null,
      voteUntil: null,
      readyToVote: [],
      votes: {},
    };
  },
  onTick(s, ctx) {
    if (s.discussUntil === null) return { ...s, discussUntil: ctx.now + IMP_TALK };
    if (s.stage === 'discuss' && (ctx.players.every((p) => s.readyToVote.includes(p.id)) || ctx.now >= s.discussUntil)) return { ...s, stage: 'vote', voteUntil: ctx.now + IMP_VOTE };
    return s;
  },
  onInput(s, pid, inp, ctx) {
    if (s.stage === 'discuss' && inp.type === 'readyVote' && !s.readyToVote.includes(pid)) {
      const ready = [...s.readyToVote, pid];
      return ctx.players.every((p) => ready.includes(p.id)) ? { ...s, readyToVote: ready, stage: 'vote', voteUntil: ctx.now + IMP_VOTE } : { ...s, readyToVote: ready };
    }
    if (s.stage === 'vote' && inp.type === 'vote') {
      const v = String(inp.payload);
      if (v === pid || !has(ctx, v)) return s;
      return { ...s, votes: { ...s.votes, [pid]: v } };
    }
    return s;
  },
  isComplete: (s, ctx) => s.stage === 'vote' && (ctx.players.every((p) => p.id in s.votes) || ctx.now >= s.voteUntil),
  resolve(s, ctx) {
    const count = (id) => Object.values(s.votes).filter((v) => v === id).length;
    const max = Math.max(0, ...ctx.players.map((p) => count(p.id)));
    const top = ctx.players.filter((p) => count(p.id) === max).map((p) => p.id);
    const caught = max > 0 && top.length === 1 && top[0] === s.imposter;
    const imp = nameOf(ctx.players, s.imposter);
    const crew = ctx.players.filter((p) => p.id !== s.imposter).map((p) => p.id);
    const points = Object.fromEntries(ctx.players.map((p) => [p.id, p.id === s.imposter ? (caught ? 0 : 3) : caught ? (s.votes[p.id] === s.imposter ? 2 : 1) : 0]));
    return {
      headline: caught ? `اتمسك! ${imp} كان الدخيل. الكلمة كانت «${s.secret.word}»` : `${imp} ضحك عليكم كلكم! الكلمة كانت «${s.secret.word}»`,
      winners: caught ? crew : [s.imposter],
      losers: caught ? [s.imposter] : crew,
      points,
      reveal: { label: 'الكلمة كانت', value: s.secret.word },
      table: {
        layout: 'bars',
        rows: ctx.players
          .map((p) => ({ id: p.id, n: count(p.id), value: votesTxt(count(p.id)), ...(p.id === s.imposter ? { mark: '🕵️', why: 'الدخيل' } : {}) }))
          .sort((a, b) => b.n - a.n),
      },
    };
  },
  view(s, pid, ctx) {
    const role = has(ctx, pid) ? (pid === s.imposter ? 'imposter' : 'crew') : 'screen';
    return {
      role,
      category: s.secret.category,
      word: role === 'crew' ? s.secret.word : null,
      starter: has(ctx, s.starter) ? s.starter : ctx.players.find((p) => p.id !== s.imposter)?.id ?? null,
      stage: s.stage,
      discussUntil: s.discussUntil,
      voteUntil: s.voteUntil,
      readyToVote: s.readyToVote,
      voted: Object.keys(s.votes),
      myVote: s.votes[pid] ?? null,
    };
  },
};

// ---------------------------------------------------------------- pairing helper (Quip Clash / Doodle Duel)
function pairUp(ctx) {
  const ids = shuffle(ctx.rng, ctx.players.map((p) => p.id));
  const pairs = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  if (ids.length % 2 === 1) pairs[pairs.length - 1].push(ids[ids.length - 1]);
  return pairs;
}
// Authors don't vote on their own matchup (unless a trio, or only 3 people play).
const mayVote = (m, pid, n) => !m.authors.includes(pid) || m.authors.length > 2 || n <= 3;

function duelVoting(stageWrite) {
  return {
    onTick(s, ctx, writeMs, voteMs, revealMs, graceMs = 0) {
      if (s.until === null) return { ...s, until: ctx.now + writeMs };
      const cur = s.matchups[s.k];
      if (s.stage === stageWrite) {
        const done = s.matchups.every((m) => m.authors.every((a) => a in m.entries || !has(ctx, a)));
        if (done || ctx.now >= s.until + graceMs) return { ...s, stage: 'vote', k: 0, until: ctx.now + voteMs };
      } else if (s.stage === 'vote' && cur) {
        const all = ctx.players.filter((p) => mayVote(cur, p.id, ctx.players.length)).every((p) => p.id in cur.votes);
        if (all || ctx.now >= s.until) return { ...s, stage: 'reveal', until: ctx.now + revealMs };
      } else if (s.stage === 'reveal' && ctx.now >= s.until) {
        return s.k + 1 < s.matchups.length ? { ...s, stage: 'vote', k: s.k + 1, until: ctx.now + voteMs } : { ...s, stage: 'done', until: null };
      }
      return s;
    },
    vote(s, pid, inp, ctx, lock = false) {
      const m = s.matchups[s.k];
      const author = m?.order[Number(inp.payload?.pick)];
      if (!m || !author || author === pid || (lock && pid in m.votes) || !mayVote(m, pid, ctx.players.length)) return s;
      return { ...s, matchups: s.matchups.map((x, i) => (i === s.k ? { ...x, votes: { ...x.votes, [pid]: author } } : x)) };
    },
    resolve(s, ctx, isBlank) {
      let best = null;
      const rows = [];
      s.matchups.forEach((m, g) => {
        for (const a of m.authors) {
          const v = Object.values(m.votes).filter((x) => x === a).length;
          const blank = isBlank(m.entries[a]);
          if (!blank && (!best || v > best.votes)) best = { m, by: a, votes: v };
          rows.push({ id: a, status: 'ok', primary: v, group: g, forceLoss: blank, facts: { entry: m.entries[a] } });
        }
      });
      const r = rank(rows, { better: 'higher' });
      return { r, best };
    },
    current(s, pid) {
      const m = s.matchups[s.k];
      if (!(s.stage === 'vote' || s.stage === 'reveal') || !m) return null;
      return {
        prompt: m.prompt,
        entries: m.order.map((a) => m.entries[a] ?? null),
        mine: m.order.indexOf(pid),
        myVote: m.votes[pid] ? m.order.indexOf(m.votes[pid]) : null,
        voted: Object.keys(m.votes),
        authors: s.stage === 'reveal' ? m.order : null,
        votes: s.stage === 'reveal' ? m.order.map((a) => Object.values(m.votes).filter((x) => x === a).length) : null,
      };
    },
  };
}

// ---------------------------------------------------------------- Quip Clash
const QC_WRITE = 60000;
const QC_VOTE = 15000;
const QC_REVEAL = 4500;
const quipDuel = duelVoting('write');
export const quipClash = {
  id: 'quip-clash',
  name: 'قفشة',
  icon: '🎤',
  color: 'magenta',
  kind: 'social',
  minPlayers: 3,
  weight: 1.3,
  durationMs: QC_WRITE + 10 * (QC_VOTE + QC_REVEAL) + 5000,
  tagline: 'خليك أدمّ من اللي قصادك.',
  howTo: 'انت وواحد تاني هتاخدوا نفس السؤال. اكتب أظرف إجابة تقدر عليها. وبعدين الكل يصوّت لأحسن واحدة من غير ما يعرف مين كتب إيه.',
  rule: 'صاحب الإجابة الأقل تصويتًا بيتخصم منه نقطة. صفر أصوات برضه بيتخصم منه نقطة واحدة.',
  setup(ctx) {
    const pairs = pairUp(ctx);
    const qs = pickFreshMany(ctx, forMode(QUIPS, ctx.mode), pairs.length);
    return { stage: 'write', until: null, k: 0, matchups: pairs.map((authors, i) => ({ prompt: qs[i % qs.length].text, authors, order: shuffle(ctx.rng, authors), entries: {}, votes: {} })) };
  },
  onTick: (s, ctx) => quipDuel.onTick(s, ctx, QC_WRITE, QC_VOTE, QC_REVEAL),
  onInput(s, pid, inp, ctx) {
    if (s.stage === 'write' && inp.type === 'answer') {
      const text = cleanText(inp.payload?.text, 60);
      const i = s.matchups.findIndex((m) => m.authors.includes(pid));
      if (i < 0 || !text) return s;
      return { ...s, matchups: s.matchups.map((m, j) => (j === i ? { ...m, entries: { ...m.entries, [pid]: text } } : m)) };
    }
    if (s.stage === 'vote' && inp.type === 'vote') return quipDuel.vote(s, pid, inp, ctx);
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const { r, best } = quipDuel.resolve(s, ctx, (e) => !e);
    return {
      headline: best ? `أحسن قفشة: «${best.m.entries[best.by]}» من ${nameOf(ctx.players, best.by)} 🎤` : 'محدش كتب حاجة! 🦗',
      winners: r.winners,
      losers: best ? r.losers : ctx.players.map((p) => p.id),
      points: pointsFrom(r.rows, r.winners, r.losers, 'duel'),
      table: {
        layout: 'pairs',
        groups: s.matchups.map((m) => ({ title: m.prompt })),
        rows: r.rows.map((x) => ({ id: x.id, group: x.group, place: x.place, value: String(x.primary), why: x.facts.entry ? `«${x.facts.entry}»` : '🦗 ما كتبش' })),
      },
    };
  },
  view(s, pid) {
    const mine = s.matchups.find((m) => m.authors.includes(pid));
    return {
      stage: s.stage,
      until: s.until,
      k: s.k,
      total: s.matchups.length,
      myPrompt: mine?.prompt ?? null,
      myAnswer: mine?.entries[pid] ?? null,
      written: s.matchups.flatMap((m) => Object.keys(m.entries)),
      current: quipDuel.current(s, pid),
    };
  },
};

// ---------------------------------------------------------------- Doodle Duel
const DD_DRAW = 60000;
const DD_GRACE = 1500;
const DD_VOTE = 15000;
const DD_REVEAL = 4500;
const doodleDuelV = duelVoting('draw');
export const PALETTE = ['#000000', '#FF1744', '#FF9100', '#FFD600', '#00C853', '#2979FF', '#AA00FF', '#FF4FA3', '#8D5524', '#9E9E9E'];
export function cleanDrawing(d) {
  const strokes = Array.isArray(d?.strokes) ? d.strokes : [];
  let budget = 12000;
  const out = [];
  for (const st of strokes.slice(0, 600)) {
    if (!st || !Array.isArray(st.p)) continue;
    const p = st.p.slice(0, Math.min(st.p.length, budget)).map((v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0))));
    budget -= p.length;
    const c = PALETTE.includes(st.c) || st.c === '#FFFFFF' ? st.c : '#000000';
    out.push({ c, w: Math.max(2, Math.min(60, Number(st.w) || 8)), p: p.length % 2 ? p.slice(0, -1) : p });
    if (budget <= 0) break;
  }
  return { strokes: out };
}
const blankDrawing = (d) => !d?.strokes?.length;
export const doodleDuel = {
  id: 'doodle-duel',
  name: 'خربشة',
  icon: '🖍️',
  color: 'orange',
  kind: 'social',
  isNew: true,
  minPlayers: 3,
  durationMs: DD_DRAW + DD_GRACE + 10 * (DD_VOTE + DD_REVEAL) + 5000,
  tagline: 'نفس الكلمة. رسمتين. رسمة واحدة تكسب.',
  howTo: 'انت وواحد تاني هترسموا نفس الحاجة في دقيقة. وبعدين الكل يصوّت لأحسن رسمة من غير ما يعرف مين رسم إيه.',
  rule: 'صاحب الرسمة الأقل تصويتًا أو الورقة الفاضية بيتخصم منه نقطة واحدة.',
  setup(ctx) {
    const pairs = pairUp(ctx);
    const qs = pickFreshMany(ctx, forMode(DOODLES, ctx.mode), pairs.length);
    return { stage: 'draw', until: null, k: 0, matchups: pairs.map((authors, i) => ({ prompt: qs[i % qs.length].text, authors, order: shuffle(ctx.rng, authors), entries: {}, votes: {} })) };
  },
  onTick: (s, ctx) => doodleDuelV.onTick(s, ctx, DD_DRAW, DD_VOTE, DD_REVEAL, DD_GRACE),
  onInput(s, pid, inp, ctx) {
    if (s.stage === 'draw' && inp.type === 'submit') {
      const i = s.matchups.findIndex((m) => m.authors.includes(pid));
      if (i < 0 || pid in s.matchups[i].entries) return s;
      const d = cleanDrawing(inp.payload?.drawing);
      if (blankDrawing(d)) return s;
      return { ...s, matchups: s.matchups.map((m, j) => (j === i ? { ...m, entries: { ...m.entries, [pid]: d } } : m)) };
    }
    if (s.stage === 'vote' && inp.type === 'vote') return doodleDuelV.vote(s, pid, inp, ctx, true);
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const { r, best } = doodleDuelV.resolve(s, ctx, blankDrawing);
    return {
      headline: best ? `أحسن خربشة: «${best.m.prompt}» من ${nameOf(ctx.players, best.by)} 🖍️` : 'كل الورق فاضي! 🦗',
      winners: r.winners,
      losers: best ? r.losers : ctx.players.map((p) => p.id),
      points: pointsFrom(r.rows, r.winners, r.losers, 'duel'),
      table: {
        layout: 'pairs',
        groups: s.matchups.map((m) => ({ title: `✏️ «${m.prompt}»` })),
        rows: r.rows.map((x) => ({ id: x.id, group: x.group, place: x.place, value: String(x.primary), why: x.forceLoss ? '🦗 ورقة فاضية' : undefined })),
      },
    };
  },
  view(s, pid) {
    const mine = s.matchups.find((m) => m.authors.includes(pid));
    return {
      stage: s.stage,
      until: s.until,
      k: s.k,
      total: s.matchups.length,
      pairs: s.matchups.map((m) => m.authors),
      myPrompt: mine?.prompt ?? null,
      rivals: mine ? mine.authors.filter((a) => a !== pid) : [],
      sent: !!mine && pid in mine.entries,
      drawn: s.matchups.flatMap((m) => Object.keys(m.entries)),
      current: doodleDuelV.current(s, pid),
    };
  },
};

// ---------------------------------------------------------------- Big Fat Lie
const BFL_WRITE = 45000;
const BFL_PICK = 25000;
const BFL_REVEAL = 7000;
const isTruth = (fib, text) => fib.answers.some((a) => sameAnswer(a, text));
export const bigFatLie = {
  id: 'big-fat-lie',
  name: 'فشر',
  icon: '🤥',
  color: 'yellow',
  kind: 'social',
  minPlayers: 3,
  weight: 1.2,
  durationMs: BFL_WRITE + BFL_PICK + BFL_REVEAL + 3000,
  tagline: 'معلومة غريبة واحدة. وفشر كتير مقنع.',
  howTo: 'هتظهر معلومة حقيقية وغريبة وفيها فراغ. اكتب إجابة فشر تتصدق (أو الإجابة الحقيقية لو عارفها). وبعدين كل الإجابات هتظهر مع بعض: دوّر على الحقيقة.',
  rule: 'لو صدّقت فشر يتخصم منك نقطة. لو ضحكت على غيرك تبقى في الأمان.',
  setup(ctx) {
    return { fib: pickFresh(ctx, forMode(FIBS, ctx.mode)), stage: 'write', until: null, lies: {}, options: [], picks: {} };
  },
  onTick(s, ctx) {
    if (s.until === null) return { ...s, until: ctx.now + BFL_WRITE };
    if (s.stage === 'write' && (ctx.players.every((p) => p.id in s.lies) || ctx.now >= s.until)) {
      const truth = { text: '', authors: [], truth: true };
      const opts = [];
      for (const [id, text] of Object.entries(s.lies)) {
        if (isTruth(s.fib, text)) {
          truth.authors.push(id);
          continue;
        }
        const same = opts.find((o) => sameAnswer(o.text, text));
        if (same) same.authors.push(id);
        else opts.push({ text, authors: [id], truth: false });
      }
      opts.push(truth);
      const options = shuffle(ctx.rng, opts);
      const ti = options.indexOf(truth);
      return { ...s, stage: 'pick', options, picks: Object.fromEntries(truth.authors.map((a) => [a, ti])), until: ctx.now + BFL_PICK };
    }
    if (s.stage === 'pick' && (ctx.players.every((p) => p.id in s.picks) || ctx.now >= s.until)) return { ...s, stage: 'reveal', until: ctx.now + BFL_REVEAL };
    if (s.stage === 'reveal' && ctx.now >= s.until) return { ...s, stage: 'done', until: null };
    return s;
  },
  onInput(s, pid, inp) {
    if (s.stage === 'write' && inp.type === 'lie') {
      const t = cleanText(inp.payload?.text, 40);
      return normalize(t) ? { ...s, lies: { ...s.lies, [pid]: t } } : s;
    }
    if (s.stage === 'pick' && inp.type === 'pick') {
      const i = Number(inp.payload?.i);
      const o = s.options[i];
      if (!o || o.authors.includes(pid) || s.options[s.picks[pid]]?.authors.includes(pid)) return s;
      return { ...s, picks: { ...s.picks, [pid]: i } };
    }
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const found = (id) => s.picks[id] !== undefined && !!s.options[s.picks[id]]?.truth;
    const fooledBy = new Map();
    for (const i of Object.values(s.picks)) {
      const o = s.options[i];
      if (o && !o.truth) for (const a of o.authors) fooledBy.set(a, (fooledBy.get(a) ?? 0) + 1);
    }
    const best = [...fooledBy.entries()].sort((a, b) => b[1] - a[1])[0];
    const fell = ctx.players.filter((p) => !found(p.id)).map((p) => p.id);
    const losers = fell.filter((id) => id !== best?.[0]);
    const truthText = s.fib.answers[0];
    return {
      headline: best ? `الحقيقة: «${truthText}». أكبر فشّار: ${nameOf(ctx.players, best[0])} (ضحك على ${best[1]}) 🤥` : `الحقيقة: «${truthText}». محدش اتضحك عليه!`,
      winners: best ? [best[0]] : [],
      losers,
      points: Object.fromEntries(ctx.players.map((p) => [p.id, losers.includes(p.id) ? 0 : (found(p.id) ? 2 : 0) + (fooledBy.get(p.id) ?? 0)])),
      reveal: { label: 'الحقيقة', value: truthText },
      table: {
        layout: 'list',
        rows: ctx.players.map((p) => {
          const f = fooledBy.get(p.id) ?? 0;
          const extra = f ? ` · ضحك على ${f}` : '';
          if (found(p.id)) return { id: p.id, mark: p.id === best?.[0] ? '🤥' : '✓', value: 'لقاها', why: `لقى الحقيقة${extra}` };
          const o = s.picks[p.id] === undefined ? null : s.options[s.picks[p.id]];
          return { id: p.id, mark: p.id === best?.[0] ? '🤥' : '✗', value: p.id === best?.[0] ? 'أحسن فشّار' : 'اتضحك عليه', why: o ? `صدّق فشر ${namesOf(ctx.players, o.authors)}${extra}` : `ما اختارش${extra}` };
        }),
      },
    };
  },
  view(s, pid) {
    const rev = s.stage === 'reveal' || s.stage === 'done';
    return {
      stage: s.stage,
      until: s.until,
      text: s.fib.text,
      answer: rev ? s.fib.answers[0] : undefined,
      myLie: s.lies[pid] ?? null,
      knewTruth: isTruth(s.fib, s.lies[pid] ?? ''),
      written: Object.keys(s.lies),
      options: s.options.map((o) => ({
        text: o.truth ? s.fib.answers[0] : o.text,
        truth: rev ? o.truth : undefined,
        mine: o.authors.includes(pid),
        authors: rev ? o.authors : undefined,
        pickers: rev ? Object.entries(s.picks).filter(([, i]) => s.options[i] === o).map(([id]) => id) : undefined,
      })),
      myPick: s.picks[pid] ?? null,
      picked: Object.keys(s.picks),
    };
  },
};

// ---------------------------------------------------------------- Drunk Telephone
const DT_WRITE = 35000;
const DT_DRAW = 60000;
const DT_GUESS = 35000;
const DT_STEP_SHOW = 3000;
const DT_BLAME = 12000;
const DT_LATE = 3000;
const stepMs = (k) => (k === 0 ? DT_WRITE : k === 1 ? DT_DRAW : DT_GUESS);
const chainOf = (s, i, step) => (i - step + s.order.length * 4) % s.order.length;
const emptyEntry = (e) => (e.drawing ? !e.drawing.strokes.length : !e.text);
const perfect = (c) => !!c[0]?.text && !!c[2]?.text && sameAnswer(c[0].text, c[2].text);
const revealMs = (c) => 2 * DT_STEP_SHOW + (perfect(c) ? 4000 : DT_BLAME);
export const drunkTelephone = {
  id: 'broken-telephone',
  name: 'التليفون الخربان',
  icon: '🎨',
  color: 'cyan',
  kind: 'social',
  minPlayers: 3,
  weight: 0.9,
  durationMs: DT_WRITE + DT_DRAW + DT_GUESS + 20 * (3 * DT_STEP_SHOW + DT_BLAME) + 8000,
  tagline: 'اكتبها. ارسمها. خمّنها. بوّظها.',
  howTo: 'اكتب جملة مضحكة (أو دوس 🎲). الموبايل اللي بعدك يرسمها، واللي بعده يخمّن الرسمة. وبعدين الشاشة الكبيرة تعرض كل السلاسل.',
  rule: 'كل سلسلة باظت، الكل يصوّت مين بوّظها: الرسّام ولا اللي خمّن. هو اللي يتخصم منه نقطة.',
  setup(ctx) {
    const order = shuffle(ctx.rng, ctx.players.map((p) => p.id));
    return { order, chains: order.map(() => []), step: 0, stage: 'play', until: null, reveals: [], r: 0, revealStart: null, blame: [], lateUntil: 0 };
  },
  onTick(s, ctx) {
    if (s.until === null) return { ...s, until: ctx.now + DT_WRITE };
    if (s.stage === 'play') {
      const allIn = s.order.every((id, i) => s.chains[chainOf(s, i, s.step)][s.step] || !has(ctx, id));
      if (!allIn && ctx.now < s.until) return s;
      const chains = s.chains.map((c) => [...c]);
      s.order.forEach((id, i) => {
        const c = chainOf(s, i, s.step);
        if (!chains[c][s.step]) chains[c][s.step] = s.step === 1 ? { by: id, drawing: { strokes: [] } } : { by: id, text: '' };
      });
      if (s.step < 2) return { ...s, chains, step: s.step + 1, until: ctx.now + stepMs(s.step + 1), lateUntil: ctx.now + DT_LATE };
      const reveals = shuffle(ctx.rng, chains.map((_, i) => i));
      return { ...s, chains, stage: 'reveal', reveals, r: 0, revealStart: ctx.now, until: ctx.now + revealMs(chains[reveals[0]]), blame: reveals.map(() => ({})), lateUntil: ctx.now + DT_LATE };
    }
    if (s.stage === 'reveal') {
      const c = s.chains[s.reveals[s.r]];
      const everyoneVoted = ctx.now >= s.revealStart + 2 * DT_STEP_SHOW && !perfect(c) && ctx.players.every((p) => p.id in (s.blame[s.r] ?? {}));
      if (everyoneVoted || ctx.now >= s.until) {
        if (s.r + 1 >= s.reveals.length) return { ...s, stage: 'done', until: null };
        const r = s.r + 1;
        return { ...s, r, revealStart: ctx.now, until: ctx.now + revealMs(s.chains[s.reveals[r]]) };
      }
    }
    return s;
  },
  onInput(s, pid, inp, ctx) {
    if (s.stage !== 'done' && inp.type === 'submit') {
      const i = s.order.indexOf(pid);
      if (i < 0) return s;
      const cur = s.stage === 'play' ? s.step : 3;
      const step = inp.payload?.step ?? cur;
      const late = step === cur - 1 && ctx.now < s.lateUntil; // a submit that raced the timer
      if ((step !== cur && !late) || ![0, 1, 2].includes(step)) return s;
      const c = chainOf(s, i, step);
      const existing = s.chains[c][step];
      if (existing && !(late && emptyEntry(existing))) return s;
      const entry = step === 1 ? { by: pid, drawing: cleanDrawing(inp.payload?.drawing) } : { by: pid, text: cleanText(inp.payload?.text, 50) };
      if (emptyEntry(entry) && (step !== 1 || late)) return s;
      const chains = s.chains.map((x, k) => (k === c ? Object.assign([...x], { [step]: entry }) : x));
      return { ...s, chains };
    }
    if (s.stage === 'reveal' && inp.type === 'blame') {
      const who = inp.payload?.who;
      if ((who !== 'draw' && who !== 'guess') || ctx.now < s.revealStart + 2 * DT_STEP_SHOW - 1500) return s;
      return { ...s, blame: s.blame.map((b, k) => (k === s.r ? { ...b, [pid]: who } : b)) };
    }
    return s;
  },
  isComplete: (s) => s.stage === 'done',
  resolve(s, ctx) {
    const losers = [];
    let perfects = 0;
    let firstRuined = null;
    s.reveals.forEach((ci, k) => {
      const c = s.chains[ci];
      if (perfect(c)) return void perfects++;
      firstRuined ??= c;
      const votes = Object.values(s.blame[k] ?? {});
      const d = votes.filter((v) => v === 'draw').length;
      const g = votes.filter((v) => v === 'guess').length;
      if (d >= g && c[1]) losers.push(c[1].by);
      if (g >= d && c[2]) losers.push(c[2].by);
    });
    const uniq = [...new Set(losers)].filter((id) => has(ctx, id));
    return {
      headline: firstRuined && firstRuined[0]?.text ? `«${firstRuined[0].text}» بقت «${firstRuined[2]?.text || '…'}» 🎨` : `${perfects === 1 ? 'سلسلة واحدة' : `${perfects} سلاسل`} مظبوطة! محدش بوّظ حاجة.`,
      winners: [],
      losers: uniq,
      points: Object.fromEntries(ctx.players.map((p) => [p.id, uniq.includes(p.id) ? 0 : 1])),
      gallery: s.reveals.map((ci, k) => {
        const votes = Object.values(s.blame[k] ?? {});
        const d = votes.filter((v) => v === 'draw').length;
        const g = votes.filter((v) => v === 'guess').length;
        const p = perfect(s.chains[ci]);
        return { steps: s.chains[ci], perfect: p, blamed: p || !votes.length ? null : d > g ? 'draw' : g > d ? 'guess' : 'both' };
      }),
      table: { layout: 'list', rows: ctx.players.map((p) => (uniq.includes(p.id) ? { id: p.id, mark: '💥', value: 'المتهم' } : { id: p.id, value: 'بريء' })).sort((a) => (a.mark ? 1 : -1)) },
    };
  },
  view(s, pid) {
    const i = s.order.indexOf(pid);
    let task = null;
    if (s.stage === 'play' && i >= 0) {
      const c = chainOf(s, i, s.step);
      task = { kind: ['write', 'draw', 'guess'][s.step], source: s.step > 0 ? s.chains[c][s.step - 1] : undefined, done: !!s.chains[c][s.step] };
    }
    const c = s.stage === 'reveal' ? s.chains[s.reveals[s.r]] : null;
    const b = s.blame[s.r] ?? {};
    return {
      stage: s.stage,
      step: s.step,
      until: s.until,
      task,
      submitted: s.stage === 'play' ? s.order.filter((_, k) => s.chains[chainOf(s, k, s.step)][s.step]) : [],
      reveal: c
        ? {
            r: s.r,
            total: s.reveals.length,
            start: s.revealStart,
            chain: c,
            perfect: perfect(c),
            myBlame: b[pid] ?? null,
            voted: Object.keys(b),
            counts: { draw: Object.values(b).filter((v) => v === 'draw').length, guess: Object.values(b).filter((v) => v === 'guess').length },
          }
        : null,
    };
  },
};

// ---------------------------------------------------------------- Herd Mentality
export const herdMentality = {
  id: 'herd-mentality',
  name: 'ماشي مع القطيع',
  icon: '🐄',
  color: 'pink',
  kind: 'social',
  minPlayers: 3,
  weight: 1.2,
  durationMs: 30000,
  tagline: 'فكّر زي القطيع. مووو.',
  howTo: 'هيظهر سؤال بسيط. اكتب الإجابة اللي انت متوقع إن «أغلب» الناس هتقولها. الإملا مش مهم أوي.',
  rule: 'أي حد برة أكبر إجابة يتخصم منه نقطة.',
  setup: (ctx) => ({ q: pickFresh(ctx, forMode(HERD, ctx.mode)).text, answers: {} }),
  onInput(s, pid, inp) {
    if (inp.type !== 'answer') return s;
    const t = cleanText(inp.payload?.text, 40);
    return t ? { ...s, answers: { ...s.answers, [pid]: t } } : s;
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.answers),
  resolve(s, ctx) {
    const answers = Object.fromEntries(Object.entries(s.answers).filter(([id]) => has(ctx, id)));
    const groups = clusterAnswers(answers);
    const all = ctx.players.map((p) => p.id);
    const biggest = groups[0]?.ids.length ?? 0;
    const shown = groups.slice(0, 6);
    const rows = [];
    shown.forEach((g, k) => g.ids.forEach((id) => rows.push({ id, group: k, value: answers[id] })));
    for (const id of all) if (!rows.some((r) => r.id === id)) rows.push({ id, value: answers[id] ?? 'ما جاوبش' });
    const table = { layout: 'groups', groups: shown.map((g) => ({ title: `«${g.label}»`, count: g.ids.length })), rows };
    if (biggest <= 1) {
      return { headline: 'مفيش قطيع! كل واحد في حتة. كله يتخصم منه نقطة.', winners: [], losers: all, points: Object.fromEntries(all.map((id) => [id, 0])), reveal: { label: 'السؤال', value: s.q }, table };
    }
    const top = groups.filter((g) => g.ids.length === biggest);
    const herd = new Set(top.flatMap((g) => g.ids));
    const losers = all.filter((id) => !herd.has(id));
    const labels = top.map((g) => `«${g.label}»`).join(' / ');
    return {
      headline: top.length > 1 ? `القطيع اتقسم: ${labels}. الباقي يتخصم منه نقطة.` : `القطيع قال ${labels} (${biggest}). ${losers.length ? `المتمردين يتخصم منهم نقطة: ${namesOf(ctx.players, losers)}` : 'قطيع مثالي!'}`,
      winners: [...herd],
      losers,
      points: Object.fromEntries(all.map((id) => [id, losers.includes(id) ? 0 : 1])),
      reveal: { label: 'السؤال', value: s.q },
      table,
    };
  },
  view: (s, pid) => ({ q: s.q, myAnswer: s.answers[pid] ?? null, answered: Object.keys(s.answers) }),
};

// ---------------------------------------------------------------- Hot Take
export const hotTake = {
  id: 'hot-take',
  name: 'رأيك بصراحة',
  icon: '🌶️',
  color: 'red',
  kind: 'social',
  minPlayers: 3,
  durationMs: 25000,
  tagline: 'قيّمها من ١ لـ١٠. ما تبقاش الغريب.',
  howTo: 'هيظهر حاجة على الشاشة. قيّمها من ١ (زفت) لـ١٠ (تحفة). وبعدين هنحسب متوسط الأوضة.',
  rule: 'أبعد واحد عن المتوسط يتخصم منه نقطة. أقرب واحد يكسب. لو تعادل: اللي قيّم متأخر.',
  setup: (ctx) => ({ q: pickFresh(ctx, forMode(HOT_TAKES, ctx.mode)).text, rates: {}, at: {} }),
  onInput(s, pid, inp, ctx) {
    if (inp.type !== 'rate' || pid in s.rates) return s;
    const v = Number(inp.payload);
    if (!Number.isInteger(v) || v < 1 || v > 10) return s;
    return { ...s, rates: { ...s.rates, [pid]: v }, at: { ...s.at, [pid]: ctx.now } };
  },
  isComplete: (s, ctx) => ctx.players.every((p) => p.id in s.rates),
  resolve(s, ctx) {
    const all = ctx.players.map((p) => p.id);
    const rated = all.filter((id) => id in s.rates);
    if (!rated.length) return { headline: 'محدش قيّم. كله يتخصم منه نقطة!', winners: [], losers: all, points: Object.fromEntries(all.map((id) => [id, 0])), table: { layout: 'list', rows: all.map((id) => ({ id, value: '—' })) } };
    const avg = rated.reduce((a, id) => a + s.rates[id], 0) / rated.length;
    const rows = all.map((id) => (id in s.rates ? { id, status: 'ok', primary: Math.round(Math.abs(s.rates[id] - avg) * 1000) / 1000, tiebreak: s.at[id], facts: { value: s.rates[id] } } : { id, status: 'out', primary: 0 }));
    const r = rank(rows, { better: 'lower', deadHeat: 'primary' });
    const rebels = r.losers.filter((id) => id in s.rates);
    const a = avg.toFixed(1);
    return {
      headline: !r.losers.length ? `مخ واحد! الكل قال ${s.rates[rated[0]]} 🌶️` : rebels.length ? `متوسط الأوضة ${a}. أسخن رأي: ${namesOf(ctx.players, rebels)} (${s.rates[rebels[0]]}) 🌶️` : `متوسط الأوضة ${a}. ${namesOf(ctx.players, r.losers)} ما قيّموش.`,
      ...r,
      points: pointsFrom(r.rows, r.winners, r.losers),
      reveal: { label: 'متوسط الأوضة', q: s.q, value: a },
      table: { layout: 'list', rows: r.rows.map((x) => ({ id: x.id, place: x.place, value: x.status === 'ok' ? (x.primary === 0 ? 'بالظبط 🎯' : `بعيد ${x.primary.toFixed(1)}`) : '—', why: x.status === 'ok' ? `قيّم ${x.facts.value}` : 'ما قيّمش' })) },
    };
  },
  view: (s, pid) => ({ q: s.q, mine: s.rates[pid] ?? null, rated: Object.keys(s.rates) }),
};

export default [mostLikelyTo, wouldYouRather, imposter, quipClash, doodleDuel, bigFatLie, drunkTelephone, herdMentality, hotTake];
