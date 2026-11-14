import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { now } from '../net.js';
import { Avatar, HEX, playerMap, useNow, Countdown } from '../ui/kit.jsx';
import { Done, GameTimer, Prompt, Sent, roster, send } from './common.jsx';
import { sfx, haptic } from '../sound.js';

// ---------------------------------------------------------------- Tap Race
function TapRacePhone({ snap, v }) {
  const t = useNow(30);
  const greenAt = useRef(null);
  const [mine, setMine] = useState(null);
  const fake = v.fakeoutsAt.some((f) => t >= f && t < f + 250);
  useEffect(() => {
    if (v.go && greenAt.current === null) {
      greenAt.current = performance.now();
      haptic.medium();
    }
  }, [v.go]);
  useEffect(() => {
    if (fake) haptic.light();
  }, [fake]);
  const done = v.myMs !== null || mine !== null;
  const tap = () => {
    if (done) return;
    const ms = greenAt.current === null ? -1 : Math.round(performance.now() - greenAt.current);
    setMine(ms);
    send('tap', ms);
    ms < 0 ? sfx.buzz() : sfx.go();
  };
  const ms = v.myMs ?? mine;
  const bg = done ? (ms < 0 ? HEX.orange : '#15152A') : v.go ? HEX.lime : fake ? HEX.yellow : HEX.red;
  return (
    <button type="button" onPointerDown={tap} className="flex flex-1 select-none flex-col items-center justify-center rounded-[34px] border-4 border-black text-center shadow-hard" style={{ background: bg, minHeight: '60dvh' }}>
      <div className="font-display font-black text-6xl text-black">{done ? (ms < 0 ? 'بدري! ⚡' : `${ms}`) : v.go ? 'دوس!' : fake ? '…' : 'استنى…'}</div>
      {done && ms >= 0 && <div className="mt-2 font-display font-black text-2xl text-white">ملّي ثانية</div>}
      {done && ms < 0 && <div className="mt-2 text-black">دوست قبل ما يخضر.</div>}
    </button>
  );
}
function TapRaceBig({ snap, v }) {
  const t = useNow(30);
  const fake = v.fakeoutsAt.some((f) => t >= f && t < f + 250);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-[40px] border-4 border-black p-8 shadow-hard" style={{ background: v.go ? HEX.lime : fake ? HEX.yellow : HEX.red }}>
      <div className="font-display font-black text-8xl text-black">{v.go ? 'دوس!' : 'استنى…'}</div>
      <div className="text-2xl font-black text-black">دوس على موبايلك أول ما يخضر</div>
      <Done ids={v.tapped} snap={snap} big label="داسوا" />
    </div>
  );
}

// ---------------------------------------------------------------- Tap Frenzy
function FrenzyPhone({ snap, v }) {
  const t = useNow(100);
  const [n, setN] = useState(0);
  const buf = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (buf.current > 0) {
        const k = Math.min(8, buf.current);
        buf.current -= k;
        send('tap', { n: k });
      }
    }, 120);
    return () => clearInterval(id);
  }, []);
  const live = v.startAt && t >= v.startAt && t <= v.endsAt;
  const over = v.endsAt && t > v.endsAt;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="text-center font-display font-black text-6xl tabular">{n}</div>
      <GameTimer snap={snap} until={v.endsAt} total={6000} />
      <button
        type="button"
        disabled={!live}
        onPointerDown={() => {
          if (!live) return;
          setN((x) => x + 1);
          buf.current++;
          sfx.tap();
          haptic.light();
        }}
        className="flex flex-1 items-center justify-center rounded-full border-[6px] border-black font-display font-black text-6xl text-black shadow-hard active:scale-95"
        style={{ background: over ? '#444' : HEX.orange, minHeight: '50dvh' }}
      >
        {over ? 'خلاص!' : 'افرم!'}
      </button>
    </div>
  );
}
function FrenzyBig({ snap, v }) {
  const ps = roster(snap);
  const max = Math.max(10, ...Object.values(v.counts));
  return (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt big color="orange">افرم الزرار! 👆</Prompt>
      <GameTimer snap={snap} until={v.endsAt} total={6000} />
      <div className="flex flex-col gap-2">
        {ps.map((p) => (
          <div key={p.id} className="flex items-center gap-3">
            <Avatar p={p} size={44} />
            <div className="h-10 flex-1 overflow-hidden rounded-xl border-[3px] border-black bg-black/40">
              <motion.div animate={{ width: `${((v.counts[p.id] ?? 0) / max) * 100}%` }} className="h-full" style={{ background: HEX[p.color], marginInlineStart: 0 }} />
            </div>
            <span className="w-16 font-display font-black text-2xl tabular">{v.counts[p.id] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Don't Let Go
function DontLetGoPhone({ snap, v }) {
  const t = useNow(40);
  const holding = useRef(false);
  const out = v.me.out;
  const fake = v.stage === 'hold' && v.fakeouts.some((f) => t >= f && t < f + 600);
  useEffect(() => {
    if (v.stage === 'go') {
      sfx.go();
      haptic.heavy();
    }
  }, [v.stage]);
  useEffect(() => {
    if (fake) haptic.medium();
  }, [fake]);
  const down = () => {
    holding.current = true;
    send('hold');
    haptic.light();
  };
  const up = () => {
    if (!holding.current) return;
    holding.current = false;
    send('release');
  };
  const msg = out === 'early' ? 'سبت بدري! 😬' : out === 'nohold' ? 'ما مسكتش' : v.me.ms !== null ? `${v.me.ms} م.ث` : v.stage === 'go' ? 'سيب!' : fake ? 'لسه! 😈' : v.me.holding ? 'فضل ماسك…' : 'دوس وفضل دايس';
  const bg = out ? HEX.red : v.stage === 'go' ? HEX.lime : fake ? HEX.yellow : v.me.holding ? HEX.mint : '#fff';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <div className="text-center font-display font-black text-3xl">{v.stage === 'gather' ? 'الكل يمسك الدايرة' : v.stage === 'hold' ? 'فضل ماسك' : ''}</div>
      <button type="button" onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} onContextMenu={(e) => e.preventDefault()} className="relative flex h-72 w-72 items-center justify-center rounded-full border-[6px] border-black text-center font-display font-black text-3xl text-black shadow-hard" style={{ background: bg }}>
        {v.me.holding && !out && v.stage !== 'go' && <span className="pulse-ring absolute inset-0 rounded-full border-4 border-black" />}
        <span className="relative px-6">{msg}</span>
      </button>
    </div>
  );
}
function DontLetGoBig({ snap, v }) {
  const ps = roster(snap);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <Prompt big color={v.stage === 'go' ? 'lime' : 'mint'}>{v.stage === 'go' ? 'سيبوا!' : v.stage === 'gather' ? 'الكل يدوس ويمسك ✋' : 'محدش يسيب… 😈'}</Prompt>
      <div className="flex flex-wrap justify-center gap-4">
        {ps.map((p) => (
          <div key={p.id} className="flex flex-col items-center gap-1">
            <Avatar p={p} size={72} dim={!!v.out[p.id]} />
            <span className="font-display font-black">{v.out[p.id] ? '😬' : v.released.includes(p.id) ? '✓' : v.holding[p.id] ? '✋' : '…'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Stop at 10
function StopPhone({ snap, v }) {
  const t = useNow(30);
  const el = v.startAt ? Math.max(0, t - v.startAt) : 0;
  const visible = el < 3000;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="ltr font-display font-black text-8xl tabular">{v.myStop !== null ? (v.myStop / 1000).toFixed(2) : visible ? (el / 1000).toFixed(2) : '?.??'}</div>
      {v.myStop !== null ? (
        <Sent>وقّفت عند {(v.myStop / 1000).toFixed(2)} ث</Sent>
      ) : (
        <button
          type="button"
          onPointerDown={() => {
            send('stop');
            sfx.go();
            haptic.medium();
          }}
          className="h-56 w-56 rounded-full border-[6px] border-black bg-red font-display font-black text-5xl text-white shadow-hard active:scale-95"
        >
          وقّف
        </button>
      )}
      <div className="text-ink-muted">الهدف: ١٠٫٠٠ ثانية بالظبط</div>
    </div>
  );
}
function StopBig({ snap, v }) {
  const t = useNow(50);
  const el = v.startAt ? t - v.startAt : 0;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8">
      <div className="ltr font-display font-black text-[160px] leading-none tabular">{el < 3000 ? (el / 1000).toFixed(2) : '?.??'}</div>
      <Prompt color="cyan">وقّف الساعة عند ١٠ ثواني بالظبط ⏱️</Prompt>
      <Done ids={v.stopped} snap={snap} big label="وقّفوا" />
    </div>
  );
}

// ---------------------------------------------------------------- Quick Draw
function QuickDrawPhone({ snap, v }) {
  const P = playerMap(snap);
  const me = snap.me;
  const drawnAt = useRef(null);
  useEffect(() => {
    if (v.drawn && drawnAt.current === null) {
      drawnAt.current = performance.now();
      sfx.go();
      haptic.heavy();
    }
  }, [v.drawn]);
  if (v.duelists.includes(me)) {
    const shot = v.shot;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className="font-display font-black text-3xl">انت في المبارزة! 🤠</div>
        <div className="text-ink-muted">ضد {P[v.duelists.find((d) => d !== me)]?.name}</div>
        {shot !== null ? (
          <Sent>{shot < 0 ? 'ضربت بدري! ⚡' : `${shot} م.ث`}</Sent>
        ) : (
          <button
            type="button"
            onPointerDown={() => send('shoot', drawnAt.current === null ? -1 : Math.round(performance.now() - drawnAt.current))}
            className="flex h-72 w-72 items-center justify-center rounded-full border-[6px] border-black font-display font-black text-5xl text-black shadow-hard"
            style={{ background: v.drawn ? HEX.lime : HEX.yellow }}
          >
            {v.drawn ? 'اسحب! 🔫' : 'استنى…'}
          </button>
        )}
      </div>
    );
  }
  const duel = v.duelists.map((id) => P[id]).filter(Boolean);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt>مين هيكسب المبارزة؟</Prompt>
      {v.myBet || v.drawn ? (
        <Sent>{v.myBet ? `راهنت على ${P[v.myBet]?.name} 🔒` : 'الرهان قفل 🔒'}</Sent>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {duel.map((p) => (
            <button key={p.id} type="button" onClick={() => send('bet', p.id)} className="press brutal flex flex-col items-center gap-2 rounded-[28px] p-4 text-black" style={{ background: HEX[p.color] }}>
              <Avatar p={p} size={70} />
              <span className="font-display font-black text-xl">{p.name}</span>
            </button>
          ))}
        </div>
      )}
      {v.drawn && <div className="text-center font-display font-black text-5xl">اسحب!</div>}
    </div>
  );
}
function QuickDrawBig({ snap, v }) {
  const P = playerMap(snap);
  const [a, b] = v.duelists.map((id) => P[id]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-[40px] border-4 border-black p-8 shadow-hard" style={{ background: v.drawn ? HEX.lime : '#3b2a12' }}>
      <div className="font-display font-black text-8xl text-white text-stroke">{v.drawn ? 'اسحب!' : 'استنى…'}</div>
      <div className="flex items-center gap-16">
        {[a, b].map((p, i) => (
          <div key={p?.id ?? i} className="flex flex-col items-center gap-2">
            <Avatar p={p} size={120} />
            <span className="font-display font-black text-3xl text-white text-stroke">{p?.name}</span>
            <span className="rounded-full bg-black px-3 font-display font-black text-lime">{v.betCounts[i]} رهان</span>
            {v.shotBy.includes(p?.id) && <span className="text-4xl">💥</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Whack-a-Mole
function WhackPhone({ snap, v }) {
  const t = useNow(40);
  const el = v.startAt ? t - v.startAt : -1;
  const [hits, setHits] = useState([]);
  const visible = el < 0 ? [] : v.moles.map((m, k) => ({ ...m, k })).filter((m) => el >= m.at && el <= m.at + m.up);
  const score = v.scores[snap.me] ?? 0;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-display font-black text-4xl tabular">{score}</span>
        <span className="text-ink-muted">اضرب الفيران، وسيب الـ💣</span>
      </div>
      <GameTimer snap={snap} until={v.startAt ? v.startAt + v.duration : null} total={v.duration} />
      {el < 0 && <div className="text-center font-display font-black text-4xl">استعد…</div>}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, cell) => {
          const m = visible.find((x) => x.cell === cell);
          const hit = m && (hits.includes(m.k) || v.myHits.includes(m.k));
          return (
            <button
              key={cell}
              type="button"
              onPointerDown={() => {
                if (!m || hit) return;
                setHits((h) => [...h, m.k]);
                send('whack', { k: m.k });
                m.bomb ? (sfx.boom(), haptic.heavy()) : (sfx.pop(), haptic.light());
              }}
              className="relative flex aspect-square items-end justify-center overflow-hidden rounded-full border-4 border-black bg-[#3b2414]"
            >
              {m && (
                <motion.span initial={{ y: 60 }} animate={{ y: hit ? 60 : 0 }} className="mb-2 text-6xl">
                  {hit ? '💫' : m.bomb ? '💣' : '🐭'}
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function WhackBig({ snap, v }) {
  const ps = roster(snap).sort((a, b) => (v.scores[b.id] ?? 0) - (v.scores[a.id] ?? 0));
  return (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt big color="lime">اضرب الفار 🔨 مش القنبلة 💣</Prompt>
      <GameTimer snap={snap} until={v.startAt ? v.startAt + v.duration : null} total={v.duration} />
      <div className="grid grid-cols-2 gap-3">
        {ps.map((p, i) => (
          <motion.div layout key={p.id} className="flex items-center gap-3 rounded-2xl border-[3px] border-black bg-white p-2 text-black">
            <span className="w-6 font-display font-black">{i + 1}</span>
            <Avatar p={p} size={40} />
            <span className="flex-1 font-display font-black">{p.name}</span>
            <span className="font-display font-black text-3xl tabular">{v.scores[p.id] ?? 0}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Snap!
function currentCard(v, t) {
  if (!v.startAt) return null;
  const el = t - v.startAt;
  return v.cards.find((c) => el >= c.at && el < c.at + c.dur) ?? null;
}
function SnapCards({ c, size = 'text-7xl' }) {
  return (
    <div className="flex justify-center gap-4">
      {[c?.a, c?.b].map((e, i) => (
        <motion.div key={`${c?.at}-${i}`} initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ duration: 0.15 }} className={`flex aspect-[3/4] w-32 items-center justify-center rounded-2xl border-4 border-black bg-white shadow-hard ${size}`}>
          {e ?? '🂠'}
        </motion.div>
      ))}
    </div>
  );
}
function SnapPhone({ snap, v }) {
  const t = useNow(30);
  const c = currentCard(v, t);
  const [fb, setFb] = useState(null);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between font-display font-black">
        <span className="text-4xl tabular">{v.points[snap.me] ?? 0}</span>
        <span className="text-ink-muted">اخبط بس لما الكارتين يبقوا زي بعض</span>
      </div>
      <SnapCards c={c} />
      {fb && <div className={`text-center font-display font-black text-2xl ${fb === 'ok' ? 'text-lime' : 'text-red'}`}>{fb === 'ok' ? 'جبتها!' : 'مش زي بعض! −١'}</div>}
      <button
        type="button"
        onPointerDown={() => {
          if (!c) return;
          const ok = c.a === c.b;
          setFb(ok ? 'ok' : 'bad');
          ok ? (sfx.win(), haptic.medium()) : (sfx.buzz(), haptic.heavy());
          setTimeout(() => setFb(null), 700);
          send('snap');
        }}
        className="mt-auto rounded-[34px] border-[6px] border-black bg-red py-14 font-display font-black text-6xl text-white shadow-hard active:scale-95"
      >
        خبطة!
      </button>
    </div>
  );
}
function SnapBig({ snap, v }) {
  const t = useNow(30);
  const ps = roster(snap);
  return (
    <div className="flex flex-1 flex-col items-center gap-8">
      <SnapCards c={currentCard(v, t)} size="text-9xl" />
      <div className="flex flex-wrap justify-center gap-4">
        {ps.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-2xl bg-black/40 px-3 py-1">
            <Avatar p={p} size={36} />
            <span className="font-display font-black text-2xl">{v.points[p.id] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default {
  'tap-race': { Phone: TapRacePhone, Big: TapRaceBig },
  'tap-frenzy': { Phone: FrenzyPhone, Big: FrenzyBig },
  'dont-let-go': { Phone: DontLetGoPhone, Big: DontLetGoBig },
  'stop-at-ten': { Phone: StopPhone, Big: StopBig },
  'quick-draw': { Phone: QuickDrawPhone, Big: QuickDrawBig },
  'whack-a-mole': { Phone: WhackPhone, Big: WhackBig },
  snap: { Phone: SnapPhone, Big: SnapBig },
};
