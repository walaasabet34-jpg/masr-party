// Hand-drawn replacements for the reference game's card artwork.
import { HEX } from './kit.jsx';

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
    <div className="relative overflow-hidden" style={{ height, background: 'linear-gradient(#1a237e, #3949ab 70%)' }}>
      {[...Array(14)].map((_, i) => (
        <span key={i} className="absolute text-white/80" style={{ left: `${(i * 37) % 100}%`, top: `${(i * 23) % 55}%`, fontSize: 8 + (i % 3) * 4 }}>
          ✦
        </span>
      ))}
      <span className="absolute left-[12%] top-[10%] text-5xl">🌙</span>
      <span className="float absolute right-[14%] top-[22%] text-4xl">☁️</span>
      <svg viewBox="0 0 400 260" className="bob absolute inset-x-0 bottom-6 mx-auto w-[86%]">
        <g className="sail" style={{ transformBox: 'fill-box' }}>
          <path d="M200 30 L200 170 L120 170 Z" fill="#fff" stroke="#000" strokeWidth="5" strokeLinejoin="round" />
          <path d="M206 40 L206 170 L285 170 Z" fill="#fff" stroke="#000" strokeWidth="5" strokeLinejoin="round" />
          <path d="M150 120 L200 120 L200 140 L142 140 Z" fill={HEX.magenta} />
          <path d="M206 120 L255 120 L262 140 L206 140 Z" fill={HEX.cyan} />
          <path d="M203 20 L203 40 L235 30 Z" fill={HEX.yellow} stroke="#000" strokeWidth="4" />
        </g>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(${118 + i * 34} ${150}) rotate(${i * 3 - 6})`}>
            <rect width="30" height="40" rx="5" fill="#fff" stroke="#000" strokeWidth="4" />
            <text x="15" y="27" textAnchor="middle" fontSize="16" fontWeight="900" fill={i % 2 ? '#000' : HEX.red}>
              {['A', '7', 'Q', '3', '10'][i]}
            </text>
          </g>
        ))}
        <path d="M80 180 L320 180 L290 235 L110 235 Z" fill="#f4a261" stroke="#000" strokeWidth="6" strokeLinejoin="round" />
        <path d="M95 200 L305 200" stroke="#000" strokeWidth="4" />
        <circle cx="270" cy="212" r="12" fill="#fff" stroke={HEX.red} strokeWidth="7" />
      </svg>
      <svg viewBox="0 0 800 60" preserveAspectRatio="none" className="wave absolute bottom-0 left-[-100%] h-12 w-[200%]">
        <path d="M0 30 Q50 0 100 30 T200 30 T300 30 T400 30 T500 30 T600 30 T700 30 T800 30 V60 H0 Z" fill="#00b4d8" stroke="#000" strokeWidth="4" />
      </svg>
    </div>
  );
}

// A playing card face.
export function Card({ txt, w = 56, faceDown, glow, onClick, dim }) {
  const h = Math.round(w * 1.4);
  if (faceDown || !txt)
    return (
      <div className="stripes relative shrink-0 rounded-xl border-[3px] border-black shadow-hard-sm" style={{ width: w, height: h, background: HEX.violet }}>
        <span className="absolute inset-0 flex items-center justify-center text-white/80" style={{ fontSize: w * 0.4 }}>
          ⛵
        </span>
      </div>
    );
  const red = /[♥♦]/.test(txt);
  const rank = txt.slice(0, -1);
  const suit = txt.slice(-1);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`ltr relative shrink-0 rounded-xl border-[3px] border-black bg-white font-display font-black shadow-hard-sm ${dim ? 'opacity-40' : ''}`}
      style={{ width: w, height: h, color: red ? HEX.red : '#000', boxShadow: glow ? `0 0 0 4px ${HEX.lime}, var(--shadow-hard-sm)` : undefined }}
    >
      <span className="absolute left-1 top-0.5 leading-none" style={{ fontSize: w * 0.3 }}>
        {rank}
      </span>
      <span className="absolute inset-0 flex items-center justify-center" style={{ fontSize: w * 0.5 }}>
        {suit}
      </span>
    </button>
  );
}
