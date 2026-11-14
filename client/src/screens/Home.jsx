import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../net.js';
import { T } from '../copy.js';
import { Blobs, Chip, Logo, Menu, TopBar, HEX } from '../ui/kit.jsx';
import { PartyArt, BoatArt } from '../ui/art.jsx';
import { sfx } from '../sound.js';

export function GameCard({ kind, onPick, compact, tilt = 0, selected }) {
  const party = kind === 'party';
  const disabled = false;
  const ring = party ? HEX.magenta : HEX.cyan;
  return (
    <motion.div
      initial={{ y: 30, opacity: 0, rotate: 0 }}
      animate={{ y: 0, opacity: 1, rotate: tilt }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className="relative overflow-hidden rounded-[34px] border-4 border-black shadow-hard"
      style={{ background: '#15152A', outline: `6px solid ${ring}`, outlineOffset: -10 }}
    >
      {party ? <PartyArt height={compact ? 200 : 250} /> : <BoatArt height={compact ? 200 : 250} />}
      <div className="border-t-4 border-black p-5">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{party ? '🎉' : '⛵'}</span>
          <h2 className="font-display font-black text-4xl">{party ? T.partyMix : T.boatName}</h2>
        </div>
        <p className="mt-2 text-ink-muted leading-relaxed">{party ? T.partyMixLong : T.boatLong}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {party ? (
            <>
              <Chip color="magenta">{T.chip2to20}</Chip>
              <Chip color="yellow">{T.chipModes}</Chip>
              <Chip color="lime">{T.chipRoulette}</Chip>
            </>
          ) : (
            <>
              <Chip color="cyan">{T.chip2to12}</Chip>
              <Chip color="yellow">{T.chipDeck}</Chip>
              <Chip color="lime">{T.chipSips}</Chip>
            </>
          )}
        </div>
        {onPick && !selected && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              sfx.pop();
              onPick(kind);
            }}
            className="press brutal mt-5 w-full rounded-2xl bg-white py-3 font-display font-black text-lg text-black disabled:opacity-50"
          >
            {party ? T.ctaParty : T.ctaBoat} {!disabled && '←'}
          </button>
        )}
      </div>
      {disabled && <div className="card-stamp absolute left-6 top-6 rounded-xl bg-bg px-3 py-1 font-display font-black text-red" style={{ borderColor: HEX.red }}>{T.offTonight}</div>}
    </motion.div>
  );
}

function Steps() {
  const items = [
    ['📺', T.step1, 'cyan'],
    ['📱', T.step2, 'yellow'],
    ['🏆', T.step3, 'magenta'],
  ];
  return (
    <div className="flex items-center justify-center gap-3">
      {items.map(([e, txt, c], i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="relative flex items-center gap-3 rounded-2xl border-4 border-black bg-bg-elevated px-4 py-3 shadow-hard" style={{ rotate: `${(i - 1) * 0.6}deg` }}>
            <span className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-black font-display font-black text-sm text-black" style={{ background: HEX[c] }}>
              {i + 1}
            </span>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black text-2xl" style={{ background: HEX[c] }}>
              {e}
            </span>
            <span className="max-w-56 font-display font-black">{txt}</span>
          </div>
          {i < 2 && <span className="text-cyan">•••</span>}
        </div>
      ))}
    </div>
  );
}

export function HomeDesktop({ onPick }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Blobs color="magenta" />
      <TopBar left={<span />} right={<Menu />} />
      <div className="relative z-10 flex flex-1 flex-col items-center gap-6 px-6 pb-8">
        <Logo size="lg" />
        <h1 className="text-stroke font-display font-black text-6xl">{T.pickGameTitle}</h1>
        <p className="-mt-3 text-ink-muted">{T.pickGameSub}</p>
        <div className="grid w-full max-w-4xl grid-cols-2 gap-8">
          <GameCard kind="party" onPick={onPick} />
          <GameCard kind="boat" onPick={onPick} />
        </div>
        <Steps />
        <p className="text-xs text-ink-muted">{T.legal}</p>
      </div>
    </div>
  );
}

function Hype() {
  const list = T.hypes;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % list.length), 3200);
    return () => clearInterval(id);
  }, [list.length]);
  return (
    <div className="relative mx-5 mt-6">
      <motion.div key={i} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[34px] border-4 border-black bg-white p-6 font-display font-black text-3xl leading-snug text-black shadow-hard" style={{ minHeight: 140 }}>
        {list[i % list.length]}
      </motion.div>
      <div className="absolute -bottom-5 right-14 h-8 w-8 rotate-45 border-b-4 border-r-4 border-black bg-white" />
    </div>
  );
}

function Ticket({ color, emoji, stub, title, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} className="press relative flex w-full items-stretch overflow-hidden rounded-[30px] border-4 border-black text-right shadow-hard" style={{ background: color }}>
      <div className="flex w-24 flex-col items-center justify-center gap-1 border-l-4 border-dashed border-black/50 bg-black/15 py-4">
        <span className="text-4xl">{emoji}</span>
        <span className="font-display font-black text-xs tracking-widest text-black/70">{stub}</span>
      </div>
      <div className="flex flex-1 items-center justify-between gap-2 px-4 py-4">
        <div>
          <div className="font-display font-black text-3xl text-black">{title}</div>
          <div className="font-display font-bold text-black/70">{sub}</div>
        </div>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-black text-2xl text-white">←</span>
      </div>
    </button>
  );
}

export function HomePhone({ onJoin, onHost, onPick }) {
  const stickers = T.stickers;
  return (
    <div className="relative min-h-dvh">
      <Blobs color="magenta" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar left={<span />} right={<Menu />} />
        <div className="relative mx-5 mt-4 flex flex-col items-start">
          <Chip color="lime" className="-rotate-3 self-end text-lg">{stickers[0]}</Chip>
          <Logo size="xl" stacked />
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip color="cyan" className="rotate-2 text-base">{stickers[1]}</Chip>
            <Chip color="pink" className="-rotate-2 text-base">{stickers[2]}</Chip>
            <Chip color="red" className="rotate-3 text-base">{stickers[3]}</Chip>
          </div>
        </div>
        <Hype />
        <div className="mt-10 text-center font-display font-black tracking-[0.3em] text-ink-muted">{T.scroll} ↓</div>
        <div className="mt-6 px-5 pb-6">
          <h2 className="mb-1 font-display font-black text-sm uppercase tracking-widest text-ink-muted">{T.twoGames}</h2>
          <h3 className="mb-4 font-display font-black text-3xl">{T.pickGameTitle}</h3>
          <div className="flex flex-col gap-6">
            <GameCard kind="party" onPick={onPick} compact />
            <GameCard kind="boat" onPick={onPick} compact />
          </div>
          <div className="mt-8 rounded-3xl border-[3px] border-white/15 bg-black/30 p-5">
            <h4 className="mb-2 font-display font-black text-xl">{T.houseRules}</h4>
            <ul className="list-disc space-y-1 pr-5 text-ink-muted">
              {T.houseRule.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <p className="mt-4 text-center text-xs text-ink-muted">{T.legal}</p>
        </div>
        <div className="dock-bottom z-20 mt-auto flex flex-col gap-3 bg-gradient-to-t from-bg via-bg/90 to-transparent px-4 pt-6">
          <Ticket color={HEX.cyan} emoji="🎟️" stub={T.admit} title={T.joinAParty} sub={T.joinSub} onClick={onJoin} />
          <Ticket color={`linear-gradient(90deg, ${HEX.violet}, ${HEX.magenta})`} emoji="🎉" stub={T.vip} title={T.hostAParty} sub={T.hostSub} onClick={onHost} />
        </div>
      </div>
    </div>
  );
}

export function PickGamePhone({ onBack, onPick }) {
  return (
    <div className="relative min-h-dvh">
      <Blobs color="magenta" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar left={<button type="button" onClick={onBack} className="press rounded-full border-2 border-white/15 bg-[#1e2540] px-4 py-2 font-display font-black">→ {T.back}</button>} right={<Menu />} />
        <div className="px-5 pb-10">
          <h1 className="shout mb-5 font-display font-black">{T.pickGameTitle}</h1>
          <div className="flex flex-col gap-6">
            <GameCard kind="party" onPick={onPick} compact />
            <GameCard kind="boat" onPick={onPick} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
