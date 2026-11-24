// Game registry. Rules live in the modules; UI lives in client/src/games; text banks in server/content.
import reflex from './reflex.js';
import brain from './brain.js';
import social from './social.js';
import chaos from './chaos.js';
import fresh from './fresh.js';

// Same order as the reference game list. Six games were replaced in Nov 2026 after player
// feedback (would-you-rather, odd-one-out, big-fat-lie, herd-mentality, shell-shock, lone-wolf):
// their code stays in the modules but they are no longer offered.
const ORDER = [
  'tap-race', 'tap-frenzy', 'dont-let-go', 'stop-at-ten', 'quick-draw', 'whack-a-mole', 'snap', 'colour-clash', 'quick-math',
  'finish-proverb', 'count-it', 'simon-says', 'close-call', 'true-or-false', 'emoji-riddle', 'most-likely-to', 'who-said-it',
  'imposter', 'quip-clash', 'doodle-duel', 'order-up', 'broken-telephone', 'zoom-in', 'hot-take', 'hot-potato',
  'penalty-kicks', 'musical-chairs', 'number-rush', 'rock-paper-scissors', 'roulette',
];

const all = [...reflex, ...brain, ...social, ...chaos, ...fresh];
export const GAMES = ORDER.map((id) => all.find((g) => g.id === id));
export const getGame = (id) => GAMES.find((g) => g.id === id);
export const CLASSICS = GAMES.filter((g) => !g.isNew).map((g) => g.id);

// Public metadata sent to every client (no answers, no content).
export const META = GAMES.map((g) => ({
  id: g.id,
  name: g.name,
  icon: g.icon,
  color: g.color,
  kind: g.kind,
  minPlayers: g.minPlayers,
  durationMs: g.durationMs,
  isNew: !!g.isNew,
  tagline: g.tagline,
  howTo: g.howTo,
  rule: g.rule + (g.id === 'roulette' ? '' : ' النقط: مكافأة حسب النتيجة، والخسارة العادية صفر. الخصم (−١) بس في الحالة المكتوبة في القاعدة. الرصيد ممكن يبقى بالسالب.'),
}));
