// Shared helpers for the game engine (server side only).
import { randomInt } from 'node:crypto';

export const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

export function shuffle(r, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pickOne = (r, arr) => arr[Math.floor(r() * arr.length)];

// Pick from a content bank without repeating inside the session.
// `seen` is a Set kept by the room; when a bank is exhausted we recycle it.
export function pickFresh(ctx, bank) {
  const seen = ctx.seen;
  let pool = seen ? bank.filter((x) => !seen.has(x.id)) : [...bank];
  if (!pool.length) {
    for (const x of bank) seen?.delete(x.id);
    pool = [...bank];
  }
  const item = pool[Math.floor(ctx.rng() * pool.length)];
  seen?.add(item.id);
  return item;
}

export function pickFreshMany(ctx, bank, n) {
  const out = [];
  const want = Math.min(n, bank.length);
  let guard = 0;
  while (out.length < want && guard++ < 500) {
    const x = pickFresh(ctx, bank);
    if (!out.includes(x)) out.push(x);
  }
  return out;
}

// Intensity: every item is tagged with the lowest mode it may appear in.
const MODE_RANK = { lite: 0, medium: 1, hardcore: 2 };
export const forMode = (bank, mode) => bank.filter((x) => MODE_RANK[x.min ?? 'lite'] <= MODE_RANK[mode]);

export const nameOf = (players, id) => players.find((p) => p.id === id)?.name ?? '؟';
export const namesOf = (players, ids) => ids.map((id) => nameOf(players, id)).join('، ');

// Clean a free-text answer: collapse whitespace, cap length.
export function cleanText(s, max = 60) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ---------- Arabic-aware fuzzy matching (Herd Mentality, Big Fat Lie, Telephone) ----------
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
const NUM_WORDS = {
  صفر: '0', واحد: '1', واحده: '1', اتنين: '2', اثنين: '2', تلاته: '3', ثلاثه: '3', اربعه: '4', خمسه: '5',
  سته: '6', سبعه: '7', تمنيه: '8', ثمانيه: '8', تسعه: '9', عشره: '10', zero: '0', one: '1', two: '2', three: '3',
  four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};
const STOP = new Set(['ال', 'و', 'في', 'من', 'على', 'عن', 'يا', 'the', 'a', 'an', 'of', 'and']);

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => AR_DIGITS[d])
    .replace(/[ً-ٰٟـ]/g, '') // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ء-ي ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  const t = normalize(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
    .map((w) => (w.length > 3 && /^[وب]ال/.test(w) ? w.slice(3) : w))
    .map((w) => NUM_WORDS[w] ?? w);
  const kept = t.filter((w) => !STOP.has(w));
  return kept.length ? kept : t;
}

function lev(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

function wordsMatch(a, b) {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  // Arabic plural/suffix tolerance: ات / ين / ه / ها
  const strip = (w) => w.replace(/(ات|ين|ون|ها|ه)$/, '');
  if (strip(a).length >= 3 && strip(a) === strip(b)) return true;
  const n = Math.min(a.length, b.length);
  const tol = n >= 9 ? 2 : n >= 5 ? 1 : 0;
  return tol > 0 && lev(a, b) <= tol;
}

// "Same answer?" — tolerant of spelling, articles, ه/ة, أ/ا, number words.
export function sameAnswer(x, y) {
  const a = normalize(x);
  const b = normalize(y);
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = tokens(x);
  const tb = tokens(y);
  if (!ta.length || !tb.length) return false;
  const nums = (t) => t.filter((w) => /\d/.test(w)).join(' ');
  if (nums(ta) !== nums(tb)) return false;
  if (ta.length === tb.length && ta.every((w, i) => wordsMatch(w, tb[i]))) return true;
  if (wordsMatch(ta.join(''), tb.join(''))) return true;
  const [s, l] = ta.length < tb.length ? [ta, tb] : [tb, ta];
  return l.length - s.length === 1 && s.join('').length >= 4 && s.every((w) => l.some((v) => wordsMatch(w, v)));
}

// Group free answers into clusters of "the same" answer, biggest first.
export function clusterAnswers(answers) {
  const groups = [];
  for (const [id, text] of Object.entries(answers)) {
    if (!normalize(text)) continue;
    const g = groups.find((x) => sameAnswer(x.label, text));
    if (g) g.ids.push(id);
    else groups.push({ label: text, ids: [id] });
  }
  return groups.sort((a, b) => b.ids.length - a.ids.length);
}

export const toArabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
export const fmtNum = (n) => Number(n).toLocaleString('en-US');
