// Game registry. Rules live in the modules; UI lives in client/src/games; text banks in server/content.
import reflex from './reflex.js';
import brain from './brain.js';
import social from './social.js';
import chaos from './chaos.js';

// Same order as the reference game list.
const ORDER = [
  'tap-race', 'tap-frenzy', 'dont-let-go', 'stop-at-ten', 'quick-draw', 'whack-a-mole', 'snap', 'colour-clash', 'quick-math',
  'odd-one-out', 'count-it', 'simon-says', 'close-call', 'true-or-false', 'emoji-riddle', 'most-likely-to', 'would-you-rather',
  'imposter', 'quip-clash', 'doodle-duel', 'big-fat-lie', 'telephone', 'herd-mentality', 'hot-take', 'hot-potato',
  'shell-shock', 'musical-chairs', 'lone-wolf', 'rock-paper-scissors', 'roulette',
];

const all = [...reflex, ...brain, ...social, ...chaos];
export const GAMES = ORDER.map((id) => all.find((g) => g.id === id));
export const getGame = (id) => GAMES.find((g) => g.id === id);
export const CLASSICS = GAMES.filter((g) => !g.isNew).map((g) => g.id);

// How each game pays out, shown on the rules card. Matches the points each module returns.
const PODIUM = 'الأول ٣ · التاني ٢ · الباقي ١ · الأخير صفر';
const FLAT = 'اللي ينفد ياخد نقطة · اللي يخسر صفر';
const DUEL = 'الكسبان ٢ · التعادل ١ · الخسران صفر';
const POINTS_NOTE = {
  'tap-race': PODIUM, 'tap-frenzy': PODIUM, 'dont-let-go': PODIUM, 'stop-at-ten': PODIUM, 'whack-a-mole': PODIUM, snap: PODIUM,
  'colour-clash': PODIUM, 'quick-math': PODIUM, 'odd-one-out': PODIUM, 'count-it': PODIUM, 'simon-says': PODIUM, 'close-call': PODIUM,
  'true-or-false': PODIUM, 'emoji-riddle': PODIUM, 'hot-take': PODIUM,
  'most-likely-to': FLAT + ' · الأكتر أصوات لوحده −١', 'would-you-rather': FLAT, 'herd-mentality': FLAT, 'telephone': FLAT,
  'hot-potato': FLAT + ' · صاحب القنبلة −١',
  'quip-clash': DUEL + ' · ولا صوت −١', 'doodle-duel': DUEL + ' · ورقة فاضية −١', 'rock-paper-scissors': DUEL,
  'quick-draw': 'كسبان المبارزة ٢ · رهان صح ١ · الأبطأ −١',
  imposter: 'الدخيل اتمسك: صوت صح ٢ · الباقي ١ · الدخيل −١ | هرب: الدخيل ٣',
  'big-fat-lie': 'لقيت الحقيقة ٢ · +١ عن كل واحد صدّق فشرك',
  'shell-shock': 'لقيت الجنيه ٢ · النصّاب +١ عن كل واحد اتضحك عليه · ولا واحد = −١',
  'musical-chairs': 'فضلت قاعد ٢ · طلعت صفر',
  'lone-wolf': 'أكبر ديب وحداني ٣ · ديب وحداني ١ · تخبيط صفر',
  roulette: 'كارت واحد للي العجلة تقف عليه: +٣ أو +٢ أو −٢ أو −٣',
};

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
  rule: g.rule,
  pointsNote: POINTS_NOTE[g.id],
}));
