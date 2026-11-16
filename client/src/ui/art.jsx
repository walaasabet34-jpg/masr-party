// Hand-drawn replacements for the reference game's card artwork.
import { HEX } from './kit.jsx';
import { cardName } from '../../../shared/cards.js';

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
  return <div className="relative flex items-center justify-center overflow-hidden bg-emerald-800" style={{height}}>
    <div className="absolute inset-4 rounded-[40px] border-4 border-emerald-600" />
    <div className="flex items-center gap-3" style={{transform:'rotate(-8deg)'}}>
      {['7♦','J♠','A♥','K♣'].map((c,i)=><div key={c} style={{transform:`rotate(${i*8-12}deg) translateY(${i%2*12}px)`}}><Card txt={c} w={64}/></div>)}
    </div>
    <span className="absolute bottom-4 rounded-full bg-yellow px-4 py-1 font-display font-black text-black">كوتشينة مصري 🃏</span>
  </div>;
}

// A playing card face.
export function Card({ txt, w = 56, faceDown, glow, onClick, dim }) {
  const h = Math.round(w * 1.4);
  if (faceDown || !txt)
    return (
      <div className="stripes relative shrink-0 rounded-xl border-[3px] border-black shadow-hard-sm" style={{ width: w, height: h, background: HEX.violet }}>
        <span className="absolute inset-0 flex items-center justify-center text-white/80" style={{ fontSize: w * 0.4 }}>
          🃏
        </span>
      </div>
    );
  const red = /[♥♦]/.test(txt);
  const rawRank = txt.slice(0, -1);
  const rank = ({ A: 'آس', J: 'ولد', Q: 'بنت', K: 'شايب' }[rawRank] ?? rawRank.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]));
  const suit = txt.slice(-1);
  return (
    <button
      type="button"
      aria-label={cardName(txt)}
      title={cardName(txt)}
      onClick={onClick}
      disabled={!onClick}
      className={`ltr relative shrink-0 rounded-xl border-[3px] border-black bg-white font-display font-black shadow-hard-sm ${dim ? 'opacity-40' : ''}`}
      style={{ width: w, height: h, color: red ? HEX.red : '#000', boxShadow: glow ? `0 0 0 4px ${HEX.lime}, var(--shadow-hard-sm)` : undefined }}
    >
      <span className="absolute left-1 top-0.5 leading-none" style={{ fontSize: w * (rawRank === 'K' ? 0.2 : 0.25) }}>
        {rank}
      </span>
      <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: w * 0.5 }}>
        {suit}
      </span>
    </button>
  );
}
