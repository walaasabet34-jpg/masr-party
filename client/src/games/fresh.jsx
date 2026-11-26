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
const DIRS = [
  ['right', 'يمين ➡️'],
  ['middle', 'نص ⬆️'],
  ['left', 'شمال ⬅️'],
];
const dirName = (d) => DIRS.find((x) => x[0] === d)?.[1] ?? '—';
function DirButtons({ value, onPick }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {DIRS.map(([d, label]) => (
        <button key={d} type="button" disabled={value !== null} onClick={() => (onPick(d), sfx.pop(), haptic.light())} className={`press rounded-2xl border-[3px] border-black py-4 font-display font-black text-lg ${value === d ? 'bg-lime text-black shadow-hard-sm' : value ? 'bg-black/30 opacity-50' : 'bg-white text-black'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
const penaltyKicks = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    const me = snap.me;
    if (!v.target) return <Waiting text="بتتفرج على الماتش ⚽" />;
    const total = (v.goals[me] ?? 0) + (v.saves[me] ?? 0);
    return (
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between font-display font-black">
          <span>جولة {v.round} من {v.rounds}</span>
          <span>⚽ {v.goals[me] ?? 0} · 🧤 {v.saves[me] ?? 0}</span>
        </div>
        <GameTimer snap={snap} until={v.until} total={v.stage === 'choose' ? 9000 : 4000} />
        {v.stage === 'choose' && (
          <>
            <div className="rounded-3xl border-4 border-black bg-mint p-3 text-black">
              <div className="mb-2 flex items-center gap-2 font-display font-black text-xl">
                ⚽ هتشوط فين؟ <span className="text-base">(الحارس: {P[v.target]?.name})</span>
              </div>
              <DirButtons value={v.myShot} onPick={(d) => send('shoot', d)} />
            </div>
            <div className="rounded-3xl border-4 border-black bg-white p-3 text-black">
              <div className="mb-2 flex items-center gap-2 font-display font-black text-xl">
                🧤 هتنط فين؟ <span className="text-base">(اللي بيشوط عليك: {P[v.shooter]?.name})</span>
              </div>
              <DirButtons value={v.myDive} onPick={(d) => send('dive', d)} />
            </div>
            {v.myShot && v.myDive && <Sent>تمام ✓ استنى الباقي</Sent>}
          </>
        )}
        {v.stage === 'reveal' &&
          (() => {
            const mine = v.last.find((k) => k.shooter === me);
            const onMe = v.last.find((k) => k.keeper === me);
            return (
              <div className="flex flex-col gap-3">
                <Prompt color={mine?.goal ? 'lime' : 'red'}>{mine?.shot ? (mine.goal ? 'جوووون! ⚽' : 'الحارس صدّها 🧤') : 'ما شُطتش!'}</Prompt>
                <div className="text-center text-ink-muted">
                  شُطت {dirName(mine?.shot)} · {mine?.dive ? `الحارس نط ${dirName(mine.dive)}` : 'الحارس ما نطّش'}
                </div>
                <Prompt color={onMe?.shot && !onMe.goal ? 'lime' : 'white'} small>
                  {!onMe?.shot ? 'اللي قصادك ما شاطش' : onMe.goal ? `جون فيك من ${P[onMe.shooter]?.name}` : 'صدّيتها! 🧤'}
                </Prompt>
              </div>
            );
          })()}
        <div className="mt-auto text-center font-display font-black text-ink-muted">مجموعك: {total}</div>
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Prompt big color="mint">{v.stage === 'reveal' ? 'النتيجة ⚽' : `ضربة جزاء ⚽ جولة ${v.round} من ${v.rounds}`}</Prompt>
        <GameTimer snap={snap} until={v.until} total={v.stage === 'choose' ? 9000 : 4000} />
        {v.stage === 'choose' && <Done ids={v.ready} snap={snap} big label="اختاروا" />}
        {v.stage === 'reveal' && (
          <div className="grid grid-cols-2 gap-3">
            {v.last.map((k) => (
              <div key={k.shooter} className="flex items-center gap-3 rounded-2xl border-4 border-black bg-white p-3 text-black">
                <Avatar p={P[k.shooter]} size={44} />
                <span className="text-3xl">{k.goal ? '⚽' : '🧤'}</span>
                <Avatar p={P[k.keeper]} size={44} />
                <span className="font-display font-black">{k.goal ? 'جون!' : k.shot ? 'صدّها' : 'من غير شوطة'}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-4">
          {roster(snap).map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <Avatar p={p} size={56} />
              <span className="font-display font-black">{(v.goals[p.id] ?? 0) + (v.saves[p.id] ?? 0)}</span>
            </div>
          ))}
        </div>
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
