// What a loser drinks, per intensity mode and tier.
// Mode labels (lose a round / roulette) come straight from the reference game's vibe screen.
// The exact amounts inside each range are decided server-side there and could not be observed,
// so the split below is an inference that stays inside the published ranges.

export const MODES = {
  lite: { lose: '١–٣ شفطات', roulette: '٥ شفطات' },
  medium: { lose: '١–٣ شفطات أو شوت', roulette: '٢ شوت' },
  hardcore: { lose: 'شفطات أو شوتات', roulette: 'الكاس كله' },
};

export function sipsLabel(n) {
  if (n === 1) return 'شفطة';
  if (n === 2) return 'شفطتين';
  if (n >= 3 && n <= 10) return `${n} شفطات`;
  return `${n} شفطة`;
}
const shotsLabel = (n) => (n === 1 ? 'شوت' : n === 2 ? 'شوتين' : `${n} شوت`);

export function penaltyFor(mode, tier, rng) {
  const sip = (n) => ({ kind: 'sip', count: n, label: sipsLabel(n) });
  const shot = (n) => ({ kind: 'shot', count: n, label: shotsLabel(n) });
  if (mode === 'lite') {
    if (tier === 'big') return sip(5);
    if (tier === 'medium') return sip(3);
    return sip(1 + Math.floor(rng() * 2));
  }
  if (mode === 'medium') {
    if (tier === 'big') return shot(2);
    if (tier === 'medium') return shot(1);
    return sip(1 + Math.floor(rng() * 3));
  }
  if (tier === 'big') return { kind: 'glass', count: 1, label: 'الكاس كله' };
  if (tier === 'medium') return shot(1);
  return sip(2 + Math.floor(rng() * 2));
}
