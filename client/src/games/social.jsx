import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Avatar, Btn, HEX, playerMap, useNow } from '../ui/kit.jsx';
import { Done, GameTimer, PlayerGrid, Prompt, Sent, TextAnswer, Waiting, roster, send } from './common.jsx';
import { DrawPad, Drawing } from './draw.jsx';
import { sfx, haptic } from '../sound.js';

// ---------------------------------------------------------------- Most Likely To
const mostLikely = {
  Phone: ({ snap, v }) => (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt>
        <div className="text-base opacity-60">أكتر واحد ممكن…</div>
        {v.prompt}
      </Prompt>
      <GameTimer snap={snap} />
      {v.myVote ? <Sent>صوّت ✓</Sent> : <PlayerGrid players={roster(snap)} onPick={(id) => send('vote', id)} />}
      {v.myVote && <Done ids={v.voted} snap={snap} label="صوّتوا" />}
    </div>
  ),
  Big: ({ snap, v }) => (
    <div className="flex flex-1 flex-col items-center gap-8">
      <Prompt big color="orange">
        <div className="text-2xl opacity-70">أكتر واحد ممكن…</div>
        {v.prompt}
      </Prompt>
      <GameTimer snap={snap} />
      <Done ids={v.voted} snap={snap} big label="صوّتوا" />
    </div>
  ),
};

// ---------------------------------------------------------------- Would You Rather
const wyr = {
  Phone: ({ snap, v }) => (
    <div className="flex flex-1 flex-col gap-4">
      <div className="text-center font-display font-black text-2xl">تختار إيه؟</div>
      <GameTimer snap={snap} />
      {[v.a, v.b].map((t, k) => (
        <button key={k} type="button" disabled={v.myVote !== null} onClick={() => (send('pick', k), sfx.pop())} className={`press brutal flex-1 rounded-[30px] p-5 font-display font-black text-2xl ${v.myVote === k ? 'ring-4 ring-white' : ''} ${v.myVote !== null && v.myVote !== k ? 'opacity-40' : ''}`} style={{ background: k ? HEX.cyan : HEX.pink, color: '#000' }}>
          {k ? '🅱️' : '🅰️'} {t}
        </button>
      ))}
      {v.myVote !== null && <Done ids={v.voted} snap={snap} label="اختاروا" />}
    </div>
  ),
  Big: ({ snap, v }) => (
    <div className="flex flex-1 flex-col gap-6">
      <div className="text-center font-display font-black text-5xl">تختار إيه؟ ⚖️</div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <Prompt big color="pink">🅰️ {v.a}</Prompt>
        <span className="font-display font-black text-4xl">ولا</span>
        <Prompt big color="cyan">🅱️ {v.b}</Prompt>
      </div>
      <GameTimer snap={snap} />
      <Done ids={v.voted} snap={snap} big label="اختاروا" />
    </div>
  ),
};

// ---------------------------------------------------------------- Imposter
function HoldReveal({ children, label }) {
  const [on, setOn] = useState(false);
  return (
    <button type="button" onPointerDown={() => (setOn(true), haptic.light())} onPointerUp={() => setOn(false)} onPointerLeave={() => setOn(false)} onPointerCancel={() => setOn(false)} onContextMenu={(e) => e.preventDefault()} className="flex min-h-48 w-full items-center justify-center rounded-[30px] border-4 border-black p-5 text-center shadow-hard" style={{ background: on ? '#fff' : '#1b1b30' }}>
      {on ? children : <span className="font-display font-black text-2xl text-white">👆 {label}</span>}
    </button>
  );
}
const imposter = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    const ps = roster(snap);
    if (v.stage === 'vote')
      return (
        <div className="flex flex-1 flex-col gap-4">
          <Prompt color="violet">مين الدخيل؟</Prompt>
          <GameTimer snap={snap} until={v.voteUntil} total={30000} />
          {v.myVote ? <Sent>صوّت ✓</Sent> : <PlayerGrid players={ps.filter((p) => p.id !== snap.me)} onPick={(id) => send('vote', id)} />}
          <Done ids={v.voted} snap={snap} label="صوّتوا" />
        </div>
      );
    return (
      <div className="flex flex-1 flex-col gap-4">
        <HoldReveal label="اضغط مطوّل عشان تشوف كلمتك">
          {v.role === 'imposter' ? (
            <div className="text-black">
              <div className="font-display font-black text-3xl text-red">انت الدخيل! 🕵️</div>
              <div className="mt-1">التصنيف: <b>{v.category}</b></div>
              <div className="text-sm opacity-70">اندمج معاهم. محدش لازم ياخد باله.</div>
            </div>
          ) : (
            <div className="text-black">
              <div className="text-sm opacity-70">التصنيف: {v.category}</div>
              <div className="font-display font-black text-5xl">{v.word}</div>
            </div>
          )}
        </HoldReveal>
        <div className="rounded-3xl bg-black/30 p-3 text-center">
          <div className="font-display font-black">لفّوا، كل واحد يقول كلمة واحدة</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <Avatar p={P[v.starter]} size={30} />
            <span className="font-display font-black">{v.starter === snap.me ? 'انت تبدأ!' : `${P[v.starter]?.name} يبدأ`}</span>
          </div>
        </div>
        <GameTimer snap={snap} until={v.discussUntil} total={90000} />
        {v.readyToVote.includes(snap.me) ? <Sent>جاهز للتصويت ✓</Sent> : <Btn color="violet" size="lg" onClick={() => send('readyVote')}>جاهز للتصويت</Btn>}
        <Done ids={v.readyToVote} snap={snap} label="جاهزين" />
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    return (
      <div className="flex flex-1 flex-col items-center gap-6">
        <Prompt big color="violet">التصنيف: {v.category}</Prompt>
        {v.stage === 'discuss' ? (
          <>
            <div className="flex items-center gap-4 font-display font-black text-4xl">
              <Avatar p={P[v.starter]} size={80} /> {P[v.starter]?.name} يبدأ
            </div>
            <div className="text-2xl text-ink-muted">لفّوا، كل واحد يقول كلمة واحدة بصوت عالي</div>
            <GameTimer snap={snap} until={v.discussUntil} total={90000} />
            <Done ids={v.readyToVote} snap={snap} big label="جاهزين للتصويت" />
          </>
        ) : (
          <>
            <div className="font-display font-black text-6xl">مين الدخيل؟ 🕵️</div>
            <GameTimer snap={snap} until={v.voteUntil} total={30000} />
            <Done ids={v.voted} snap={snap} big label="صوّتوا" />
          </>
        )}
      </div>
    );
  },
};

// ---------------------------------------------------------------- duels (Quip Clash + Doodle Duel)
function DuelVotePhone({ snap, v, renderEntry }) {
  const c = v.current;
  const P = playerMap(snap);
  if (!c) return <Waiting />;
  const mine = c.mine >= 0;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="text-center font-display font-black text-ink-muted">
        {v.k + 1}/{v.total}
      </div>
      <Prompt small>{c.prompt}</Prompt>
      <GameTimer snap={snap} until={v.until} total={v.stage === 'vote' ? 15000 : 4500} />
      {mine && v.stage === 'vote' && <div className="text-center font-display font-black text-yellow">دي مواجهتك! صوابعك 🤞</div>}
      <div className="grid gap-3">
        {c.entries.map((e, i) => {
          const isMine = i === c.mine;
          const picked = c.myVote === i;
          return (
            <button key={i} type="button" disabled={v.stage !== 'vote' || isMine || c.myVote !== null || (mine && c.entries.length === 2)} onClick={() => (send('vote', { pick: i }), sfx.pop())} className={`press brutal rounded-[26px] bg-white p-3 text-right text-black ${picked ? 'ring-4 ring-lime' : ''}`}>
              {renderEntry(e)}
              {isMine && <div className="mt-1 text-xs font-black text-violet">بتاعتك</div>}
              {c.votes && (
                <div className="mt-2 flex items-center gap-2">
                  <Avatar p={P[c.authors[i]]} size={26} />
                  <span className="font-display font-black">{P[c.authors[i]]?.name}</span>
                  <span className="mr-auto rounded-full bg-black px-2 font-display font-black text-lime">{c.votes[i]} صوت</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function DuelBig({ snap, v, renderEntry, writing, sub }) {
  const c = v.current;
  const P = playerMap(snap);
  if (!c)
    return (
      <div className="flex flex-1 flex-col items-center gap-6">
        <Prompt big color="magenta">{writing}</Prompt>
        <GameTimer snap={snap} until={v.until} total={60000} />
        <Done ids={sub} snap={snap} big label="بعتوا" />
      </div>
    );
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="text-center text-ink-muted font-display font-black">
        {v.k + 1}/{v.total}
      </div>
      <Prompt big>{c.prompt}</Prompt>
      <GameTimer snap={snap} until={v.until} total={v.stage === 'vote' ? 15000 : 4500} />
      <div className="grid grid-cols-2 gap-8">
        {c.entries.map((e, i) => (
          <motion.div key={i} initial={{ scale: 0.8, rotate: i ? 3 : -3 }} animate={{ scale: 1, rotate: i ? 1 : -1 }} className="rounded-[30px] border-4 border-black bg-white p-4 text-black shadow-hard">
            {renderEntry(e, true)}
            {c.votes && (
              <div className="mt-3 flex items-center gap-2">
                <Avatar p={P[c.authors[i]]} size={44} />
                <span className="font-display font-black text-2xl">{P[c.authors[i]]?.name}</span>
                <span className="mr-auto rounded-full bg-black px-3 font-display font-black text-2xl text-lime">{c.votes[i]}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
      {v.stage === 'vote' && <Done ids={c.voted} snap={snap} big label="صوّتوا" />}
    </div>
  );
}

const quipClash = {
  Phone: ({ snap, v }) => {
    if (v.stage === 'write')
      return (
        <div className="flex flex-1 flex-col gap-4">
          <Prompt>{v.myPrompt}</Prompt>
          <GameTimer snap={snap} until={v.until} total={60000} />
          {v.myAnswer ? <Sent>اتبعتت ✓ «{v.myAnswer}»</Sent> : <TextAnswer placeholder="اكتب أظرف إجابة…" onSend={(text) => send('answer', { text })} />}
        </div>
      );
    return <DuelVotePhone snap={snap} v={v} renderEntry={(e) => <div className="font-display font-black text-xl">{e ?? '(ما كتبش 🦗)'}</div>} />;
  },
  Big: ({ snap, v }) => <DuelBig snap={snap} v={v} writing="اكتبوا إجاباتكم على الموبايل 🎤" sub={v.written} renderEntry={(e) => <div className="font-display font-black text-4xl leading-snug">{e ?? '(ما كتبش 🦗)'}</div>} />,
};

const doodleDuel = {
  Phone: ({ snap, v }) => {
    const pad = useRef(null);
    const P = playerMap(snap);
    const sentRef = useRef(false);
    const t = useNow(250);
    // when the timer runs out, send whatever is on the pad
    useEffect(() => {
      if (v.stage === 'draw' && !v.sent && v.until && t >= v.until - 300 && !sentRef.current && pad.current && !pad.current.isEmpty()) {
        sentRef.current = true;
        send('submit', { drawing: pad.current.get() });
      }
    }, [t]);
    if (v.stage === 'draw')
      return (
        <div className="flex flex-1 flex-col gap-3">
          <Prompt small>
            ارسم: «{v.myPrompt}» <span className="text-sm opacity-60">ضد {v.rivals.map((id) => P[id]?.name).join(' و')}</span>
          </Prompt>
          <GameTimer snap={snap} until={v.until} total={60000} />
          {v.sent ? (
            <Sent>الخربشة اتبعتت! 🖍️</Sent>
          ) : (
            <>
              <DrawPad ref={pad} />
              <Btn color="lime" size="lg" onClick={() => !pad.current.isEmpty() && send('submit', { drawing: pad.current.get() })}>
                ابعت الرسمة ←
              </Btn>
              <div className="text-center text-xs text-ink-muted">لما الوقت يخلص، هتتبعت زي ما هي</div>
            </>
          )}
        </div>
      );
    return <DuelVotePhone snap={snap} v={v} renderEntry={(e) => <Drawing drawing={e} className="rounded-xl" />} />;
  },
  Big: ({ snap, v }) => <DuelBig snap={snap} v={v} writing="ارسموا على موبايلاتكم! 🖍️" sub={v.drawn} renderEntry={(e) => <Drawing drawing={e} className="rounded-2xl" />} />,
};

// ---------------------------------------------------------------- Big Fat Lie
const bigFatLie = {
  Phone: ({ snap, v }) => {
    const P = playerMap(snap);
    if (v.stage === 'write')
      return (
        <div className="flex flex-1 flex-col gap-4">
          <Prompt>{v.text}</Prompt>
          <GameTimer snap={snap} until={v.until} total={45000} />
          {v.myLie ? <Sent>{v.knewTruth ? 'دي الحقيقة فعلًا! انت في الأمان 🧠' : `فشرك: «${v.myLie}»`}</Sent> : <TextAnswer placeholder="اكتب فشر يتصدق…" max={40} onSend={(text) => send('lie', { text })} />}
        </div>
      );
    return (
      <div className="flex flex-1 flex-col gap-3">
        <Prompt small>{v.text}</Prompt>
        <GameTimer snap={snap} until={v.until} total={v.stage === 'pick' ? 25000 : 7000} />
        <div className="text-center font-display font-black">{v.stage === 'pick' ? 'أنهي فيهم الحقيقة؟' : 'الحقيقة طلعت…'}</div>
        <div className="flex flex-col gap-2">
          {v.options.map((o, i) => (
            <button key={i} type="button" disabled={v.stage !== 'pick' || o.mine || v.myPick !== null} onClick={() => (send('pick', { i }), sfx.pop())} className={`press brutal rounded-2xl p-3 text-right font-display font-black text-xl ${o.truth ? 'bg-lime text-black' : v.myPick === i ? 'bg-yellow text-black' : 'bg-white text-black'} ${o.mine ? 'opacity-50' : ''}`}>
              {o.text} {o.mine && <span className="text-xs">(بتاعك)</span>}
              {o.pickers && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-sm">
                  {!o.truth && <span>فشر {o.authors.map((a) => P[a]?.name).join(' و')} · </span>}
                  {o.pickers.map((id) => (
                    <Avatar key={id} p={P[id]} size={22} />
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  },
  Big: ({ snap, v }) => {
    const P = playerMap(snap);
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Prompt big color="yellow">{v.text}</Prompt>
        <GameTimer snap={snap} until={v.until} total={v.stage === 'write' ? 45000 : v.stage === 'pick' ? 25000 : 7000} />
        {v.stage === 'write' ? (
          <Done ids={v.written} snap={snap} big label="كتبوا" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {v.options.map((o, i) => (
              <motion.div key={i} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className={`rounded-2xl border-4 border-black p-4 font-display font-black text-3xl ${o.truth ? 'bg-lime text-black' : 'bg-white text-black'}`}>
                {o.text}
                {o.pickers && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-base">
                    {!o.truth && <span>{o.authors.map((a) => P[a]?.name).join(' و')} ← </span>}
                    {o.pickers.map((id) => (
                      <Avatar key={id} p={P[id]} size={30} />
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
        {v.stage === 'pick' && <Done ids={v.picked} snap={snap} big label="اختاروا" />}
      </div>
    );
  },
};

// ---------------------------------------------------------------- Drunk Telephone
const STEP_LABEL = ['كل واحد يكتب جملة', 'كل واحد يرسم اللي جاله', 'كل واحد يخمّن رسمة'];
const PHRASES = ['قطة بتشرب شاي على القهوة', 'سواق توكتوك بيرقص باليه', 'أبو الهول لابس نضارة شمس', 'فرخة راكبة ميكروباص', 'جمل بيعمل سيلفي', 'مومياء بتاكل كشري', 'ديناصور في المترو', 'بطيخة بتعيط'];
function ChainView({ snap, r, big }) {
  const P = playerMap(snap);
  const t = useNow(200);
  const shown = r.start ? Math.min(3, 1 + Math.floor((t - r.start) / 3000)) : 3;
  const c = r.chain;
  return (
    <div className={`grid gap-3 ${big ? 'grid-cols-3' : 'grid-cols-1'}`}>
      {[0, 1, 2].map((k) =>
        k < shown ? (
          <motion.div key={k} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[26px] border-4 border-black bg-white p-3 text-black shadow-hard">
            <div className="mb-1 flex items-center gap-1 text-xs opacity-70">
              <Avatar p={P[c[k]?.by]} size={20} /> {P[c[k]?.by]?.name} · {['الجملة ✍️', 'الرسمة 🎨', 'التخمين 🤔'][k]}
            </div>
            {k === 1 ? <Drawing drawing={c[1]?.drawing} className="rounded-xl" /> : <div className={`font-display font-black ${big ? 'text-3xl' : 'text-xl'}`}>{c[k]?.text || '…'}</div>}
          </motion.div>
        ) : (
          <div key={k} className="rounded-[26px] border-4 border-dashed border-white/20" />
        ),
      )}
    </div>
  );
}
const telephone = {
  Phone: ({ snap, v }) => {
    const pad = useRef(null);
    const [phrase, setPhrase] = useState('');
    const t = useNow(250);
    const sentRef = useRef(-1);
    useEffect(() => {
      if (v.stage === 'play' && v.task?.kind === 'draw' && !v.task.done && v.until && t >= v.until - 300 && sentRef.current !== v.step && pad.current && !pad.current.isEmpty()) {
        sentRef.current = v.step;
        send('submit', { step: 1, drawing: pad.current.get() });
      }
    }, [t]);
    if (v.stage === 'reveal' && v.reveal) {
      const r = v.reveal;
      const canBlame = !r.perfect && r.start && t >= r.start + 6000;
      return (
        <div className="flex flex-1 flex-col gap-3">
          <div className="text-center font-display font-black text-ink-muted">
            سلسلة {r.r + 1}/{r.total}
          </div>
          <ChainView snap={snap} r={r} />
          {r.perfect ? (
            <Sent>سلسلة مظبوطة! 🎉</Sent>
          ) : canBlame ? (
            <div className="flex flex-col gap-2">
              <div className="text-center font-display font-black text-xl">مين بوّظها؟</div>
              <div className="grid grid-cols-2 gap-2">
                <Btn color={r.myBlame === 'draw' ? 'lime' : 'white'} onClick={() => send('blame', { who: 'draw' })}>
                  الرسّام 🎨 ({r.counts.draw})
                </Btn>
                <Btn color={r.myBlame === 'guess' ? 'lime' : 'white'} onClick={() => send('blame', { who: 'guess' })}>
                  اللي خمّن 🤔 ({r.counts.guess})
                </Btn>
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    const task = v.task;
    if (!task) return <Waiting />;
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="text-center font-display font-black text-ink-muted">{STEP_LABEL[v.step]}</div>
        <GameTimer snap={snap} until={v.until} total={[35000, 60000, 35000][v.step]} />
        {task.done ? (
          <>
            <Sent>اتبعت ✓</Sent>
            <Done ids={v.submitted} snap={snap} label="خلّصوا" />
          </>
        ) : task.kind === 'write' ? (
          <div className="flex flex-col gap-2">
            <Prompt small>اكتب جملة مضحكة يترسم عليها</Prompt>
            <button type="button" onClick={() => setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)])} className="self-start rounded-full bg-white/10 px-3 py-1 font-display font-black">
              عشوائي 🎲
            </button>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (phrase.trim()) send('submit', { step: 0, text: phrase.trim() });
              }}
            >
              <textarea value={phrase} onChange={(e) => setPhrase(e.target.value)} maxLength={50} rows={2} className="rounded-2xl border-4 border-black bg-white p-3 font-display font-black text-xl text-black" />
              <button type="submit" className="press brutal rounded-2xl bg-lime py-3 font-display font-black text-xl text-black">
                ابعت ←
              </button>
            </form>
          </div>
        ) : task.kind === 'draw' ? (
          <div className="flex flex-col gap-2">
            <Prompt small>ارسم: «{task.source?.text || '…'}»</Prompt>
            <DrawPad ref={pad} />
            <Btn color="lime" onClick={() => !pad.current.isEmpty() && send('submit', { step: 1, drawing: pad.current.get() })}>
              ابعت الرسمة ←
            </Btn>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-center font-display font-black">دي رسمة إيه؟</div>
            <Drawing drawing={task.source?.drawing} className="rounded-2xl border-4 border-black" />
            <TextAnswer placeholder="خمّن…" max={50} onSend={(text) => send('submit', { step: 2, text })} />
          </div>
        )}
      </div>
    );
  },
  Big: ({ snap, v }) => {
    if (v.stage === 'reveal' && v.reveal)
      return (
        <div className="flex flex-1 flex-col gap-5">
          <div className="text-center font-display font-black text-3xl">
            سلسلة {v.reveal.r + 1} من {v.reveal.total} {v.reveal.perfect && '· مظبوطة! 🎉'}
          </div>
          <ChainView snap={snap} r={v.reveal} big />
          {!v.reveal.perfect && (
            <div className="flex justify-center gap-6 font-display font-black text-3xl">
              <span>الرسّام 🎨 {v.reveal.counts.draw}</span>
              <span>اللي خمّن 🤔 {v.reveal.counts.guess}</span>
            </div>
          )}
        </div>
      );
    return (
      <div className="flex flex-1 flex-col items-center gap-6">
        <div className="flex gap-3">
          {STEP_LABEL.map((s, i) => (
            <span key={s} className={`rounded-full border-[3px] border-black px-4 py-2 font-display font-black ${i === v.step ? 'bg-cyan text-black shadow-hard-sm' : 'bg-black/40 text-ink-muted'}`}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
        <GameTimer snap={snap} until={v.until} total={[35000, 60000, 35000][v.step]} />
        <Done ids={v.submitted} snap={snap} big label="خلّصوا" />
      </div>
    );
  },
};

// ---------------------------------------------------------------- Herd Mentality
const herd = {
  Phone: ({ snap, v }) => (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt>{v.q}</Prompt>
      <div className="text-center text-sm text-ink-muted">اكتب اللي «أغلب» الناس هتقوله</div>
      <GameTimer snap={snap} />
      {v.myAnswer ? <Sent>«{v.myAnswer}» 🐄</Sent> : <TextAnswer max={40} onSend={(text) => send('answer', { text })} />}
    </div>
  ),
  Big: ({ snap, v }) => (
    <div className="flex flex-1 flex-col items-center gap-6">
      <Prompt big color="pink">{v.q}</Prompt>
      <GameTimer snap={snap} />
      <Done ids={v.answered} snap={snap} big />
    </div>
  ),
};

// ---------------------------------------------------------------- Hot Take
const hotTake = {
  Phone: ({ snap, v }) => (
    <div className="flex flex-1 flex-col gap-4">
      <Prompt>{v.q}</Prompt>
      <GameTimer snap={snap} />
      {v.mine !== null ? (
        <Sent>قيّمتها {v.mine}/10 🌶️</Sent>
      ) : (
        <>
          <div className="flex justify-between text-sm text-ink-muted">
            <span>١ زفت</span>
            <span>١٠ تحفة</span>
          </div>
          <div className="ltr grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => (send('rate', n), sfx.pop())} className="press brutal aspect-square rounded-2xl font-display font-black text-2xl text-black" style={{ background: `hsl(${(n - 1) * 12}, 95%, 55%)` }}>
                {n}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  ),
  Big: ({ snap, v }) => (
    <div className="flex flex-1 flex-col items-center gap-6">
      <div className="font-display font-black text-3xl text-ink-muted">قيّمها من ١ لـ١٠</div>
      <Prompt big color="red">{v.q}</Prompt>
      <GameTimer snap={snap} />
      <Done ids={v.rated} snap={snap} big label="قيّموا" />
    </div>
  ),
};

export default {
  'most-likely-to': mostLikely,
  'would-you-rather': wyr,
  imposter,
  'quip-clash': quipClash,
  'doodle-duel': doodleDuel,
  'big-fat-lie': bigFatLie,
  'drunk-telephone': telephone,
  'herd-mentality': herd,
  'hot-take': hotTake,
};
