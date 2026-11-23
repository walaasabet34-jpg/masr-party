// Artwork for the game picker and the Basra table.
import { HEX } from './kit.jsx';
import { rankOf, cardName } from '../../../shared/cards.js';
import basraDeck from '../assets/basra-deck.webp';

const ICONS = ['📏', '✅', '🧩', '👉', '⚖️', '🕵️', '🎤', '🖍️', '🤥', '🎨', '🐄', '🌶️', '💣', '🎩', '🪑', '🐺', '⚡', '👆', '✋', '⏱️', '🤠', '🔨', '🃏', '🧠', '🧮', '🔍', '🔢', '✊', '💀'];

export function PartyArt({ height = 250 }) {
  const ring = (n, r, from, cls) => (
    <div className={`absolute inset-0 ${cls}`}>
      {ICONS.slice(from, from + n).map((e, i) => {
        const a = (i / n) * Math.PI * 2;
        return (
          <span
            key={e + i}
            className="absolute flex h-9 w-9 items-center justify-center rounded-xl border-[3px] border-black bg-white text-lg shadow-hard-sm"
            style={{ left: `calc(50% + ${Math.cos(a) * r}px - 18px)`, top: `calc(50% + ${Math.sin(a) * r}px - 18px)`, transform: `rotate(${(i % 3) * 6 - 6}deg)` }}
          >
            {e}
          </span>
        );
      })}
    </div>
  );
  return (
    <div className="stripes relative overflow-hidden" style={{ height, background: `linear-gradient(135deg, ${HEX.magenta}, ${HEX.violet})` }}>
      <div className="absolute inset-0">
        {ring(18, 112, 0, 'orbit')}
        {ring(11, 66, 18, 'orbit-rev')}
        <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-black bg-yellow text-4xl shadow-hard">🎉</div>
      </div>
    </div>
  );
}

export function BoatArt({ height = 250 }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,#22654f,#0c2c22_75%)]"
      style={{ height }}
    >
      <div aria-hidden="true" className="absolute inset-4 rounded-[34px] border border-white/15" />
      <div className="relative -mt-3 flex items-center justify-center [direction:ltr]">
        {['7♦', 'J♠', 'Q♥', 'K♣'].map((card, i) => (
          <div
            key={card}
            style={{ marginInlineStart: i ? -16 : 0, transform: `rotate(${(i - 1.5) * 11}deg) translateY(${Math.abs(i - 1.5) * 8}px)` }}
          >
            <Card txt={card} w="clamp(62px, 12vw, 88px)" />
          </div>
        ))}
      </div>
    </div>
  );
}

// The CC0 deck is packed left to right in rank order, 13 cards per suit, then the back.
// https://github.com/AustinGabriel/Public-Domain-and-CC0-Playing-Cards
const SUIT_ORDER = '♠♥♦♣';
const DECK_COLUMNS = 9;
const DECK_ROWS = 6;

export function Card({ txt, w = 56, faceDown, glow, onClick }) {
  const hidden = faceDown || !txt;
  const index = hidden ? 52 : SUIT_ORDER.indexOf(txt.slice(-1)) * 13 + rankOf(txt) - 1;
  const column = index % DECK_COLUMNS;
  const row = Math.floor(index / DECK_COLUMNS);
  const position = {
    width: w,
    backgroundImage: `url(${basraDeck})`,
    backgroundSize: `${DECK_COLUMNS * 100}% ${DECK_ROWS * 100}%`,
    backgroundPosition: `${column * 100 / (DECK_COLUMNS - 1)}% ${row * 100 / (DECK_ROWS - 1)}%`,
  };
  const className = `relative block aspect-[5/7] shrink-0 rounded-[9%] bg-white bg-no-repeat shadow-[0_3px_10px_#0008] ${glow ? '-translate-y-1 ring-[3px] ring-lime' : ''}`;

  if (hidden) return <span aria-hidden="true" className={className} style={position} />;

  return (
    <button
      type="button"
      aria-label={cardName(txt)}
      aria-pressed={onClick ? Boolean(glow) : undefined}
      title={cardName(txt)}
      onClick={onClick}
      disabled={!onClick}
      className={`${className} transition-transform duration-150 enabled:cursor-pointer enabled:hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white motion-reduce:transition-none`}
      style={position}
    />
  );
}
