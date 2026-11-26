import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar, HEX, useNow } from '../ui/kit.jsx';
import { Done, GameTimer, NumberPad, Prompt, Sent, roster, send } from './common.jsx';
import { sfx, haptic } from '../sound.js';

const INKS = [
  { hex: '#FF1744', name: 'أحمر' },
  { hex: '#2979FF', name: 'أزرق' },
  { hex: '#00E676', name: 'أخضر' },
  { hex: '#FFD600', name: 'أصفر' },
  { hex: '#D500F9', name: 'بنفسجي' },
];

// ---------------------------------------------------------------- shared "race" UI
export function RacePhone({ snap, v, render }) {
  const [shake, setShake] = useState(0);
  const me = v.me;
  const answer = (choice) => {
    if (!me || me.doneAt !== null) return;
    send('answer', { i: me.i, choice });
  };
  // detect mistakes from the server's count
  const prevMistakes = useRef(me?.mistakes ?? 0);
  useEffect(() => {
    if ((me?.mistakes ?? 0) > prevMistakes.current) {
      setShake((s) => s + 1);
      sfx.buzz();
      haptic.heavy();
    }
    prevMistakes.current = me?.mistakes ?? 0;
  }, [me?.mistakes]);
  const prevI = useRef(me?.i ?? 0);
  useEffect(() => {
    if ((me?.i ?? 0) > prevI.current) sfx.pop();
    prevI.current = me?.i ?? 0;
  }, [me?.i]);
  if (!me) return null;
  if (me.doneAt !== null)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Sent>خلّصت ✓</Sent>
        <Done ids={Object.entries(v.progress).filter(([, p]) => p.done).map(([id]) => id)} snap={snap} label="خلّصوا" />
      </div>
    );
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between font-display font-black">
        <span>
          {me.i + 1}/{v.total}
        </span>
        {me.mistakes > 0 && <span className="text-red">+{me.mistakes * 3}ث</span>}
      </div>
      <div key={shake} className={shake ? 'shake' : ''}>
        {v.q && render(v.q, answer)}
      </div>
    </div>
  );
}

export function RaceBig({ snap, v, title, color }) {
  const ps = roster(snap);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <Prompt big color={color}>{title}</Prompt>
      <GameTimer snap={snap} />
      <div className="flex flex-col gap-2">
        {ps.map((p) => {
          const g = v.progress[p.id] ?? { i: 0, done: false, mistakes: 0 };
          return (
            <div key={p.id} className="flex items-center gap-3">
              <Avatar p={p} size={44} />
              <div className="relative h-10 flex-1 overflow-hidden rounded-xl border-[3px] border-black bg-black/40">
                <motion.div animate={{ width: `${(g.i / v.total) * 100}%` }} className="h-full" style={{ background: g.done ? HEX.lime : HEX[p.color] }} />
              </div>
              <span className="w-24 font-display font-black">
                {g.done ? '✓' : `${g.i}/${v.total}`} {g.mistakes > 0 && <span className="text-red text-sm">+{g.mistakes * 3}ث</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const Options = ({ options, onPick, cols = 2, renderOpt }) => (
  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
    {options.map((o, i) => (
      <button key={i} type="button" onClick={() => onPick(i)} className="press brutal min-h-20 rounded-2xl bg-white p-3 font-display font-black text-2xl text-black">
        {renderOpt ? renderOpt(o, i) : o}
      </button>
    ))}
  </div>
);

const colourClash = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => (
        <div className="flex flex-col gap-5">
          <div className="text-center text-ink-muted">دوس على لون «الحبر»</div>
          <div className="rounded-[30px] border-4 border-black bg-white py-8 text-center font-display font-black text-7xl" style={{ color: INKS[q.prompt[1]].hex }}>
            {INKS[q.prompt[0]].name}
          </div>
          <Options options={q.options} onPick={pick} renderOpt={(o) => <span className="flex items-center justify-center gap-2"><span className="h-8 w-8 rounded-full border-[3px] border-black" style={{ background: INKS[o].hex }} />{INKS[o].name}</span>} />
        </div>
      )}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="violet" title="دوس على لون الحبر، مش الكلمة 🎨" />,
};

const quickMath = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => (
        <div className="flex flex-col gap-5">
          <div className="ltr rounded-[30px] border-4 border-black bg-white py-8 text-center font-display font-black text-6xl text-black">{q.prompt} = ؟</div>
          <Options options={q.options} onPick={pick} renderOpt={(o) => <span className="ltr">{o}</span>} />
        </div>
      )}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="blue" title="خمس مسائل بسرعة 🧮" />,
};

const oddOneOut = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => {
        const n = q.prompt;
        return (
          <div className="flex flex-col gap-3">
            <div className="text-center text-ink-muted">لاقي الغريب</div>
            <div className="ltr grid gap-1 rounded-2xl border-4 border-black bg-white p-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
              {q.options.map((symbol, i) => (
                <button key={i} type="button" onClick={() => pick(i)} className="flex aspect-square min-w-0 items-center justify-center rounded-lg font-mono text-black active:bg-black/10" style={{ fontSize: `clamp(18px, ${29 / n}vw, ${Math.floor(220 / n)}px)`, lineHeight: 1 }}>
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        );
      }}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="yellow" title="مين الغريب؟ 🔍" />,
};

const trueOrFalse = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => (
        <div className="flex flex-col gap-5">
          <div className="rounded-[30px] border-4 border-black bg-white p-6 text-center font-display font-black text-3xl leading-snug text-black">{q.prompt}</div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onPointerDown={() => pick(0)} className="press brutal rounded-3xl bg-lime py-8 font-display font-black text-5xl text-black">✓ صح</button>
            <button type="button" onPointerDown={() => pick(1)} className="press brutal rounded-3xl bg-red py-8 font-display font-black text-5xl text-white">✕ غلط</button>
          </div>
        </div>
      )}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="mint" title="صح ولا غلط؟ ✅" />,
};

const emojiRiddle = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => (
        <div className="flex flex-col gap-5">
          <div className="rounded-[30px] border-4 border-black bg-white px-3 py-5 text-center text-black">
            <div className="font-display font-black">{q.prompt.category}</div>
            <div dir="ltr" className="mt-2 text-4xl sm:text-6xl">{q.prompt.emoji}</div>
          </div>
          <Options options={q.options} onPick={pick} cols={2} />
        </div>
      )}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="pink" title="فزورة إيموجي 🧩" />,
};

// ---------------------------------------------------------------- Count It
function Crowd({ v }) {
  return (
    <div className="relative mx-auto aspect-[3/2] w-full max-w-[min(100%,calc((100dvh-230px)*1.5))] overflow-hidden rounded-[30px] border-4 border-black bg-white">
      {v.items.map((it, i) => (
        <span key={i} className="absolute" style={{ left: `${it.x}%`, top: `${it.y}%`, transform: `translate(-50%,-50%) rotate(${it.r}deg) scale(${it.s})`, fontSize: 'clamp(18px, 4.2vw, 46px)' }}>
          {it.e}
        </span>
      ))}
    </div>
  );
}
function CountPhase(v, t) {
  if (!v.showFrom || t < v.showFrom) return 'wait';
  if (t < v.showUntil) return 'show';
  return 'guess';
}
const countIt = {
  Phone: ({ snap, v }) => {
    const t = useNow(60);
    const ph = CountPhase(v, t);
    return (
      <div className="flex flex-1 flex-col gap-4">
        <Prompt color="cyan">
          عِد كام <span className="text-5xl">{v.target}</span>
        </Prompt>
        {ph === 'wait' && <div className="text-center font-display font-black text-3xl">عينك على الشاشة!</div>}
        {ph === 'show' && <Crowd v={v} />}
        {ph === 'guess' && (v.myGuess !== null ? <Sent>قلت {v.myGuess}</Sent> : <><div className="text-center font-display font-black text-2xl">كام {v.target}؟</div><NumberPad max={3} onSend={(n) => send('guess', n)} /></>)}
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const t = useNow(60);
    const ph = CountPhase(v, t);
    return (
      <div className="flex flex-1 flex-col items-center gap-5">
        <Prompt big color="cyan">
          عِد كام {v.target}
        </Prompt>
        {ph === 'show' ? <Crowd v={v} /> : ph === 'wait' ? <div className="font-display font-black text-6xl">جاهزين…</div> : <Done ids={v.guessed} snap={snap} big />}
      </div>
    );
  },
};

// ---------------------------------------------------------------- Simon Says
const PADS = ['#FF1744', '#2979FF', '#00E676', '#FFD600'];
const NOTES = [330, 392, 494, 587];
const simonSays = {
  Phone: ({ snap, v }) => {
    const me = v.me;
    const len = v.start + (me?.cleared ?? 0);
    const [phase, setPhase] = useState('watch');
    const [lit, setLit] = useState(-1);
    const [input, setInput] = useState([]);
    useEffect(() => {
      if (!me || me.out) return;
      setPhase('watch');
      setInput([]);
      let i = 0;
      let off;
      const id = setInterval(() => {
        if (i >= len) {
          clearInterval(id);
          setLit(-1);
          setPhase('repeat');
          return;
        }
        setLit(v.seq[i]);
        sfx.tick();
        off = setTimeout(() => setLit(-1), 380);
        i++;
      }, 600);
      return () => {
        clearInterval(id);
        clearTimeout(off);
      };
    }, [len, me?.out]);
    if (!me) return null;
    if (me.out) return <div className="flex flex-1 flex-col items-center justify-center gap-4"><Sent>{me.cleared ? `افتكرت ${v.start + me.cleared - 1} ألوان ورا بعض 🧠` : 'غلط! خرجت 🐟'}</Sent></div>;
    const press = (k) => {
      if (phase !== 'repeat') return;
      const next = [...input, k];
      setLit(k);
      setTimeout(() => setLit(-1), 150);
      haptic.light();
      const wrong = v.seq[next.length - 1] !== k;
      if (wrong || next.length === len) {
        setPhase('wait');
        send('simon', { len, seq: next });
        wrong ? sfx.buzz() : sfx.win();
      } else setInput(next);
    };
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="text-center font-display font-black text-3xl">{phase === 'watch' ? 'بص…' : phase === 'repeat' ? 'كرّرها!' : 'حلو! كمان واحدة…'}</div>
        <div className="text-center text-ink-muted">{len} ألوان</div>
        <div className="grid grid-cols-2 gap-3">
          {PADS.map((c, k) => (
            <button key={k} type="button" onPointerDown={() => press(k)} className="aspect-square rounded-[30px] border-4 border-black shadow-hard transition-all" style={{ background: c, opacity: lit === k ? 1 : 0.45, transform: lit === k ? 'scale(1.04)' : 'none' }} />
          ))}
        </div>
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const ps = roster(snap);
    return (
      <div className="flex flex-1 flex-col gap-6">
        <Prompt big color="cyan">بص. افتكر. كرّر 🧠</Prompt>
        <div className="grid grid-cols-3 gap-3">
          {ps.map((p) => {
            const s = v.players[p.id];
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border-[3px] border-black bg-white p-2 text-black">
                <Avatar p={p} size={44} dim={s?.out} />
                <span className="flex-1 font-display font-black">{p.name}</span>
                <span className="font-display font-black text-2xl">{s?.out ? '🐟' : ''} {v.start + (s?.cleared ?? 0) - 1}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------- Close Call
const closeCall = {
  Phone: ({ snap, v }) => (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt>{v.q}</Prompt>
      <GameTimer snap={snap} />
      {v.mine !== null ? <Sent>قلت {v.mine.toLocaleString('en-US')} {v.unit}</Sent> : <NumberPad onSend={(n) => send('guess', n)} />}
    </div>
  ),
  Big: ({ snap, v }) => (
    <div className="flex flex-1 flex-col items-center gap-6">
      <Prompt big color="yellow">{v.q}</Prompt>
      <GameTimer snap={snap} />
      <Done ids={v.guessed} snap={snap} big />
    </div>
  ),
};

export default {
  'colour-clash': colourClash,
  'quick-math': quickMath,
  'odd-one-out': oddOneOut,
  'true-or-false': trueOrFalse,
  'emoji-riddle': emojiRiddle,
  'count-it': countIt,
  'simon-says': simonSays,
  'close-call': closeCall,
};
