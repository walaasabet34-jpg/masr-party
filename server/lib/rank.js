// Ranking + "who drinks" logic shared by every scored mini-game.
// A score row: { id, status: 'ok'|'foul'|'out', primary, tiebreak?, group?, forceDrink?, facts? }
// opts: { better: 'higher'|'lower', allTied: 'everyone'|'nobody', deadHeat?: 'primary' }

const STATUS = { ok: 0, foul: 1, out: 2 };

function cmp(a, b, better) {
  const s = STATUS[a.status] - STATUS[b.status];
  if (s || a.status !== 'ok') return s;
  const p = better === 'higher' ? b.primary - a.primary : a.primary - b.primary;
  if (p) return p;
  const ta = a.tiebreak ?? Infinity;
  const tb = b.tiebreak ?? Infinity;
  return ta === tb ? 0 : ta < tb ? -1 : 1;
}

function groupsOf(rows) {
  if (!rows.some((r) => r.group !== undefined)) return [rows];
  const m = new Map();
  for (const r of rows) {
    const k = r.group ?? Number.MAX_SAFE_INTEGER;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

export function rank(rows, opts) {
  const ranked = [];
  const winners = [];
  const losers = [];
  for (const g of groupsOf(rows)) {
    const sorted = g.map((r, i) => ({ r, i })).sort((x, y) => cmp(x.r, y.r, opts.better) || x.i - y.i).map((x) => x.r);
    const placed = [];
    sorted.forEach((r, i) => {
      if (r.status !== 'ok') return placed.push({ ...r });
      const prev = placed[i - 1];
      const place = prev?.place !== undefined && cmp(prev, r, opts.better) === 0 ? prev.place : i + 1;
      placed.push({ ...r, place });
    });
    ranked.push(...placed);

    const ok = placed.filter((r) => r.place !== undefined);
    const bad = placed.filter((r) => r.place === undefined);
    losers.push(...bad.map((r) => r.id));
    if (!ok.length) continue;
    const top = Math.min(...ok.map((r) => r.place));
    const bottom = Math.max(...ok.map((r) => r.place));
    const deadHeat = opts.deadHeat === 'primary' && ok.every((r) => r.primary === ok[0].primary);
    if (ok.length > 1 && (top === bottom || deadHeat)) {
      if (opts.allTied === 'everyone' && !bad.length) losers.push(...ok.map((r) => r.id));
      continue;
    }
    if (ok.length < 2 && !bad.length) continue;
    const last = placed.some((r) => r.status === 'out') || ok.length < 2 ? [] : ok.filter((r) => r.place === bottom).map((r) => r.id);
    losers.push(...last);
    winners.push(...ok.filter((r) => r.place === top && !last.includes(r.id)).map((r) => r.id));
  }
  const forced = rows.filter((r) => r.forceDrink && !losers.includes(r.id)).map((r) => r.id);
  return {
    rows: ranked,
    winners: winners.filter((id) => !rows.some((r) => r.id === id && r.forceDrink)),
    losers: [...losers, ...forced],
  };
}

// Points for the no-drinks scoreboard (also shown in every results table).
export const POINTS = {
  podium: [
    [3, 'المركز الأول'],
    [2, 'التاني'],
    [1, 'نِفِد'],
    [0, 'الأخير'],
  ],
  duel: [
    [2, 'كسب'],
    [1, 'تعادل'],
    [0, 'خسر'],
  ],
  flat: [
    [1, 'نِفِد'],
    [0, 'خسر'],
  ],
};

export function pointsFrom(rows, winners, losers, kind = 'podium') {
  const out = {};
  for (const r of rows) {
    if (losers.includes(r.id)) out[r.id] = 0;
    else if (kind === 'podium') out[r.id] = winners.includes(r.id) ? 3 : r.place === 2 ? 2 : 1;
    else if (kind === 'duel') out[r.id] = winners.includes(r.id) ? 2 : 1;
    else out[r.id] = 1;
  }
  return out;
}
