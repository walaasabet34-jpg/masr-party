// "المركب" — the card game. Five parts, one deck, sips only.
// Rules follow the reference game's published rule text (see docs/MATCHING.md for what was inferred).
import { shuffle } from './lib/util.js';
import { sipsLabel } from './penalty.js';

export const BOAT_MAX = 12;
const ROWS = [5, 4, 3, 2, 1];
const ROW_MS = 30000;
const GUESS_MS = 30000;
const PICKS = { 1: ['red', 'black'], 2: ['higher', 'lower'], 3: ['between', 'outside', 'on'] };

const newDeck = (rng) => shuffle(rng, ['S', 'H', 'D', 'C'].flatMap((s) => Array.from({ length: 13 }, (_, i) => ({ r: i + 2, s }))));
const isRed = (c) => c.s === 'H' || c.s === 'D';
export const cardTxt = (c) => `${c.r <= 10 ? c.r : { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.r]}${{ S: '♠', H: '♥', D: '♦', C: '♣' }[c.s]}`;

function judge(part, hand, card, pick) {
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
    pending: null, // { pid, card, pick, right, n, stage: 'give'|'drink', to }
    sips: Object.fromEntries(order.map((id) => [id, { drunk: 0, given: 0 }])),
    log: [],
    // pyramid
    rows: [],
    row: -1,
    rowEndsAt: null,
    laid: [], // { pid, card, row, to, n, drank }
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
function drink(b, pid, n, from) {
  const sips = { ...b.sips, [pid]: { ...b.sips[pid], drunk: b.sips[pid].drunk + n } };
  if (from) sips[from] = { ...sips[from], given: sips[from].given + n };
  return { ...b, sips };
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
    if (!right) n = drink(n, id, b.idx + 1);
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
      const right = judge(b.part, hand, card, act.pick);
      const n = b.part;
      let nb = { ...b, deck, hands: { ...b.hands, [pid]: [...hand, card] } };
      nb = addLog(nb, { t: 'guess', pid, part: b.part, pick: act.pick, card: cardTxt(card), right });
      return { ...nb, pending: { pid, card, pick: act.pick, right, n, stage: right ? 'give' : 'drink', to: right ? null : pid } };
    }
    const p = b.pending;
    if (!p) return b;
    if (t === 'give' && p.stage === 'give' && pid === p.pid && b.order.includes(act.to) && act.to !== pid) {
      const nb = addLog({ ...b, pending: { ...p, stage: 'drink', to: act.to } }, { t: 'give', pid, to: act.to, n: p.n });
      return ctx.skipDrink(act.to) ? nextTurn(drink(nb, act.to, 0, null), ctx.now, ctx.rng) : nb;
    }
    if (t === 'keep' && p.stage === 'give' && pid === p.pid) return nextTurn(b, ctx.now, ctx.rng);
    if (t === 'drank' && p.stage === 'drink' && (pid === p.to || isHost)) return nextTurn(drink(b, p.to, p.n, p.right ? p.pid : null), ctx.now, ctx.rng);
    return b;
  }
  if (b.stage === 'pyramid' && t === 'place') {
    const hand = b.hands[pid];
    const i = Number(act.i);
    const card = hand?.[i];
    const rowCards = b.rows[b.row] ?? [];
    if (!card || !rowCards.some((c) => c.r === card.r) || !b.order.includes(act.to) || act.to === pid) return b;
    const n = b.row + 2;
    const nb = { ...b, hands: { ...b.hands, [pid]: hand.filter((_, k) => k !== i) }, laid: [...b.laid, { pid, card: cardTxt(card), row: b.row, to: act.to, n }] };
    return addLog(drink(nb, act.to, n, pid), { t: 'lay', pid, to: act.to, n, card: cardTxt(card) });
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
    pending: b.pending ? { ...b.pending, card: cardTxt(b.pending.card), red: isRed(b.pending.card), label: sipsLabel(b.pending.n) } : null,
    sips: b.sips,
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
  const by = (f, dir = 1) => [...ids].sort((x, y) => dir * (f(y) - f(x)))[0];
  const out = [];
  const thirsty = by((id) => b.sips[id].drunk);
  out.push({ key: 'thirsty', title: 'البحّار العطشان', icon: '🍺', pid: thirsty, value: `${b.sips[thirsty].drunk} شفطة` });
  const gen = by((id) => b.sips[id].given);
  out.push({ key: 'generous', title: 'القبطان الكريم', icon: '🎁', pid: gen, value: `وزّع ${b.sips[gen].given}` });
  if (b.crew.length) out.push({ key: 'seasick', title: 'دوخة البحر', icon: '🤢', pid: b.crew[0], value: `${b.attempts} محاولة` });
  if (b.firstOff) out.push({ key: 'escape', title: 'أول واحد نزل', icon: '🏝️', pid: b.firstOff, value: 'نِفِد' });
  const dryest = by((id) => b.sips[id].drunk, -1);
  out.push({ key: 'dry', title: 'ناشف خالص', icon: '🌵', pid: dryest, value: `${b.sips[dryest].drunk} شفطة بس` });
  return out;
}
