// Game registry. Rules live in the modules; UI lives in client/src/games; text banks in server/content.
import reflex from './reflex.js';
import brain from './brain.js';
import social from './social.js';
import chaos from './chaos.js';

// Same order as the reference game list.
const ORDER = [
  'tap-race', 'tap-frenzy', 'dont-let-go', 'stop-at-ten', 'quick-draw', 'whack-a-mole', 'snap', 'colour-clash', 'quick-math',
  'odd-one-out', 'count-it', 'simon-says', 'close-call', 'true-or-false', 'emoji-riddle', 'most-likely-to', 'would-you-rather',
  'imposter', 'quip-clash', 'doodle-duel', 'big-fat-lie', 'broken-telephone', 'herd-mentality', 'hot-take', 'hot-potato',
  'shell-shock', 'musical-chairs', 'lone-wolf', 'rock-paper-scissors', 'roulette',
];

const all = [...reflex, ...brain, ...social, ...chaos];
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
  rule: g.rule + (g.id === 'roulette' ? '' : ' النقط: مكافأة حسب النتيجة، والخاسر بيتخصم منه نقطة. التعادل بيتحسم حسب قاعدة اللعبة. الرصيد ممكن يبقى بالسالب.'),
}));
