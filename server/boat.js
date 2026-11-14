// "المركب" — the card game. Five parts, one deck, scored in points.
// Points: parts 1-3 a right guess earns the part number (1/2/3); pyramid cards earn the row
// number (1-5); on the boat a wrong guess costs 1 (at most 5 in total) and getting off earns 3.
// Rules follow the reference game's published rule text (see docs/MATCHING.md for what was inferred).
import { shuffle } from './lib/util.js';

export const BOAT_MAX = 12;
const ROWS = [5, 4, 3, 2, 1];
const ROW_MS = 30000;
const SHOW_MS = 2600; // how long a guess result stays up before the next turn
const OFF_BONUS = 3;
const MAX_BOAT_LOSS = 5; // the boat ride can cost at most 5 points in total
const GUESS_MS = 30000;
const PICKS = { 1: ['red', 'black'], 2: ['higher', 'lower'], 3: ['between', 'outside', 'on'] };

const newDeck = (rng) => shuffle(rng, ['S', 'H', 'D', 'C'].flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ r: i + 2, s }))));
const isRed = (c) => c.s === 'H' || c.s === 'D';
export const cardTxt = (c) => `${c.r <= 10 ? c.r : { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r]}${{ S: '♠', H: '♥', D: '♦', C: '♣' }[c.s]}`;

function isRight(part, hand, card, pick) {
  if (part === 1) return (pick === 'red') === isRed(card);
  if (part === 2) return card.r !== hand[0].r && (pick === 'higher') === card.r > hand[0].r;
  const lo = Math.min(hand[0].r, hand[1].r);
  const hi = Math.max(hand[0].r, hand[1].r);
  const where = card.r === lo || card.r === hi ? 'on' : card.r > lo && card.r < hi ? 'between' : 'outside';
  return where === pick;
}

export function createBoat(players, rng) {
  const order = shuffle(rng, players.map((p) => p.id));
  return {
    part: 1,
    stage: 'rules',
    ready: [],
    order,
    deck: newDeck(rng),
    hands: Object.fromEntries(order.map((id) => [id, []])),
    turn: 0,
    pending: null, // { pid, card, pick, right, n, until } — a result on show
    score: Object.fromEntries(order.map((id) => [id, { points: 0, right: 0, laid: 0, wrong: 0 }])),
    log: [],
    // pyramid
    rows: [],
    row: -1,
    rowEndsAt: null,
    laid: [], // { pid, card, row, n }
    // boat
    crew: [],
    fate: false,
    boatCards: [],
    revealed: [],
    boatDeck: [],
    idx: 0,
    riders: [],
    splashed: [],
    off: [],
    firstOff: null,
    guesses: {},
    guessUntil: null,
    flip: null,
    attempts: 0,
    over: null,
  };
}

const addLog = (b, entry) => ({ ...b, log: [...b.log.slice(-29), entry] });
// The only place points move. Each event calls it exactly once.
function award(b, pid, n, field) {
  const cur = b.score[pid];
  if (!cur) return b;
  const next = { ...cur, points: cur.points + n };
  if (field) next[field] = cur[field] + 1;
  return { ...b, score: { ...b.score, [pid]: next } };
}

function startPart(b, part, now, rng) {
  if (part <= 3) return { ...b, part, stage: 'rules', ready: [], turn: 0, pending: null };
  if (part === 4) {
    const deck = [...b.deck];
    const rows = ROWS.map((n) => deck.splice(0, n));
    return { ...b, part, stage: 'rules', ready: [], rows, row: -1, laid: [], deck, pending: null };
  }
  // part 5: decide the crew
  const left = Object.entries(b.hands).map(([id, h]) => [id, h.length]);
  const most = Math.max(...left.map(([, n]) => n));
  let crew;
  let fate = false;
  if (most === 0) {
    crew = [b.order[Math.floor(rng() * b.order.length)]];
    fate = true;
  } else crew = left.filter(([, n]) => n === most).map(([id]) => id);
  const boatDeck = newDeck(rng);
  const boatCards = boatDeck.splice(0, 5);
  return { ...b, part: 5, stage: 'rules', ready: [], crew, fate, boatCards, revealed: [false, false, false, false, false], boatDeck, idx: 0, riders: [...crew], splashed: [], off: [], guesses: {}, guessUntil: null, flip: null, attempts: 1 };
}

function begin(b, now) {
  if (b.part <= 3) return { ...b, stage: 'play' };
  if (b.part === 4) return flipRow({ ...b, stage: 'pyramid' }, now);
  return { ...b, stage: 'boat', guessUntil: now + GUESS_MS };
}

function flipRow(b, now) {
  const row = b.row + 1;
  if (row >= ROWS.length) return null;
  return { ...b, row, rowEndsAt: now + ROW_MS };
}

function nextTurn(b, now, rng) {
  let turn = b.turn + 1;
  const b2 = { ...b, pending: null };
  if (turn >= b.order.length) return startPart(b2, b.part + 1, now, rng);
  return { ...b2, turn };
}

export function boatTick(b, ctx) {
  const { now } = ctx;
  if (b.stage === 'rules') {
    const people = b.order.filter((id) => ctx.connected(id));
    if (people.length && people.every((id) => b.ready.includes(id))) return begin(b, now);
    return b;
  }
  if (b.stage === 'play' && b.pending && now >= b.pending.until) return nextTurn(b, now, ctx.rng);
  if (b.stage === 'pyramid' && now >= b.rowEndsAt) return endRow(b, ctx);
  if (b.stage === 'boat' && b.guessUntil && now >= b.guessUntil && !b.flip) return flipBoat(b, ctx);
  if (b.stage === 'boat' && b.flip && now >= b.flip.until) return afterFlip(b, ctx);
  return b;
}

function endRow(b, ctx) {
  const n = flipRow(b, ctx.now);
  if (n) return n;
  return startPart({ ...b }, 5, ctx.now, ctx.rng);
}

function flipBoat(b, ctx) {
  if (!b.boatDeck.length) return { ...b, stage: 'over', over: 'deck' };
  const deck = [...b.boatDeck];
  const card = deck.shift();
  const boatCard = b.boatCards[b.idx];
  const res = {};
  let n = { ...b, boatDeck: deck };
  for (const id of b.riders) {
    const g = b.guesses[id] ?? null;
    const right = g && card.r !== boatCard.r && (g === 'higher') === card.r > boatCard.r;
    res[id] = { guess: g, right: !!right };
    if (!right) n = n.score[id].wrong < MAX_BOAT_LOSS ? award(n, id, -1, 'wrong') : award(n, id, 0, 'wrong');
  }
  const revealed = [...b.revealed];
  revealed[b.idx] = true;
  n = addLog(n, { t: 'boat', idx: b.idx, card: cardTxt(card), boat: cardTxt(boatCard) });
  return { ...n, revealed, flip: { card, boatCard, idx: b.idx, res, until: ctx.now + 3500 } };
}

function afterFlip(b, ctx) {
  const res = b.flip.res;
  const stay = b.riders.filter((id) => res[id]?.right);
  const fell = b.riders.filter((id) => !res[id]?.right);
  let n = { ...b, flip: null, guesses: {} };
  const splashed = [...b.splashed, ...fell];
  if (stay.length && b.idx + 1 >= 5) {
    // cleared all five cards
    for (const id of stay) n = award(n, id, OFF_BONUS);
    n = { ...n, off: [...n.off, ...stay], firstOff: n.firstOff ?? stay[0], riders: [], splashed };
  } else if (stay.length) {
    return { ...n, idx: b.idx + 1, riders: stay, splashed, guessUntil: ctx.now + GUESS_MS };
  } else n = { ...n, riders: [], splashed };
  // nobody left riding: everyone still on the boat restarts from card 1
  const still = b.crew.filter((id) => !n.off.includes(id));
  if (!still.length) return { ...n, stage: 'over', over: 'off' };
  if (!n.boatDeck.length) return { ...n, stage: 'over', over: 'deck' };
  return { ...n, idx: 0, riders: still, splashed: [], attempts: n.attempts + 1, guessUntil: ctx.now + GUESS_MS };
}

export function boatAct(b, pid, act, ctx) {
  const isHost = ctx.isHost(pid);
  const t = act?.type;
  if (t === 'ready' && b.stage === 'rules' && b.order.includes(pid) && !b.ready.includes(pid)) return { ...b, ready: [...b.ready, pid] };
  if (t === 'force' && isHost) {
    if (b.stage === 'rules') return begin(b, ctx.now);
    if (b.stage === 'pyramid') return endRow(b, ctx);
    if (b.stage === 'play' && b.pending) return nextTurn(b, ctx.now, ctx.rng);
    if (b.stage === 'boat' && !b.flip) return flipBoat(b, ctx);
    return b;
  }
  if (b.stage === 'play') {
    const cur = b.order[b.turn];
    if (t === 'pick' && pid === cur && !b.pending && PICKS[b.part].includes(act.pick)) {
      const deck = [...b.deck];
      const card = deck.shift();
      const hand = b.hands[pid];
      const right = isRight(b.part, hand, card, act.pick);
      let nb = { ...b, deck, hands: { ...b.hands, [pid]: [...hand, card] } };
      if (right) nb = award(nb, pid, b.part, 'right');
      nb = addLog(nb, { t: 'guess', pid, part: b.part, pick: act.pick, card: cardTxt(card), right });
      return { ...nb, pending: { pid, card, pick: act.pick, right, n: right ? b.part : 0, until: ctx.now + SHOW_MS } };
    }
    if (t === 'next' && b.pending && (pid === b.pending.pid || isHost)) return nextTurn(b, ctx.now, ctx.rng);
    return b;
  }
  if (b.stage === 'pyramid' && t === 'place') {
    const hand = b.hands[pid];
    const i = Number(act.i);
    const card = hand?.[i];
    const rowCards = b.rows[b.row] ?? [];
    if (!card || !rowCards.some((c) => c.r === card.r)) return b;
    const n = b.row + 1;
    let nb = { ...b, hands: { ...b.hands, [pid]: hand.filter((_, k) => k !== i) }, laid: [...b.laid, { pid, card: cardTxt(card), row: b.row, n }] };
    nb = award(nb, pid, n, 'laid');
    return addLog(nb, { t: 'lay', pid, n, card: cardTxt(card) });
  }
  if (b.stage === 'boat' && t === 'guess' && b.riders.includes(pid) && !b.flip && (act.pick === 'higher' || act.pick === 'lower')) {
    const guesses = { ...b.guesses, [pid]: act.pick };
    const nb = { ...b, guesses };
    return b.riders.every((id) => id in guesses) ? flipBoat(nb, ctx) : nb;
  }
  return b;
}

export function boatView(b, pid) {
  const mine = b.hands[pid];
  const visibleHands = {};
  for (const id of b.order) visibleHands[id] = b.hands[id].map(cardTxt);
  return {
    part: b.part,
    stage: b.stage,
    ready: b.ready,
    order: b.order,
    turn: b.order[b.turn] ?? null,
    hands: visibleHands, // cards are dealt face up in the reference game
    myHand: mine ? mine.map((c) => ({ txt: cardTxt(c), r: c.r, red: isRed(c) })) : null,
    pending: b.pending ? { ...b.pending, card: cardTxt(b.pending.card), red: isRed(b.pending.card) } : null,
    score: b.score,
    log: b.log.slice(-8),
    rows: b.rows.map((r, i) => (i <= b.row ? r.map(cardTxt) : r.map(() => null))),
    rowRanks: b.rows.map((r, i) => (i <= b.row ? r.map((c) => c.r) : [])),
    row: b.row,
    rowEndsAt: b.rowEndsAt,
    laid: b.laid,
    crew: b.crew,
    fate: b.fate,
    boatCards: b.boatCards.map((c, i) => (b.revealed[i] ? cardTxt(c) : null)),
    idx: b.idx,
    riders: b.riders,
    splashed: b.splashed,
    off: b.off,
    firstOff: b.firstOff,
    guessed: Object.keys(b.guesses),
    myGuess: b.guesses[pid] ?? null,
    guessUntil: b.guessUntil,
    flip: b.flip ? { card: cardTxt(b.flip.card), boatCard: cardTxt(b.flip.boatCard), idx: b.flip.idx, res: b.flip.res, higher: b.flip.card.r > b.flip.boatCard.r, same: b.flip.card.r === b.flip.boatCard.r } : null,
    attempts: b.attempts,
    deckLeft: b.stage === 'boat' || b.part === 5 ? b.boatDeck.length : b.deck.length,
    over: b.over,
  };
}

export function boatAwards(b, players) {
  const ids = b.order.filter((id) => players.some((p) => p.id === id));
  if (!ids.length) return [];
  const by = (f) => [...ids].sort((x, y) => f(y) - f(x))[0];
  const sc = (id) => b.score[id];
  const out = [];
  const champ = by((id) => sc(id).points);
  out.push({ key: 'champion', title: 'القبطان', icon: '🏆', pid: champ, value: `${sc(champ).points} نقطة` });
  const lucky = by((id) => sc(id).right);
  if (sc(lucky).right) out.push({ key: 'lucky', title: 'عينه صايبة', icon: '🎯', pid: lucky, value: `${sc(lucky).right} تخمين صح` });
  const pyr = by((id) => sc(id).laid);
  if (sc(pyr).laid) out.push({ key: 'pyramid', title: 'ملك الهرم', icon: '🔺', pid: pyr, value: `${sc(pyr).laid} ورقة` });
  if (b.crew.length) out.push({ key: 'seasick', title: 'دوخة البحر', icon: '🤢', pid: b.crew[0], value: `${b.attempts} محاولة` });
  if (b.firstOff) out.push({ key: 'escape', title: 'أول واحد نزل', icon: '🏝️', pid: b.firstOff, value: `+${OFF_BONUS}` });
  return out;
}
