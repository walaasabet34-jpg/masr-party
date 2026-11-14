import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar, Btn, HEX, playerMap, useNow } from '../ui/kit.jsx';
import { now } from '../net.js';
import { Done, GameTimer, PlayerGrid, Prompt, Sent, Waiting, roster, send } from './common.jsx';
import { sfx, haptic } from '../sound.js';

// ---------------------------------------------------------------- Roulette wheel
function Wheel({ snap, v, size = 320 }) {
  const P = playerMap(snap);
  const n = v.wedges.length;
  const target = v.wedges.indexOf(v.targetId);
  const seg = 360 / n;
  const finalRot = v.turns * 360 + (360 - (target * seg + seg / 2));
  const [rot, setRot] = useState(0);
  const [done, setDone] = useState(false);
  // every screen derives the angle from the server's start time, so they all show the same wedge
  useEffect(() => {
    let raf;
    let lastSeg = -1;
    const SPIN = 6000;
    const loop = () => {
      const f = v.startAt ? Math.min(1, Math.max(0, (now() - v.startAt) / SPIN)) : 0;
      const r = finalRot * (1 - (1 - f) ** 3);
      setRot(r);
      const sgm = Math.floor(r / seg);
      if (sgm !== lastSeg && f < 1) {
        lastSeg = sgm;
        sfx.tick();
      }
      if (f >= 1) {
        setDone(true);
        sfx.boom();
        haptic.heavy();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [v.startAt]);
  const colors = ['magenta', 'lime', 'cyan', 'orange', 'violet', 'yellow', 'mint', 'pink', 'blue', 'red'];
  const r = size / 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute left-1/2 top-[-18px] z-10 -translate-x-1/2 text-5xl">🔻</div>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ transform: `rotate(${rot}deg)` }} className="rounded-full border-[6px] border-black shadow-hard">
        {v.wedges.map((id, i) => {
          const a0 = ((i * seg - 90) * Math.PI) / 180;
          const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
          const am = (((i + 0.5) * seg - 90) * Math.PI) / 180;
          const large = seg > 180 ? 1 : 0;
          return (
            <g key={id}>
              <path d={`M${r},${r} L${r + r * Math.cos(a0)},${r + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${r + r * Math.cos(a1)},${r + r * Math.sin(a1)} Z`} fill={HEX[colors[i % colors.length]]} stroke="#000" strokeWidth="3" />
              <text x={r + r * 0.68 * Math.cos(am)} y={r + r * 0.68 * Math.sin(am)} textAnchor="middle" dominantBaseline="middle" fontSize={size / 11}>
                {P[id]?.sticker}
              </text>
            </g>
          );
        })}
        <circle cx={r} cy={r} r={r * 0.14} fill="#fff" stroke="#000" strokeWidth="4" />
      </svg>
      {done && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-3xl border-4 border-black bg-white px-5 py-3 text-center font-display font-black text-3xl text-black shadow-hard">
            🎯 {P[v.targetId]?.name}
            {v.card && <div className={`mt-1 text-2xl ${v.card.n > 0 ? 'text-green-600' : 'text-red'}`}>{v.card.icon} {v.card.label}</div>}
          </div>
        </motion.div>
      )}
    </div>
  );
}
const roulette = {
  Phone: ({ snap, v }) => (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="font-display font-black text-3xl">العجلة بتلف… 🙏</div>
      <Wheel snap={snap} v={v} size={300} />
    </div>
  ),
  Big: ({ snap, v }) => (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <Prompt big color="magenta">الروليت! 🎰 كارت نقط لواحد فيكم</Prompt>
      <Wheel snap={snap} v={v} size={480} />
    </div>
  ),
};

// ---------------------------------------------------------------- Hot Potato
const hotPotato = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    const mine = v.holder === snap.me;
    useEffect(() => {
      if (mine && !v.exploded) {
        sfx.buzz();
        haptic.heavy();
      }
    }, [mine]);
    useEffect(() => {
      if (v.exploded) sfx.boom();
    }, [v.exploded]);
    if (v.exploded) return <div className="flex flex-1 items-center justify-center"><Prompt big color="red">💥 بوووم! {P[v.holder]?.name}</Prompt></div>;
    if (mine)
      return (
        <div className="flex flex-1 flex-col gap-4 rounded-[30px] border-4 border-black bg-red p-4 shadow-hard">
          <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-center text-8xl">💣</motion.div>
          <div className="text-center font-display font-black text-3xl text-white">القنبلة معاك!</div>
          <div className="text-center text-white">دوس على حد تعدّيهاله</div>
          <PlayerGrid players={roster(snap).filter((p) => p.id !== snap.me)} onPick={(id) => send('pass', id)} />
        </div>
      );
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Avatar p={P[v.holder]} size={110} />
        <div className="font-display font-black text-3xl">💣 مع {P[v.holder]?.name}</div>
        <div className="text-ink-muted">{v.passes} تمريرة</div>
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const ps = roster(snap);
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-8">
        <Prompt big color="red">{v.exploded ? '💥 بوووم!' : 'عدّي القنبلة! 💣'}</Prompt>
        <div className="flex flex-wrap justify-center gap-6">
          {ps.map((p) => (
            <motion.div key={p.id} animate={{ scale: v.holder === p.id ? 1.25 : 1 }} className="flex flex-col items-center gap-1">
              <div className="relative">
                <Avatar p={p} size={90} />
                {v.holder === p.id && <span className="absolute -left-4 -top-6 text-5xl">{v.exploded ? '💥' : '💣'}</span>}
              </div>
              <span className="font-display font-black">{p.name}</span>
            </motion.div>
          ))}
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------- Musical Chairs
function useMusic(on) {
  useEffect(() => {
    if (!on) return;
    let k = 0;
    const id = setInterval(() => sfx.music(k++), 220);
    return () => clearInterval(id);
  }, [on]);
}
const chairs = {
  Phone: ({ snap, v }) => {
    const me = snap.me;
    const alive = v.alive.includes(me);
    const early = v.early.includes(me);
    useMusic(v.stage === 'music' && alive);
    useEffect(() => {
      if (v.stage === 'grab') haptic.heavy();
    }, [v.stage]);
    if (!alive)
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Prompt color="red">خرجت! 🚶</Prompt>
        </div>
      );
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="text-center font-display font-black text-ink-muted">
          جولة {v.round} من {v.rounds}
        </div>
        {v.stage === 'music' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[34px] border-4 border-black bg-orange p-4 shadow-hard">
            <motion.div animate={{ rotate: [-10, 10, -10] }} transition={{ repeat: Infinity, duration: 0.6 }} className="text-8xl">💃</motion.div>
            <div className="font-display font-black text-4xl text-black">ارقص!</div>
            <div className="text-black">دوس على كرسي لما المزيكا تقف بس</div>
            {early ? (
              <div className="font-display font-black text-2xl text-red">بدري! المزيكا كانت شغالة.</div>
            ) : (
              <button type="button" onClick={() => (send('sit', { chair: 0 }), sfx.buzz())} className="rounded-3xl border-4 border-black bg-white/70 px-6 py-6 text-6xl opacity-70">
                🪑
              </button>
            )}
          </div>
        )}
        {v.stage === 'grab' && (
          <>
            <div className="text-center font-display font-black text-5xl">اقعد! 🪑</div>
            {early ? (
              <div className="text-center font-display font-black text-2xl text-red">بدري! المزيكا كانت شغالة.</div>
            ) : v.chairs.includes(me) ? (
              <Sent>قعدت ✓</Sent>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {v.chairs.map((c, i) => (
                  <button key={i} type="button" disabled={c !== null} onPointerDown={() => (send('sit', { chair: i }), sfx.pop(), haptic.medium())} className={`aspect-square rounded-3xl border-4 border-black text-6xl shadow-hard ${c ? 'bg-black/40 opacity-40' : 'bg-white'}`}>
                    🪑
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {v.stage === 'pause' && <Waiting text="الجولة اللي جاية…" />}
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    useMusic(v.stage === 'music');
    return (
      <div className="flex flex-1 flex-col items-center gap-6">
        <Prompt big color="orange">{v.stage === 'music' ? 'ارقصوا! 💃🕺' : v.stage === 'grab' ? 'اقعدوا! 🪑' : `جولة ${v.round} من ${v.rounds}`}</Prompt>
        {v.stage !== 'music' && (
          <div className="flex flex-wrap justify-center gap-4">
            {v.chairs.map((c, i) => (
              <div key={i} className="flex h-32 w-28 flex-col items-center justify-center rounded-3xl border-4 border-black bg-white shadow-hard">
                {c ? <Avatar p={P[c]} size={60} /> : <span className="text-5xl">🪑</span>}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          {roster(snap).map((p) => (
            <Avatar key={p.id} p={p} size={56} dim={v.out.includes(p.id) || v.early.includes(p.id)} />
          ))}
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------- Shell Shock
function cupOrder(swaps, t) {
  const o = [0, 1, 2];
  for (const s of swaps) if (s.at <= t) [o[s.a], o[s.b]] = [o[s.b], o[s.a]];
  return o;
}
function Cups({ v, onPick, showShot, picks, P, big }) {
  const t = useNow(40);
  const order = cupOrder(v.swaps, t);
  const slotOf = (cup) => order.indexOf(cup);
  const w = big ? 180 : 96;
  const gap = big ? 40 : 14;
  return (
    <div className="relative mx-auto" style={{ width: 3 * w + 2 * gap, height: w * 1.25 }}>
      {[0, 1, 2].map((cup) => {
        const slot = slotOf(cup);
        return (
          <motion.button
            key={cup}
            type="button"
            disabled={!onPick}
            onClick={() => onPick?.(slot)}
            animate={{ left: slot * (w + gap) }}
            transition={{ duration: v.swapMs / 1000, ease: 'easeInOut' }}
            className="absolute top-0 flex flex-col items-center"
            style={{ width: w }}
          >
            <div className="flex items-end justify-center rounded-t-[40%] rounded-b-lg border-4 border-black shadow-hard" style={{ width: w, height: w, background: HEX.red, transform: showShot && cup === v.shot ? 'translateY(-30%)' : 'none', transition: 'transform .3s' }}>
              <span className="mb-2 font-display font-black text-white" style={{ fontSize: w / 4 }}>{slot + 1}</span>
            </div>
            {showShot && cup === v.shot && <span style={{ fontSize: w / 2.4 }}>🪙</span>}
            {picks && (
              <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                {Object.entries(picks)
                  .filter(([, s]) => s === slot)
                  .map(([id]) => (
                    <Avatar key={id} p={P[id]} size={big ? 34 : 22} />
                  ))}
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
const shellShock = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    const hustler = v.hustler === snap.me;
    const [sel, setSel] = useState(null);
    const reveal = v.stage === 'reveal' || v.stage === 'done';
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="text-center font-display font-black text-xl">{hustler ? 'انت النصّاب 🎩' : `${P[v.hustler]?.name} هو النصّاب`}</div>
        <Cups v={v} P={P} showShot={v.stage === 'show' || reveal} picks={reveal ? v.picks : null} onPick={!hustler && v.stage === 'pick' && v.myPick === null ? (slot) => (send('pick', slot), sfx.pop()) : hustler && v.stage === 'shuffle' ? (slot) => {
          if (sel === null) return setSel(slot);
          if (sel !== slot) send('swap', { a: sel, b: slot });
          setSel(null);
          haptic.light();
        } : null} />
        {v.stage === 'show' && <div className="text-center font-display font-black text-2xl">بص على الجنيه 👀</div>}
        {v.stage === 'shuffle' && hustler && (
          <div className="flex flex-col gap-2">
            <div className="text-center font-display font-black">لخبطها! بسرعة · {v.swaps.length} تبديلة</div>
            <div className="grid grid-cols-3 gap-2">
              {[[0, 1], [1, 2], [0, 2]].map(([a, b]) => (
                <Btn key={`${a}${b}`} size="sm" onClick={() => send('swap', { a, b })}>
                  {a + 1} ⇄ {b + 1}
                </Btn>
              ))}
            </div>
            <Btn color="lime" onClick={() => send('done')}>خلصت</Btn>
          </div>
        )}
        {v.stage === 'shuffle' && !hustler && <div className="text-center font-display font-black">{P[v.hustler]?.name} بيلخبط… تابع!</div>}
        {v.stage === 'pick' && !hustler && (v.myPick === null ? <div className="text-center font-display font-black text-2xl">الجنيه فين؟ دوس على كباية</div> : <Sent>اخترت كباية {v.myPick + 1}</Sent>)}
        {v.stage === 'pick' && hustler && <div className="text-center font-display font-black">بيخمّنوا… 😈</div>}
        {v.stage === 'pick' && <GameTimer snap={snap} until={v.until} total={12000} />}
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    const reveal = v.stage === 'reveal' || v.stage === 'done';
    return (
      <div className="flex flex-1 flex-col items-center gap-8">
        <Prompt big color="red">{v.stage === 'show' ? 'بصوا على الجنيه 👀' : v.stage === 'shuffle' ? `${P[v.hustler]?.name} بيلخبط! 🎩` : v.stage === 'pick' ? 'الجنيه فين؟' : 'الجنيه كان هنا!'}</Prompt>
        <Cups v={v} P={P} big showShot={v.stage === 'show' || reveal} picks={reveal ? v.picks : null} />
        {v.stage === 'pick' && <Done ids={v.picked} snap={snap} big label="اختاروا" />}
      </div>
    );
  },
};

// ---------------------------------------------------------------- Rock Paper Royale
const HANDS = ['✊', '✋', '✌️'];
const HAND_NAMES = ['حجرة', 'ورقة', 'مقص'];
const rps = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    const me = snap.me;
    const last = v.history[v.history.length - 1];
    const active = v.dueling.includes(me);
    const myWins = v.wins[me] ?? 0;
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-center gap-3 font-display font-black text-xl">
          <span>انت ({myWins})</span>
          <span className="text-ink-muted">ضد</span>
          {v.opponents.map((id) => (
            <span key={id} className="flex items-center gap-1">
              <Avatar p={P[id]} size={30} /> {P[id]?.name} ({v.wins[id] ?? 0})
            </span>
          ))}
        </div>
        <div className="text-center text-ink-muted">أول واحد يكسب رميتين · رمية {v.n}</div>
        {v.stage === 'reveal' && last && me in last.delta ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-6 text-7xl">
              <span>{HANDS[last.picks[me]] ?? '·'}</span>
              <span className="text-2xl">ضد</span>
              {v.opponents.map((id) => (
                <span key={id}>{HANDS[last.picks[id]] ?? '·'}</span>
              ))}
            </div>
            <Prompt color={last.delta[me] > 0 ? 'lime' : last.delta[me] < 0 ? 'red' : 'yellow'}>{last.delta[me] > 0 ? 'كسبت الرمية دي!' : last.delta[me] < 0 ? 'خسرت الرمية دي' : 'تعادل، ارمي تاني'}</Prompt>
          </div>
        ) : !active ? (
          <Sent>{myWins >= 2 ? 'كسبت المبارزة! 🏆' : 'مبارزتك خلصت · بتتفرج على الباقي'}</Sent>
        ) : v.mine !== null ? (
          <Sent>{HANDS[v.mine]} اترمت</Sent>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {HANDS.map((h, i) => (
              <button key={h} type="button" onClick={() => (send('throw', i), sfx.pop())} className="press brutal flex aspect-square flex-col items-center justify-center rounded-3xl bg-white text-black">
                <span className="text-6xl">{h}</span>
                <span className="font-display font-black">{HAND_NAMES[i]}</span>
              </button>
            ))}
          </div>
        )}
        <GameTimer snap={snap} until={v.until} total={v.stage === 'throw' ? 8000 : 4000} />
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    const last = v.history[v.history.length - 1];
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Prompt big color="orange">حجرة ورقة مقص ✊✋✌️ · رمية {v.n}</Prompt>
        <GameTimer snap={snap} until={v.until} total={v.stage === 'throw' ? 8000 : 4000} />
        <div className="grid grid-cols-2 gap-4">
          {v.duels.map((d, k) => (
            <div key={k} className="flex items-center justify-around rounded-3xl border-4 border-black bg-bg-elevated p-4 shadow-hard">
              {d.map((id, i) => (
                <div key={id} className="flex items-center gap-3">
                  {i > 0 && <span className="font-display font-black text-ink-muted">ضد</span>}
                  <div className="flex flex-col items-center">
                    <Avatar p={P[id]} size={56} />
                    <span className="font-display font-black">{P[id]?.name}</span>
                    <span className="font-display font-black text-2xl text-lime">{v.wins[id] ?? 0}</span>
                  </div>
                  <span className="text-5xl">{v.stage === 'reveal' && last ? HANDS[last.picks[id]] ?? '·' : v.thrown.includes(id) ? '✅' : '🤔'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  },
};

// ---------------------------------------------------------------- Lone Wolf
const loneWolf = {
  Phone: ({ snap, v }) => (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt>اختار رقم محدش غيرك يختاره 🐺</Prompt>
      <div className="text-center text-sm text-ink-muted">رقمك سر 🤫</div>
      <GameTimer snap={snap} />
      {v.mine !== null ? (
        <Sent>اخترت {v.mine}</Sent>
      ) : (
        <div className="ltr grid grid-cols-4 gap-2">
          {Array.from({ length: v.max }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" onClick={() => (send('pick', n), sfx.pop())} className="press brutal aspect-square rounded-2xl bg-violet font-display font-black text-3xl text-white">
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  ),
  Big: ({ snap, v }) => (
    <div className="flex flex-1 flex-col items-center gap-6">
      <Prompt big color="violet">اختاروا رقم من 1 لـ{v.max} 🐺</Prompt>
      <GameTimer snap={snap} />
      <Done ids={v.picked} snap={snap} big label="اختاروا" />
    </div>
  ),
};

export default {
  roulette,
  'hot-potato': hotPotato,
  'musical-chairs': chairs,
  'shell-shock': shellShock,
  'rock-paper-scissors': rps,
  'lone-wolf': loneWolf,
};
