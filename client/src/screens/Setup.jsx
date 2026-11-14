import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { api, getState, useStore, STICKERS, COLORS } from '../net.js';
import { T } from '../copy.js';
import { Blobs, Btn, HEX, Logo, Menu, TopBar, BackBtn, Toggle, darkText } from '../ui/kit.jsx';
import { GameCard } from './Home.jsx';
import { sfx, haptic } from '../sound.js';

export function VibeList({ mode, setMode }) {
  return (
    <div className="flex flex-col gap-4">
      {['lite', 'medium', 'hardcore'].map((m, i) => {
        const M = T.modes[m];
        const on = mode === m;
        return (
          <motion.button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              sfx.tap();
              haptic.light();
            }}
            animate={{ scale: on ? 1.02 : 1, rotate: on ? -0.6 : 0 }}
            className={`rounded-[30px] border-4 border-black p-4 text-right ${on ? 'shadow-hard' : ''}`}
            style={{ background: on ? HEX[M.color] : '#15152A', color: on && darkText(M.color) ? '#000' : '#fff' }}
          >
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-black text-4xl" style={{ background: on ? '#fff' : HEX[M.color] }}>
                {M.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-display font-black text-3xl">{M.label}</div>
                <div className={on ? 'opacity-80' : 'text-ink-muted'}>{M.desc}</div>
              </div>
              <span className="flex items-end gap-1" aria-hidden>
                {[0, 1, 2].map((k) => (
                  <span key={k} className="w-2.5 rounded-full border-2 border-black" style={{ height: 14 + k * 10, background: k <= i ? (on ? '#000' : HEX[M.color]) : 'transparent' }} />
                ))}
              </span>
            </div>
            {on && <div className="mt-3 rounded-2xl bg-black p-3 text-sm font-bold text-white">📝 {M.more}</div>}
          </motion.button>
        );
      })}
    </div>
  );
}

export function BoatSteps() {
  const colors = ['red', 'cyan', 'violet', 'yellow', 'blue'];
  return (
    <ol className="flex flex-col gap-3">
      {T.boatSteps.map(([e, title, desc], i) => (
        <li key={title} className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-[3px] border-black text-2xl shadow-hard-sm" style={{ background: HEX[colors[i]] }}>
            {e}
          </span>
          <div>
            <div className="font-display font-black text-lg">
              {i + 1}. {title}
            </div>
            <div className="text-sm text-ink-muted">{desc}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// Desktop: the chosen game card on one side, its setup on the other, then open a big-screen room.
export function SetupDesktop({ game, onBack }) {
  const [mode, setMode] = useState('medium');
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      await api.hostOnScreen({ mode, format: game });
      sfx.pop();
    } catch {
      sfx.buzz();
      setBusy(false);
    }
  };
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Blobs color={game === 'boat' ? 'cyan' : T.modes[mode].color} />
      <TopBar left={<Logo size="sm" />} right={<Menu />} />
      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 grid-cols-2 items-center gap-10 px-8 pb-10">
        <div>
          <button type="button" onClick={onBack} className="press mb-4 rounded-full border-2 border-white/15 bg-[#1e2540] px-4 py-2 font-display font-black">
            → {T.changeGame}
          </button>
          <GameCard kind={game} tilt={1.2} selected />
        </div>
        <div className="rounded-[34px] border border-white/15 bg-white/5 p-7 backdrop-blur">
          {game === 'party' ? (
            <>
              <h2 className="mb-5 font-display font-black text-4xl">{T.pickVibe}</h2>
              <VibeList mode={mode} setMode={setMode} />
              <Btn color={T.modes[mode].color} size="xl" className="mt-6 w-full" onClick={open} disabled={busy}>
                {T.openParty}
              </Btn>
            </>
          ) : (
            <>
              <h2 className="mb-5 font-display font-black text-4xl">{T.boatSetupTitle}</h2>
              <BoatSteps />
              <Btn color="cyan" size="xl" className="mt-6 w-full" onClick={open} disabled={busy}>
                {T.openBoat}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function VibePhone({ onBack, onNext, mode, setMode }) {
  return (
    <div className="relative min-h-dvh">
      <Blobs color={T.modes[mode].color} />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar left={<BackBtn onClick={onBack} />} right={<Menu />} />
        <div className="px-5">
          <h1 className="shout font-display font-black">{T.vibeTitle}</h1>
          <p className="mt-2 text-lg text-ink-muted">{T.vibeLater}</p>
          <div className="mt-6">
            <VibeList mode={mode} setMode={setMode} />
          </div>
        </div>
        <div className="dock-bottom mt-auto px-5 pt-6">
          <Btn color={T.modes[mode].color} size="xl" className="w-full" onClick={onNext}>
            {T.next} ←
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function BoatSetupPhone({ onBack, onNext }) {
  return (
    <div className="relative min-h-dvh">
      <Blobs color="cyan" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar left={<BackBtn onClick={onBack} />} right={<Menu />} />
        <div className="px-5">
          <h1 className="shout mb-6 font-display font-black">{T.boatSetupTitle}</h1>
          <BoatSteps />
        </div>
        <div className="dock-bottom mt-auto px-5 pt-6">
          <Btn color="cyan" size="xl" className="w-full" onClick={onNext}>
            {T.next} ←
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ join by code
export function JoinCode({ onBack, onFound, onHost, initial = '' }) {
  const [code, setCode] = useState(initial);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  useEffect(() => ref.current?.focus(), []);
  const go = async (c = code) => {
    if (c.length !== 4 || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.peek(c);
      if (!r.ok) throw new Error(r.error);
      sfx.win();
      onFound(r);
    } catch {
      sfx.buzz();
      haptic.heavy();
      setErr(T.partyGone);
      setBusy(false);
    }
  };
  useEffect(() => {
    if (code.length === 4) go(code);
  }, [code]);
  return (
    <div className="relative min-h-dvh">
      <Blobs color="cyan" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar left={<BackBtn onClick={onBack} />} right={<Menu />} />
        <div className="px-5">
          <div className="flex items-center gap-4">
            <span className="text-6xl">🎟️</span>
            <div>
              <h1 className="font-display font-black text-4xl">{T.codeTitle}</h1>
              <p className="text-lg text-ink-muted">{T.codeSub}</p>
            </div>
          </div>
          <label className={`relative mt-8 block ${err ? 'shake' : ''}`}>
            <input
              ref={ref}
              value={code}
              onChange={(e) => {
                setErr(null);
                setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4));
              }}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              onKeyDown={(e) => e.key === 'Enter' && go()}
              aria-label={T.roomCode}
              className="absolute inset-0 h-full w-full opacity-0"
            />
            <div className="ltr pointer-events-none grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex aspect-square items-center justify-center rounded-3xl border-4 border-black bg-white font-display font-black text-5xl text-black shadow-hard">
                  {code[i] ?? (i === code.length ? <span className="caret text-black/40">|</span> : <span className="h-3 w-3 rounded-full bg-black/15" />)}
                </div>
              ))}
            </div>
          </label>
          {err && <p className="mt-4 text-center font-display font-black text-red">{err}</p>}
          {busy && <p className="mt-4 text-center text-ink-muted">{T.lookingForParty}</p>}
        </div>
        <div className="dock-bottom mt-auto px-5 pt-6">
          <Btn color="cyan" size="xl" className="w-full" disabled={code.length !== 4 || busy} onClick={() => go()}>
            {T.joinThisParty} 🚀
          </Btn>
          <p className="mt-4 text-center text-ink-muted">
            {T.noCodeYet}{' '}
            <button type="button" onClick={onHost} className="font-display font-black text-ink underline underline-offset-4">
              {T.hostAParty} ←
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ name tag / look
export function Profile({ title, onBack, onDone, room, busy }) {
  const { identity, error } = useStore();
  const [tab, setTab] = useState('colour');
  const name = identity.name ?? '';
  const ok = name.trim().length > 0;
  const submit = () => {
    if (!ok) return;
    onDone();
  };
  return (
    <div className="relative min-h-dvh">
      <Blobs color={identity.color} />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar left={<BackBtn onClick={onBack} />} right={<Menu />} />
        <div className="px-5 pb-4">
          {room && (
            <div className="mb-4 rounded-3xl border-[3px] border-white/15 bg-black/30 p-4">
              <div className="font-display font-black text-xl">
                {T.invitedTitle} <span className="ltr text-lime">{room.code}</span>
              </div>
              <div className="text-sm text-ink-muted">
                {room.players.length} {T.alreadyIn}
                {room.phase !== 'lobby' && ` · ${T.inProgress}`}
              </div>
              <div className="mt-2 flex -space-x-2 space-x-reverse">
                {room.players.slice(0, 10).map((p, i) => (
                  <span key={i} className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-black text-sm" style={{ background: HEX[p.color] }}>
                    {p.sticker}
                  </span>
                ))}
              </div>
            </div>
          )}
          <h1 className="mb-4 font-display font-black text-4xl">{title}</h1>
          {/* the "HELLO my name is" sticker */}
          <div className="overflow-hidden rounded-[30px] border-4 border-black bg-white text-black shadow-hard">
            <div className="py-3 text-center" style={{ background: HEX[identity.color] }}>
              <div className="font-display font-black text-3xl tracking-widest" style={{ color: darkText(identity.color) ? '#000' : '#fff' }}>
                {T.hello}
              </div>
              <div className="font-display font-black text-xs tracking-[0.3em]" style={{ color: darkText(identity.color) ? '#000' : '#fff' }}>
                {T.myNameIs}
              </div>
            </div>
            <div className="flex items-center gap-3 p-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[30%] border-[3px] border-black text-4xl" style={{ background: HEX[identity.color] }}>
                {identity.sticker}
              </span>
              <input
                value={name}
                maxLength={16}
                placeholder={T.namePlaceholder}
                onChange={(e) => api.setIdentity({ name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                enterKeyHint="done"
                autoComplete="nickname"
                className="min-w-0 flex-1 bg-transparent font-display font-black text-3xl outline-none placeholder:text-black/25"
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1">
            <button type="button" onClick={() => api.shuffleLook()} className="press brutal rounded-2xl bg-white py-3 font-display font-black text-black">
              🎲 {T.shuffle}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-full border-2 border-white/15 bg-white/5 p-1">
            {['colour', 'sticker'].map((k) => (
              <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-full py-2 font-display font-black ${tab === k ? 'bg-white text-black' : 'text-ink-muted'}`}>
                {k === 'colour' ? T.colourTab : T.stickerTab}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-5 gap-3">
            {tab === 'colour'
              ? COLORS.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => api.setIdentity({ color: c })} className="aspect-[4/3] rounded-2xl border-[3px] border-black shadow-hard-sm" style={{ background: HEX[c], outline: identity.color === c ? '4px solid #fff' : 'none', outlineOffset: 2 }}>
                    {identity.color === c && <span className="text-xl">✓</span>}
                  </button>
                ))
              : STICKERS.map((s) => (
                  <button key={s} type="button" onClick={() => api.setIdentity({ sticker: s })} className="flex aspect-square items-center justify-center rounded-2xl border-[3px] border-black text-3xl" style={{ background: identity.sticker === s ? '#fff' : '#ffffff14' }}>
                    {s}
                  </button>
                ))}
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {error && <p className="text-center font-display font-black text-red">{T.errors[error] ?? error}</p>}
          </div>
        </div>
        <div className="dock-bottom mt-auto px-5 pt-4">
          <Btn color={ok ? identity.color : 'dark'} size="xl" className="w-full" disabled={!ok || busy} onClick={submit}>
            {ok ? `${T.imIn} 🚀` : T.typeName}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export { getState };
