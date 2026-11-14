// "المركب" screens: big screen table + phone controls.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../net.js';
import { T } from '../copy.js';
import { Avatar, Btn, HEX, TimeBar, playerMap, Countdown } from '../ui/kit.jsx';
import { Card, BoatArt } from '../ui/art.jsx';
import { sfx, haptic } from '../sound.js';

const PART_TITLE = ['', 'أحمر ولا إسود', 'أعلى ولا أوطى', 'جوه ولا برة', 'الهرم', 'المركب'];
const RULES = {
  1: ['واحد ورا التاني، خمّن لون ورقتك الجاية.', 'صح ← +١ نقطة · غلط ← مفيش نقط', 'خلّي ورقك معاك. هتحتاجه بعدين.'],
  2: ['الورقة الجاية هتبقى أعلى ولا أوطى من أول ورقة معاك؟', 'صح ← +٢ · غلط ← مفيش نقط', 'نفس الرقم يتحسب غلط. الآص أعلى حاجة.'],
  3: ['الورقة الجاية هتيجي بين ورقتينك، برة، ولا بالظبط على الطرف؟', 'صح ← +٣ · غلط ← مفيش نقط', 'خلّي ورقك معاك. هتحتاجه بعدين.'],
  4: ['الكل مع بعض. ٥ صفوف بتتقلب ورا بعض: ٥، ٤، ٣، ٢، ١ ورقة.', 'عندك ورقة بنفس رقم ورقة في الصف؟ حطها وخد نقط.', 'الصف الأول بنقطة للورقة، وكل صف +١. اللي يفضل معاه أكتر ورق يركب المركب.'],
  5: ['كوتشينة جديدة. ٥ ورق مقلوب. خمّنوا أعلى ولا أوطى، مع بعض.', 'كل تخمين غلط = −١ نقطة (لحد −٥ بالكتير)، واستنى الباقيين وبعدين الكل يبدأ من أول ورقة.', 'عدّي الخمسة عشان تنزل وتاخد +٣. اللعبة بتخلص لما الكل ينزل أو الكوتشينة تخلص.'],
};
const PICK_LABEL = { red: 'أحمر ♥', black: 'إسود ♠', higher: 'أعلى ⬆', lower: 'أوطى ⬇', between: 'بين', outside: 'برة', on: 'على الطرف' };
const PICKS = { 1: ['red', 'black'], 2: ['higher', 'lower'], 3: ['between', 'outside', 'on'] };
const control = (snap) => snap.role === 'display' || snap.hostId === snap.me;

function PartHeader({ b }) {
  return (
    <div className="flex items-center gap-3">
      <span className="rounded-full border-[3px] border-black bg-cyan px-3 py-1 font-display font-black text-black shadow-hard-sm">جولة {b.part} من 5</span>
      <span className="font-display font-black text-2xl">{PART_TITLE[b.part]}</span>
      <span className="mr-auto text-sm text-ink-muted">🂠 {b.deckLeft}</span>
    </div>
  );
}

function RulesCard({ b, big }) {
  return (
    <div className="rounded-[30px] border-4 border-black bg-bg-elevated p-5 shadow-hard">
      <div className={`font-display font-black ${big ? 'text-5xl' : 'text-3xl'}`}>{PART_TITLE[b.part]}</div>
      <ul className={`mt-3 space-y-2 ${big ? 'text-2xl' : 'text-lg'}`}>
        {RULES[b.part].map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
    </div>
  );
}

function Scores({ snap }) {
  const P = playerMap(snap);
  const b = snap.boat;
  const ids = [...b.order].sort((x, y) => b.score[y].points - b.score[x].points);
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <div key={id} className="flex items-center gap-1.5 rounded-2xl bg-black/40 px-2 py-1 text-sm">
          <Avatar p={P[id]} size={24} />
          <span className="font-display font-black">{P[id]?.name}</span>
          <span className="font-display font-black text-lime tabular">🏆 {b.score[id].points}</span>
        </div>
      ))}
    </div>
  );
}

function PendingBanner({ snap }) {
  const P = playerMap(snap);
  const p = snap.boat.pending;
  if (!p) return null;
  return (
    <motion.div key={p.card + p.pid} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`flex items-center gap-4 rounded-[28px] border-4 border-black p-4 shadow-hard ${p.right ? 'bg-lime text-black' : 'bg-red text-white'}`}>
      <Card txt={p.card} w={70} />
      <div className="flex-1">
        <div className="font-display font-black text-2xl">
          {P[p.pid]?.name}: {PICK_LABEL[p.pick]} — {p.right ? 'صح!' : 'غلط!'}
        </div>
        <div className="font-display font-bold">
          {p.right ? `+${p.n} ${p.n === 1 ? 'نقطة' : p.n === 2 ? 'نقطتين' : 'نقط'} 🎉` : 'المرة دي مفيش نقط'}
        </div>
      </div>
    </motion.div>
  );
}

function Pyramid({ b, w = 64 }) {
  return (
    <div className="flex flex-col-reverse items-center gap-2">
      {b.rows.map((row, r) => (
        <div key={r} className={`flex items-center gap-2 rounded-2xl p-1 ${r === b.row ? 'bg-lime/25 ring-4 ring-lime' : ''}`}>
          <span className="w-16 text-center text-xs font-black text-ink-muted">+{r + 1} للورقة</span>
          {row.map((c, i) => (
            <Card key={i} txt={c} faceDown={!c} w={w} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BoatTrack({ b, w = 70 }) {
  return (
    <div className="flex items-end justify-center gap-3">
      {b.boatCards.map((c, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <Card txt={c} faceDown={!c} w={w} glow={i === b.idx && b.stage === 'boat'} />
          <span className="text-xs font-black text-ink-muted">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

function FlipResult({ snap }) {
  const P = playerMap(snap);
  const f = snap.boat.flip;
  if (!f) return null;
  return (
    <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} className="flex items-center justify-center gap-4 rounded-[28px] border-4 border-black bg-bg-elevated p-4 shadow-hard">
      <div className="text-center">
        <div className="text-xs text-ink-muted">ورقة المركب</div>
        <Card txt={f.boatCard} w={70} />
      </div>
      <div className="font-display font-black text-3xl">{f.same ? '=' : f.higher ? '⬆' : '⬇'}</div>
      <div className="text-center">
        <div className="text-xs text-ink-muted">الورقة الجديدة</div>
        <Card txt={f.card} w={70} />
      </div>
      <div className="flex flex-col gap-1">
        {Object.entries(f.res).map(([id, r]) => (
          <span key={id} className={`rounded-full px-2 font-display font-black text-sm ${r.right ? 'bg-lime text-black' : 'bg-red text-white'}`}>
            {P[id]?.name} {r.right ? '✓' : '✗ −١'}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function Over({ snap, big }) {
  const b = snap.boat;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className={big ? 'text-9xl' : 'text-7xl'}>🏝️</div>
      <div className={`text-stroke font-display font-black ${big ? 'text-7xl' : 'text-4xl'}`}>وصلنا البر!</div>
      <div className="text-xl text-ink-muted">{b.over === 'deck' ? 'الكوتشينة خلصت' : 'الكل نزل من المركب'}</div>
      {control(snap) && (
        <Btn color="yellow" size="lg" onClick={api.end}>
          {T.seeAwards}
        </Btn>
      )}
    </div>
  );
}

function ReadyChips({ snap }) {
  const P = playerMap(snap);
  const b = snap.boat;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {b.order.map((id) => (
        <span key={id} className={`flex items-center gap-1 rounded-2xl border-[3px] border-black px-2 py-1 font-display font-black text-sm ${b.ready.includes(id) ? 'bg-lime text-black' : 'bg-white text-black'}`}>
          <Avatar p={P[id]} size={24} /> {P[id]?.name} {b.ready.includes(id) ? '✓' : '…'}
        </span>
      ))}
      {control(snap) && (
        <Btn size="sm" color="dark" onClick={() => api.boat({ type: 'force' })}>
          {T.startAnyway}
        </Btn>
      )}
    </div>
  );
}

export function BoatBig({ snap }) {
  const b = snap.boat;
  const P = playerMap(snap);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <PartHeader b={b} />
      {b.stage === 'over' ? (
        <Over snap={snap} big />
      ) : b.stage === 'rules' ? (
        <div className="grid grid-cols-2 items-start gap-8">
          <div className="overflow-hidden rounded-[34px] border-4 border-black shadow-hard">
            <BoatArt height={360} />
          </div>
          <div className="flex flex-col gap-5">
            <RulesCard b={b} big />
            {b.part === 5 && (
              <div className="rounded-3xl border-4 border-black bg-red p-4 font-display font-black text-2xl text-white shadow-hard">
                ⛵ {b.fate ? 'الكل فضّى إيده. القدر اختار…' : 'راكبين المركب:'} {b.crew.map((id) => P[id]?.name).join('، ')}
              </div>
            )}
            <ReadyChips snap={snap} />
          </div>
        </div>
      ) : b.stage === 'play' ? (
        <div className="grid grid-cols-[1fr_380px] gap-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {b.order.map((id) => (
              <div key={id} className={`rounded-3xl border-4 border-black p-3 ${b.turn === id ? 'bg-yellow text-black shadow-hard' : 'bg-bg-elevated'}`}>
                <div className="mb-2 flex items-center gap-2">
                  <Avatar p={P[id]} size={32} />
                  <span className="font-display font-black">{P[id]?.name}</span>
                  {b.turn === id && <span className="mr-auto text-sm font-black">بيخمّن…</span>}
                </div>
                <div className="flex gap-1.5">
                  {b.hands[id].map((c, i) => (
                    <Card key={i} txt={c} w={46} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4">
            <PendingBanner snap={snap} />
            <Scores snap={snap} />
          </div>
        </div>
      ) : b.stage === 'pyramid' ? (
        <div className="grid grid-cols-[1fr_380px] gap-6">
          <div className="flex flex-col items-center gap-4">
            <div className="font-display font-black text-3xl">صف {b.row + 1} من ٥ · +{b.row + 1} للورقة</div>
            <TimeBar endsAt={b.rowEndsAt} total={30000} color="cyan" />
            <Pyramid b={b} w={70} />
          </div>
          <div className="flex flex-col gap-3">
            <div className="font-display font-black text-xl">الصف ده</div>
            {b.laid.filter((l) => l.row === b.row).map((l, i) => (
              <div key={i} className="flex items-center gap-2 rounded-2xl bg-black/40 p-2">
                <Avatar p={P[l.pid]} size={26} /> <Card txt={l.card} w={30} /> <span className="font-display font-black">{P[l.pid]?.name} +{l.n}</span>
              </div>
            ))}
            {!b.laid.some((l) => l.row === b.row) && <div className="text-ink-muted">محدش حط ورق لسه…</div>}
            <Scores snap={snap} />
            {control(snap) && (
              <Btn color="cyan" onClick={() => api.boat({ type: 'force' })}>
                اقلب الصف اللي بعده
              </Btn>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="font-display font-black text-3xl">
            ورقة {b.idx + 1} من ٥ · الغلط = −١ · محاولة {b.attempts}
          </div>
          <BoatTrack b={b} w={90} />
          <FlipResult snap={snap} />
          <div className="flex flex-wrap justify-center gap-3">
            {b.crew.map((id) => (
              <div key={id} className={`flex items-center gap-2 rounded-2xl border-[3px] border-black px-3 py-1 ${b.off.includes(id) ? 'bg-lime text-black' : b.splashed.includes(id) ? 'bg-cyan text-black' : 'bg-white text-black'}`}>
                <Avatar p={P[id]} size={30} />
                <span className="font-display font-black">{P[id]?.name}</span>
                <span className="text-sm">{b.off.includes(id) ? 'نزل 🏝️' : b.splashed.includes(id) ? 'وقع في المية 💦' : b.guessed.includes(id) ? 'قفل ✓' : '…'}</span>
              </div>
            ))}
          </div>
          {!b.flip && <TimeBar endsAt={b.guessUntil} total={30000} color="cyan" />}
          {control(snap) && !b.flip && (
            <Btn size="sm" color="dark" onClick={() => api.boat({ type: 'force' })}>
              اقلب دلوقتي
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

export function BoatPhone({ snap }) {
  const b = snap.boat;
  const P = playerMap(snap);
  const me = snap.me;
  const inGame = b.order.includes(me);
  const mineTurn = b.turn === me && b.stage === 'play';
  useEffect(() => {
    if (mineTurn && !b.pending) {
      sfx.pop();
      haptic.medium();
    }
  }, [mineTurn, b.pending]);
  if (!inGame)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-6xl">⛵</div>
        <div className="font-display font-black text-2xl">المركب بحرت خلاص</div>
        <div className="text-ink-muted">بص على الشاشة الكبيرة. هتدخل الجيم الجاي.</div>
      </div>
    );
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
      <PartHeader b={b} />
      {b.stage === 'over' && <Over snap={snap} />}
      {b.stage === 'rules' && (
        <>
          <RulesCard b={b} />
          {b.part === 5 && <div className="rounded-3xl bg-red p-3 font-display font-black text-white">⛵ {b.crew.includes(me) ? 'انت راكب المركب!' : 'انت على البر بأمان'}</div>}
          <div className="dock-bottom mt-auto">
            {b.ready.includes(me) ? (
              <div className="rounded-3xl bg-lime py-4 text-center font-display font-black text-2xl text-black">{T.youAreReady}</div>
            ) : (
              <Btn color="cyan" size="xl" className="w-full" onClick={() => api.boat({ type: 'ready' })}>
                جاهز 👍
              </Btn>
            )}
          </div>
        </>
      )}
      {b.part <= 4 && b.myHand && b.stage !== 'rules' && b.stage !== 'over' && (
        <div>
          <div className="mb-1 text-xs font-bold tracking-wider text-ink-muted">ورقك</div>
          <div className="flex flex-wrap gap-2">
            {b.myHand.map((c, i) => {
              const match = b.stage === 'pyramid' && (b.rowRanks[b.row] ?? []).includes(c.r);
              return <Card key={i} txt={c.txt} w={58} glow={match} dim={b.stage === 'pyramid' && !match} onClick={match ? () => (api.boat({ type: 'place', i }), sfx.pop()) : undefined} />;
            })}
          </div>
        </div>
      )}
      {b.stage === 'play' && (
        <>
          {mineTurn && !b.pending && (
            <div className="mt-auto flex flex-col gap-3">
              <div className="text-center font-display font-black text-3xl">دورك! 🎯</div>
              <div className={`grid gap-3 ${PICKS[b.part].length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {PICKS[b.part].map((k) => (
                  <Btn key={k} color={k === 'red' ? 'red' : k === 'black' ? 'dark' : 'cyan'} size="lg" onClick={() => api.boat({ type: 'pick', pick: k })}>
                    {PICK_LABEL[k]}
                  </Btn>
                ))}
              </div>
            </div>
          )}
          {!mineTurn && !b.pending && (
            <div className="mt-6 flex items-center justify-center gap-2 font-display font-black text-xl">
              <Avatar p={P[b.turn]} size={36} /> {P[b.turn]?.name} بيخمّن…
            </div>
          )}
          {b.pending && <PendingBanner snap={snap} />}
          {b.pending && (b.pending.pid === me || control(snap)) && (
            <Btn size="sm" color="dark" onClick={() => api.boat({ type: 'next' })}>
              اللي بعده ←
            </Btn>
          )}
        </>
      )}
      {b.stage === 'pyramid' && (
        <>
          <div className="rounded-3xl bg-black/30 p-3 text-center">
            <div className="font-display font-black">صف {b.row + 1} من ٥ · +{b.row + 1} للورقة</div>
            <div className="mt-2 flex justify-center gap-1.5">
              {(b.rows[b.row] ?? []).map((c, i) => (
                <Card key={i} txt={c} w={44} />
              ))}
            </div>
            <div className="mt-2">
              <TimeBar endsAt={b.rowEndsAt} total={30000} color="cyan" />
            </div>
          </div>
          <div className="text-center text-ink-muted">{(b.rowRanks[b.row] ?? []).some((r) => b.myHand.some((c) => c.r === r)) ? `دوس على ورقة منوّرة عشان تحطها وتاخد +${b.row + 1}` : 'مفيش ورقة زيها في الصف ده'}</div>
          {b.laid.filter((l) => l.row === b.row && l.pid === me).map((l, i) => (
            <div key={i} className="rounded-2xl bg-lime p-2 text-center font-display font-black text-black">
              حطيت {l.card}: +{l.n} 🎉
            </div>
          ))}
          {b.myHand.length === 0 && <div className="rounded-2xl bg-lime p-3 text-center font-display font-black text-black">إيدك فاضية. انت بأمان من المركب!</div>}
        </>
      )}
      {b.stage === 'boat' && (
        <>
          <BoatTrack b={b} w={52} />
          <FlipResult snap={snap} />
          {b.off.includes(me) ? (
            <div className="rounded-3xl bg-lime p-4 text-center font-display font-black text-2xl text-black">نزلت من المركب! +٣ 🏝️</div>
          ) : !b.crew.includes(me) ? (
            <div className="rounded-3xl bg-black/30 p-4 text-center">
              <div className="font-display font-black text-xl">على البر بأمان</div>
              <div className="text-ink-muted">بص على الشاشة الكبيرة وشجّع اللي في المركب</div>
            </div>
          ) : b.splashed.includes(me) ? (
            <div className="rounded-3xl bg-cyan p-4 text-center text-black">
              <div className="font-display font-black text-2xl">💦 وقعت! استنى الباقيين</div>
              <div>لما محدش يفضل راكب، كلكم تبدأوا من أول ورقة.</div>
            </div>
          ) : b.riders.includes(me) && !b.flip ? (
            <div className="mt-auto flex flex-col gap-3">
              <div className="text-center font-display font-black text-xl">
                ورقة {b.idx + 1} من ٥ · الغلط = −١ {!b.boatCards[b.idx] && '· تخمين أعمى'}
              </div>
              {b.myGuess ? (
                <div className="rounded-3xl bg-lime py-4 text-center font-display font-black text-2xl text-black">قفلت: {PICK_LABEL[b.myGuess]}</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Btn color="cyan" size="xl" onClick={() => api.boat({ type: 'guess', pick: 'higher' })}>
                    {PICK_LABEL.higher}
                  </Btn>
                  <Btn color="magenta" size="xl" onClick={() => api.boat({ type: 'guess', pick: 'lower' })}>
                    {PICK_LABEL.lower}
                  </Btn>
                </div>
              )}
              <TimeBar endsAt={b.guessUntil} total={30000} color="cyan" />
            </div>
          ) : null}
        </>
      )}
      <div className="mt-auto pt-2">
        <Scores snap={snap} />
      </div>
    </div>
  );
}
