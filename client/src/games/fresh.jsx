// UI for the six replacement games (rules in server/games/fresh.js).
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar, HEX, playerMap } from '../ui/kit.jsx';
import { Done, GameTimer, PlayerGrid, Prompt, Sent, TextAnswer, Waiting, roster, send } from './common.jsx';
import { RacePhone, RaceBig, Options } from './brain.jsx';
import { sfx, haptic } from '../sound.js';

// ---------------------------------------------------------------- كمّل المثل
const finishProverb = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => (
        <div className="flex flex-col gap-4">
          <div className="text-center text-ink-muted">كمّل المثل</div>
          <div className="rounded-[30px] border-4 border-black bg-white p-6 text-center font-display font-black text-3xl leading-snug text-black">{q.prompt}</div>
          <Options options={q.options} onPick={pick} cols={1} />
        </div>
      )}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="yellow" title="كمّل المثل 📜" />,
};

// ---------------------------------------------------------------- زووم
function ZoomPic({ prompt }) {
  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center overflow-hidden rounded-[30px] border-4 border-black bg-white">
      <motion.div
        initial={{ scale: 9 }}
        animate={{ scale: 1.6 }}
        transition={{ duration: 9, ease: 'easeOut' }}
        style={{ fontSize: 150, lineHeight: 1, transformOrigin: `${prompt.fx}% ${prompt.fy}%` }}
      >
        {prompt.emoji}
      </motion.div>
    </div>
  );
}
const zoomIn = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => (
        <div className="flex flex-col gap-4">
          <div className="text-center text-ink-muted">دي صورة إيه؟ (هي بتبعد شوية بشوية)</div>
          <ZoomPic key={q.prompt.emoji + q.prompt.fx} prompt={q.prompt} />
          <Options options={q.options} onPick={pick} />
        </div>
      )}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="cyan" title="زووم 🔍 دي صورة إيه؟" />,
};

// ---------------------------------------------------------------- ناديلنا الأوردر
const Items = ({ items, big }) => (
  <div className="flex flex-wrap items-center justify-center gap-2">
    {items.map((x, i) => (
      <span key={i} className={`flex items-center gap-1 rounded-2xl bg-black/10 px-2 py-1 ${big ? 'text-3xl' : 'text-lg'}`}>
        <span className={big ? 'text-5xl' : 'text-2xl'}>{x.e}</span>
        {x.n}
      </span>
    ))}
  </div>
);
function OrderQ({ q, pick }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => (setHidden(true), haptic.light()), q.prompt.showMs);
    return () => clearTimeout(t);
  }, []);
  if (!hidden)
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center font-display font-black text-2xl">احفظ الطلب! 🧾</div>
        <div className="rounded-[30px] border-4 border-black bg-white p-6 text-black">
          <Items items={q.prompt.items} big />
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="text-center font-display font-black text-2xl">أنهي الطلب الصح؟</div>
      <Options options={q.options} onPick={pick} cols={1} renderOpt={(o) => <Items items={o} />} />
    </div>
  );
}
const orderUp = {
  Phone: ({ snap, v }) => (
    <RacePhone snap={snap} v={v} render={(q, pick) => <OrderQ key={q.prompt.items.map((x) => x.e).join('')} q={q} pick={pick} />} />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="orange" title="ناديلنا الأوردر 🧾" />,
};

// ---------------------------------------------------------------- دوس بالترتيب
const numberRush = {
  Phone: ({ snap, v }) => (
    <RacePhone
      snap={snap}
      v={v}
      render={(q, pick) => (
        <div className="flex flex-col gap-4">
          <div className="text-center font-display font-black text-3xl">
            دوس على <span className="ltr inline-block rounded-xl bg-lime px-3 text-black">{q.prompt}</span>
          </div>
          <div className="ltr grid grid-cols-3 gap-3">
            {q.options.map((n, i) => {
              const done = n < q.prompt;
              return (
                <button key={i} type="button" disabled={done} onPointerDown={() => !done && pick(i)} className={`aspect-square rounded-3xl border-4 border-black font-display font-black text-5xl ${done ? 'bg-black/30 text-white/30' : 'press bg-white text-black shadow-hard-sm'}`}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      )}
    />
  ),
  Big: ({ snap, v }) => <RaceBig snap={snap} v={v} color="lime" title="دوس بالترتيب من ١ لـ١٢ 👆" />,
};

// ---------------------------------------------------------------- ضربة جزاء
// The goal is drawn as seen from the penalty spot, so «يمين» means the same side on every phone.
const PK_SIDES = [
  ['left', '⬅️ شمال'],
  ['middle', '⬆️ نص'],
  ['right', 'يمين ➡️'],
];
const PK_X = { left: -1, middle: 0, right: 1 };
const sideName = (d) => ({ left: 'شمال', middle: 'النص', right: 'يمين' })[d] ?? '';
const NET = {
  backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.18) 0 2px, transparent 2px 16px), repeating-linear-gradient(0deg, rgba(255,255,255,.18) 0 2px, transparent 2px 16px)',
  backgroundColor: 'rgba(0,0,0,.28)',
};

function PkGoal({ keeper, last, kickKey, pick, onPick, big }) {
  const dive = last ? PK_X[last.dive ?? 'middle'] : 0;
  return (
    <div className={`ltr relative mx-auto w-full ${big ? 'max-w-2xl' : 'max-w-sm'}`}>
      <div className="relative aspect-[2.2/1] w-full overflow-hidden rounded-t-xl border-[6px] border-b-0 border-white" style={NET}>
        <motion.div
          key={`k${kickKey}`}
          className="absolute bottom-1 flex flex-col items-center"
          style={{ x: '-50%' }}
          initial={{ left: '50%', rotate: 0 }}
          animate={{ left: `${50 + dive * 32}%`, rotate: dive * 35 }}
          transition={{ type: 'spring', stiffness: 220, damping: 16, delay: last ? 0.15 : 0 }}
        >
          <Avatar p={keeper} size={big ? 72 : 48} />
          <span className={big ? 'text-4xl' : 'text-2xl'}>🧤</span>
        </motion.div>
        {last?.shot && (
          <motion.div
            key={`b${kickKey}`}
            className={`absolute ${big ? 'text-6xl' : 'text-4xl'}`}
            style={{ x: '-50%' }}
            initial={{ left: '50%', bottom: '-45%', scale: 1.7 }}
            animate={{ left: `${50 + PK_X[last.shot] * 33}%`, bottom: last.goal ? '42%' : '22%', scale: 0.9 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            ⚽
          </motion.div>
        )}
        {onPick && (
          <div className="absolute inset-0 grid grid-cols-3">
            {PK_SIDES.map(([d, label]) => (
              <button
                key={d}
                type="button"
                disabled={pick !== null}
                onClick={() => (onPick(d), sfx.pop(), haptic.light())}
                className={`flex items-start justify-center border-x border-white/10 pt-2 font-display font-black text-white ${pick === d ? 'bg-lime/50' : pick ? 'opacity-30' : 'active:bg-white/20'}`}
              >
                <span className="rounded-full bg-black/60 px-2 py-0.5 text-sm">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-2 rounded-b bg-white/30" />
    </div>
  );
}

function PkKeeperButtons({ pick, onPick }) {
  return (
    <div className="ltr grid grid-cols-3 gap-2">
      {PK_SIDES.map(([d, label]) => (
        <button
          key={d}
          type="button"
          disabled={pick !== null}
          onClick={() => (onPick(d), sfx.pop(), haptic.light())}
          className={`press rounded-2xl border-[3px] border-black py-4 font-display font-black text-lg ${pick === d ? 'bg-lime text-black shadow-hard-sm' : pick ? 'bg-black/30 opacity-50' : 'bg-white text-black'}`}
        >
          🧤 {label}
        </button>
      ))}
    </div>
  );
}

function PkScore({ v, P, big }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {v.duelists.map((id) => {
        const mine = v.kicks.filter((k) => k.shooter === id);
        const slots = Math.max(v.each, mine.length);
        return (
          <div key={id} className={`flex flex-col items-center gap-1 rounded-2xl bg-black/30 p-2 ${v.stage === 'choose' && v.shooter === id ? 'ring-2 ring-lime' : ''}`}>
            <div className={`flex items-center gap-2 font-display font-black ${big ? 'text-3xl' : ''}`}>
              <Avatar p={P[id]} size={big ? 48 : 26} />
              <span className="max-w-[7rem] truncate">{P[id]?.name}</span>
              <span className="text-lime">{v.goals[id] ?? 0}</span>
            </div>
            <div className={`flex gap-1 ${big ? 'text-3xl' : ''}`}>
              {Array.from({ length: slots }, (_, i) => (
                <span key={i}>{mine[i] ? (mine[i].goal ? '⚽' : '❌') : '⚪'}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const pkTitle = (v) => (v.sudden ? 'ضربات زيادة ⚡' : `شوطة ${Math.min(v.kickNo || 1, v.each * 2)} من ${v.each * 2}`);
const pkResult = (last) => (last.goal ? 'جوووون! ⚽' : last.shot ? 'الحارس صدّها! 🧤' : 'الشوطة ضاعت');

function PkBets({ v, P }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center font-display font-black text-2xl">مين هيكسب الماتش؟</div>
      <div className="grid grid-cols-2 gap-2">
        {v.duelists.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => (send('bet', id), sfx.pop(), haptic.light())}
            className={`press flex flex-col items-center gap-1 rounded-2xl border-[3px] border-black p-3 font-display font-black ${v.myBet === id ? 'bg-lime text-black shadow-hard-sm' : 'bg-white text-black'}`}
          >
            <Avatar p={P[id]} size={44} />
            {P[id]?.name}
          </button>
        ))}
      </div>
      <div className="text-center text-sm text-ink-muted">{v.myBet ? `توقّعك: ${P[v.myBet]?.name} ✓ (تقدر تغيّره لحد أول شوطة)` : 'التوقّع بيقفل أول ما أول شوطة تتشاط'}</div>
    </div>
  );
}

const penaltyKicks = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    const me = snap.me;
    let body;
    if (v.stage === 'done') body = <Waiting text={v.forfeit ? 'الماتش خلص: الخصم خرج من السهرة' : 'الماتش خلص! ⚽'} />;
    else if (v.stage === 'reveal' && v.last)
      body = (
        <>
          <PkGoal keeper={P[v.last.keeper]} last={v.last} kickKey={v.kicks.length} />
          <Prompt color={v.last.goal ? 'lime' : 'red'}>{pkResult(v.last)}</Prompt>
          <div className="text-center text-ink-muted">
            الشوطة: {v.last.shot ? sideName(v.last.shot) : '—'} · الحارس: {v.last.dive ? sideName(v.last.dive) : 'ما نطّش'}
          </div>
        </>
      );
    else if (v.role === 'shooter')
      body = (
        <>
          <div className="text-center font-display font-black text-2xl">⚽ دورك تشوط! دوس على الزاوية</div>
          <div className="text-center text-ink-muted">الحارس: {P[v.keeper]?.name}</div>
          <PkGoal keeper={P[v.keeper]} kickKey={v.kicks.length} pick={v.myPick} onPick={(d) => send('shoot', d)} />
          {v.myPick && <Sent>{`هتشوط ${sideName(v.myPick)} ✓ ${v.diveLocked ? 'والحارس اختار…' : 'مستنيين الحارس'}`}</Sent>}
        </>
      );
    else if (v.role === 'keeper')
      body = (
        <>
          <div className="text-center font-display font-black text-2xl">🧤 انت الحارس! هتنط فين؟</div>
          <div className="text-center text-ink-muted">
            اللي بيشوط: {P[v.shooter]?.name} · {v.shotLocked ? 'اختار ✓' : 'بيفكّر…'}
          </div>
          <PkGoal keeper={P[me]} kickKey={v.kicks.length} />
          <PkKeeperButtons pick={v.myPick} onPick={(d) => send('dive', d)} />
          {v.myPick && <Sent>{`هتنط ${sideName(v.myPick)} ✓`}</Sent>}
        </>
      );
    else if (v.betsOpen) body = <PkBets v={v} P={P} />;
    else
      body = (
        <>
          <div className="text-center font-display font-black">
            ⚽ {P[v.shooter]?.name} قصاد 🧤 {P[v.keeper]?.name}
          </div>
          <PkGoal keeper={P[v.keeper]} kickKey={v.kicks.length} />
          <div className="text-center text-sm text-ink-muted">{v.myBet ? `توقّعك: ${P[v.myBet]?.name}` : 'ما توقّعتش المرة دي'}</div>
        </>
      );
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="text-center font-display font-black">{pkTitle(v)}</div>
        {v.stage !== 'done' && <GameTimer snap={snap} until={v.until} total={v.stage === 'choose' ? 8000 : 3500} />}
        <PkScore v={v} P={P} />
        {body}
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Prompt big color="mint">{v.stage === 'reveal' && v.last ? pkResult(v.last) : `ضربة جزاء ⚽ ${pkTitle(v)}`}</Prompt>
        {v.stage !== 'done' && <GameTimer snap={snap} until={v.until} total={v.stage === 'choose' ? 8000 : 3500} />}
        <PkScore v={v} P={P} big />
        <PkGoal keeper={P[v.stage === 'reveal' && v.last ? v.last.keeper : v.keeper]} last={v.stage === 'reveal' ? v.last : null} kickKey={v.kicks.length} big />
        {v.stage === 'choose' && (
          <div className="text-center font-display font-black text-3xl">
            ⚽ {P[v.shooter]?.name} {v.shotLocked ? '✓' : '…'} · 🧤 {P[v.keeper]?.name} {v.diveLocked ? '✓' : '…'}
          </div>
        )}
        {Object.values(v.betCounts).some(Boolean) && (
          <div className="text-center text-xl text-ink-muted">
            التوقّعات: {v.duelists.map((id) => `${P[id]?.name} ${v.betCounts[id] ?? 0}`).join(' · ')}
          </div>
        )}
      </div>
    );
  },
};

// ---------------------------------------------------------------- مين قالها؟
const AnswerCard = ({ text, big }) => (
  <div className={`rounded-[30px] border-4 border-black bg-white p-6 text-center font-display font-black leading-snug text-black shadow-hard ${big ? 'text-5xl' : 'text-3xl'}`}>«{text}»</div>
);
const whoSaidIt = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    const me = snap.me;
    if (v.stage === 'write')
      return (
        <div className="flex flex-1 flex-col gap-4">
          <GameTimer snap={snap} until={v.until} total={40000} />
          <Prompt color="pink">{v.prompt}</Prompt>
          {v.myAnswer ? (
            <>
              <Sent>كتبت ✓</Sent>
              <Done ids={v.wrote} snap={snap} label="كتبوا" />
            </>
          ) : (
            <TextAnswer placeholder="إجابتك هنا… محدش هيعرف إنها بتاعتك" onSend={(t) => send('answer', t)} />
          )}
        </div>
      );
    if (!v.current) return <Waiting />;
    const others = roster(snap).filter((p) => p.id !== me);
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="text-center font-display font-black text-ink-muted">
          إجابة {v.current.n} من {v.current.of} · مين قالها؟
        </div>
        <GameTimer snap={snap} until={v.until} total={v.stage === 'guess' ? 12000 : 4000} />
        <AnswerCard text={v.current.text} />
        {v.stage === 'guess' &&
          (v.mine ? (
            <Sent>دي إجابتك 🤫 استنى</Sent>
          ) : (
            <PlayerGrid players={others} selected={v.myGuess} disabled={v.myGuess !== null} onPick={(id) => send('guess', id)} />
          ))}
        {v.stage === 'reveal' && (
          <Prompt color={v.mine ? 'white' : v.myGuess === v.author ? 'lime' : 'red'}>
            {v.mine ? 'دي كانت إجابتك 😎' : `دي إجابة ${P[v.author]?.name}${v.myGuess === v.author ? ' ✓ عرفتها!' : ''}`}
          </Prompt>
        )}
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Prompt big color="pink">{v.prompt}</Prompt>
        <GameTimer snap={snap} until={v.until} total={v.stage === 'write' ? 40000 : v.stage === 'guess' ? 12000 : 4000} />
        {v.stage === 'write' && <Done ids={v.wrote} snap={snap} big label="كتبوا" />}
        {v.current && <AnswerCard text={v.current.text} big />}
        {v.stage === 'guess' && <Done ids={v.guessed} snap={snap} big label="خمّنوا" />}
        {v.stage === 'reveal' && v.author && (
          <div className="flex items-center justify-center gap-4">
            <Avatar p={P[v.author]} size={90} />
            <span className="font-display font-black text-4xl">دي إجابة {P[v.author]?.name}!</span>
          </div>
        )}
      </div>
    );
  },
};

export default {
  'finish-proverb': finishProverb,
  'zoom-in': zoomIn,
  'order-up': orderUp,
  'number-rush': numberRush,
  'penalty-kicks': penaltyKicks,
  'who-said-it': whoSaidIt,
};
