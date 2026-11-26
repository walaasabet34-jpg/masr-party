import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, useStore } from '../net.js';
import { capture } from '../posthog.js';
import { T } from '../copy.js';
import { Avatar, Blobs, Btn, Chip, CodeTiles, Countdown, HEX, HoldButton, Logo, Menu, NameTag, Qr, Toggle, TopBar, darkText, playerMap, useGameMeta, useMetas, useNow, useIsBig } from '../ui/kit.jsx';
import { ResultTable, Reveal, Gallery } from './Results.jsx';
import { GAME_UI } from '../games/index.js';
import { BoatBig, BoatPhone } from './Boat.jsx';
import { sfx, haptic } from '../sound.js';
import { ChatButton, ChatSheet, ChatSide, ChatToast, useChatSound } from '../ui/Chat.jsx';

const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let lanOrigin = null;
const joinOrigin = () => (isLocal() && lanOrigin ? lanOrigin : location.origin);
// how a guest arrived is kept as utm_medium so a guest who later hosts their own room is counted as
// spread from an invite, not as a visitor from an ad or a post
const joinUrl = (code, medium = 'qr') => `${joinOrigin()}/?join=${code}&utm_source=host&utm_medium=${medium}`;
const joinHost = () => joinOrigin().replace(/^https?:\/\//, '');
const isControl = (snap) => snap.role === 'display' || snap.hostId === snap.me;

export function RoomView({ snap }) {
  const { lanUrls } = useMetas();
  lanOrigin = lanUrls?.[0] ?? null;
  return snap.role === 'display' ? <BigShell snap={snap} /> : <PhoneShell snap={snap} />;
}

// ======================================================================= shells
function accentFor(snap, meta) {
  if (snap.settings.format === 'boat') return 'cyan';
  if (meta && (snap.phase === 'playing' || snap.phase === 'intro')) return meta.color;
  return T.modes[snap.settings.mode].color;
}

function BigShell({ snap }) {
  useChatSound();
  const meta = useGameMeta(snap.currentGameId ?? snap.nextGameId);
  const color = accentFor(snap, meta);
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Blobs color={color} />
      <TopBar
        left={
          <div className="flex items-center gap-4">
            <Logo size="sm" />
            {snap.phase !== 'lobby' && (
              <span className="ltr rounded-full border-2 border-white/20 bg-black/40 px-3 py-1 font-display font-black">
                {joinHost()}/?join=<span className="text-lime">{snap.code}</span>
              </span>
            )}
          </div>
        }
        right={
          <>
            <ChatButton />
            <Menu extra={(close) => <HostMenuItems snap={snap} close={close} />} />
          </>
        }
      />
      <ChatToast />
      <div className="relative z-10 flex flex-1">
      <div className="flex min-w-0 flex-1 flex-col px-8 pb-6">
        <PausedBanner snap={snap} />
        <AnimatePresence mode="wait">
          <motion.div key={snap.phase + (snap.phase === 'playing' ? snap.round : '')} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} className="flex flex-1 flex-col">
            {snap.phase === 'lobby' && <LobbyBig snap={snap} />}
            {snap.phase === 'briefing' && <BriefingBig snap={snap} />}
            {snap.phase === 'intro' && <Intro snap={snap} big />}
            {snap.phase === 'playing' && <PlayBig snap={snap} />}
            {snap.phase === 'boat' && <BoatBig snap={snap} />}
            {snap.phase === 'ended' && <Ended snap={snap} big />}
          </motion.div>
        </AnimatePresence>
      </div>
      <ChatSide snap={snap} readOnly />
      </div>
    </div>
  );
}

function PhoneShell({ snap }) {
  useChatSound();
  const wide = useIsBig();
  const P = playerMap(snap);
  const me = P[snap.me];
  const meta = useGameMeta(snap.currentGameId ?? snap.nextGameId);
  const color = snap.phase === 'lobby' ? me?.color ?? 'magenta' : accentFor(snap, meta);
  return (
    <div className="relative flex min-h-dvh flex-col">
      <Blobs color={color} />
      <TopBar
        left={
          <div className="flex items-center gap-2">
            <Avatar p={me} size={40} />
            <span className="ltr rounded-full bg-black/40 px-3 py-1 font-display font-black text-lime">{snap.code}</span>
            {snap.phase !== 'lobby' && snap.round > 0 && snap.settings.format === 'party' && <RoundChip snap={snap} />}
          </div>
        }
        right={
          <>
            <ChatButton />
            <Menu extra={(close) => <PhoneMenuItems snap={snap} close={close} />} />
          </>
        }
      />
      <ChatToast />
      {!wide && <ChatSheet snap={snap} />}
      <div className="relative z-10 flex flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <PausedBanner snap={snap} />
        <ClaimOverlay snap={snap} />
        <AnimatePresence mode="wait">
          <motion.div key={snap.phase + (snap.phase === 'playing' ? snap.round : '')} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="flex flex-1 flex-col">
            {snap.phase === 'lobby' && <LobbyPhone snap={snap} />}
            {snap.phase === 'briefing' && <BriefingPhone snap={snap} />}
            {snap.phase === 'intro' && <Intro snap={snap} />}
            {snap.phase === 'playing' && <PlayPhone snap={snap} />}
            {snap.phase === 'boat' && <BoatPhone snap={snap} />}
            {snap.phase === 'ended' && <Ended snap={snap} />}
          </motion.div>
        </AnimatePresence>
      </div>
      {wide && <ChatSide snap={snap} />}
      </div>
    </div>
  );
}

function RoundChip({ snap }) {
  const total = snap.settings.totalRounds;
  return <span className="rounded-full bg-black/40 px-3 py-1 font-display font-black text-sm">{total ? T.roundOfN(snap.round, total) : T.roundN(snap.round)}</span>;
}

// ======================================================================= menus
function Confirm({ label, sure, onDo, danger }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" onClick={() => (armed ? onDo() : setArmed(true))} className={`rounded-2xl px-3 py-2 text-right font-display font-black ${armed || danger ? 'bg-red text-white' : 'bg-white/10'}`}>
      {armed ? sure : label}
    </button>
  );
}

function HostMenuItems({ snap, close }) {
  return (
    <>
      <div className="text-xs font-bold tracking-wider text-ink-muted">{T.hostControls}</div>
      {snap.phase === 'playing' && (
        <button type="button" onClick={() => (api.skipRound(), close())} className="rounded-2xl bg-white/10 px-3 py-2 text-right">
          <div className="font-display font-black">{T.skipRound}</div>
          <div className="text-xs text-ink-muted">{T.skipRoundHint}</div>
        </button>
      )}
      {snap.phase === 'lobby' && <Toggle on={snap.settings.locked} onChange={(v) => api.settings({ locked: v })} label={T.lockRoom} sub={T.lockRoomHint} />}
      {snap.phase !== 'lobby' && <RemovePlayers snap={snap} />}
      {snap.phase !== 'lobby' && snap.phase !== 'ended' && <Confirm label={T.endNight} sure={T.endSure} onDo={() => (api.end(), close())} />}
      {snap.phase !== 'lobby' && <button type="button" onClick={() => (api.toLobby(), close())} className="rounded-2xl bg-white/10 px-3 py-2 text-right font-display font-black">{T.backToLobby}</button>}
      {snap.role === 'display' && <Confirm label={T.newParty} sure={T.leaveSure} onDo={() => api.leave()} />}
    </>
  );
}

// Every player but the host, all through the round (also ones who already finished their turn).
function RemovePlayers({ snap }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(null);
  const others = snap.players.filter((p) => p.id !== snap.hostId);
  if (!others.length) return null;
  const who = others.find((p) => p.id === asking);
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2">
      <button type="button" onClick={() => (setOpen(!open), setAsking(null))} className="flex w-full items-center justify-between font-display font-black">
        <span>👥 {T.removePlayers}</span>
        <span className="text-sm text-ink-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && !who && (
        <div className="mt-2 flex flex-col gap-1">
          <div className="text-xs text-ink-muted">{T.removePlayersHint}</div>
          {others.map((p) => (
            <button key={p.id} type="button" onClick={() => setAsking(p.id)} className={`flex items-center gap-2 rounded-xl bg-black/30 px-2 py-1.5 text-right ${p.connected ? '' : 'opacity-60'}`}>
              <Avatar p={p} size={28} />
              <span className="font-display font-black">{p.name}</span>
            </button>
          ))}
        </div>
      )}
      {open && who && (
        <div className="mt-2 rounded-xl border-2 border-red/60 bg-black/40 p-3" role="alertdialog" aria-label={T.removeAsk(who.name)}>
          <div className="font-display font-black">{T.removeAsk(who.name)}</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => (api.kick(who.id), setAsking(null))} className="rounded-xl bg-red px-2 py-2 font-display font-black text-white">
              {T.removeYes}
            </button>
            <button type="button" onClick={() => setAsking(null)} className="rounded-xl bg-white/15 px-2 py-2 font-display font-black">
              {T.removeNo}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhoneMenuItems({ snap, close }) {
  return (
    <>
      {isControl(snap) && <HostMenuItems snap={snap} close={close} />}
      <Confirm label={T.leaveRoom} sure={snap.hostId === snap.me ? T.leaveSureHost : T.leaveSure} onDo={() => api.leave()} />
    </>
  );
}

// ======================================================================= lobby
function Seats({ snap, big }) {
  const P = snap.players;
  const max = snap.settings.format === 'boat' ? 4 : 20;
  const [kick, setKick] = useState(null);
  return (
    <div className={`grid gap-3 ${big ? 'grid-cols-4 xl:grid-cols-5' : 'grid-cols-3'}`}>
      <AnimatePresence>
        {P.map((p) => (
          <motion.button
            type="button"
            layout
            key={p.id}
            initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            onClick={() => isControl(snap) && p.id !== snap.hostId && setKick(kick === p.id ? null : p.id)}
            className={`relative flex flex-col items-center gap-1 rounded-3xl border-[3px] border-black p-2 ${p.connected ? '' : 'opacity-40'}`}
            style={{ background: HEX[p.color] }}
          >
            <span className={big ? 'text-5xl' : 'text-3xl'}>{p.sticker}</span>
            <span className="max-w-full truncate font-display font-black" style={{ color: darkText(p.color) ? '#000' : '#fff' }}>
              {p.name}
            </span>
            {p.id === snap.hostId && <span className="absolute -top-2 left-1 rounded-full border-2 border-black bg-white px-1.5 text-[10px] font-black text-black">{T.hostTag}</span>}
            {kick === p.id && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  api.kick(p.id);
                  setKick(null);
                }}
                className="absolute inset-0 flex items-center justify-center rounded-3xl bg-red font-display font-black text-white"
              >
                {T.remove} ✕
              </span>
            )}
          </motion.button>
        ))}
      </AnimatePresence>
      {P.length < max &&
        Array.from({ length: Math.max(1, (big ? 4 : 3) - (P.length % (big ? 4 : 3))) }).map((_, i) => (
          <div key={'e' + i} className="flex min-h-20 items-center justify-center rounded-3xl border-[3px] border-dashed border-white/20 text-2xl text-white/20">
            ?
          </div>
        ))}
    </div>
  );
}

function GamesPicker({ snap, onClose }) {
  const { list } = useMetas();
  const enabled = snap.settings.enabledGames.length ? new Set(snap.settings.enabledGames) : new Set(list.map((g) => g.id));
  const classics = list.filter((g) => !g.isNew).map((g) => g.id);
  const preset = enabled.size === list.length ? 'everything' : enabled.size === classics.length && classics.every((id) => enabled.has(id)) ? 'classics' : 'custom';
  const [warn, setWarn] = useState(false);
  const send = (set) => {
    if (![...set].some((id) => id !== 'roulette')) {
      setWarn(true);
      sfx.buzz();
      setTimeout(() => setWarn(false), 1800);
      return;
    }
    api.settings({ enabledGames: set.size === list.length ? [] : [...set] });
  };
  const n = snap.players.filter((p) => p.connected).length;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()} className="scroll-y max-h-[88dvh] w-full max-w-3xl rounded-t-[34px] border-4 border-black bg-bg-elevated p-5 shadow-hard sm:rounded-[34px]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display font-black text-3xl">
            🎮 {T.games} <span className="text-ink-muted text-lg">{enabled.size}/{list.length}</span>
          </h2>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full bg-white/10 font-black">
            ✕
          </button>
        </div>
        <div className="mb-3 grid grid-cols-3 rounded-full border-2 border-black bg-black/45 p-1">
          {[
            ['classics', T.presetClassics],
            ['everything', T.presetEverything],
            ['custom', T.presetCustom],
          ].map(([id, label]) => (
            <button key={id} type="button" disabled={id === 'custom'} onClick={() => send(new Set(id === 'everything' ? list.map((g) => g.id) : classics))} className={`rounded-full py-2 font-display font-black ${preset === id ? 'bg-white text-black' : 'text-ink-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className={`mb-3 text-sm ${warn ? 'shake font-black text-red' : 'text-ink-muted'}`}>{warn ? T.needOneGame : T.tapToToggle}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((g) => {
            const on = enabled.has(g.id);
            const tooFew = g.minPlayers > Math.max(2, n);
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  const s = new Set(enabled);
                  on ? s.delete(g.id) : s.add(g.id);
                  send(s);
                  sfx.tap();
                }}
                className={`flex items-center gap-2 rounded-2xl border-[3px] border-black p-2 text-right ${on ? 'shadow-hard-sm' : 'opacity-45'}`}
                style={{ background: on ? HEX[g.color] : '#0b0b12', color: on && darkText(g.color) ? '#000' : '#fff' }}
              >
                <span className="text-2xl">{g.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-black text-sm">{g.name}</span>
                  <span className="block text-[11px] opacity-75">
                    {T.kinds[g.kind]} · {T.minPlayersN(g.minPlayers)} {tooFew && '⚠️'}
                  </span>
                </span>
                {g.isNew && <span className="rounded-full bg-black px-1.5 text-[10px] font-black text-lime">{T.newTag}</span>}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

function SettingsPanel({ snap }) {
  const [games, setGames] = useState(false);
  const { list } = useMetas();
  const party = snap.settings.format === 'party';
  const n = snap.settings.enabledGames.length || list.length;
  const est = (r) => {
    const m = r * 2;
    return m >= 60 ? `حوالي ${Math.round((m / 60) * 2) / 2} ساعة` : `حوالي ${m} دقيقة`;
  };
  if (!party) return <div className="rounded-2xl bg-black/30 p-4 text-sm">٢ ضد بعض، أو ٤ في فريقين: الأول والتالت فريق، والتاني والرابع فريق. اللعب لحد ١٠١ نقطة، وكل واحد بيشوف ورقه بس.</div>;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {['lite', 'medium', 'hardcore'].map((m) => {
          const M = T.modes[m];
          const on = snap.settings.mode === m;
          return (
            <button key={m} type="button" onClick={() => api.settings({ mode: m })} className={`rounded-2xl border-[3px] border-black px-2 py-2 font-display font-black ${on ? 'shadow-hard-sm' : 'bg-black/40 text-ink-muted'}`} style={on ? { background: HEX[M.color], color: '#000' } : {}}>
              {M.icon} {M.label}
            </button>
          );
        })}
      </div>
      {/* decided before the night starts, so it sits up here and not below the fold */}
      <Toggle on={snap.settings.missions} onChange={(v) => api.settings({ missions: v })} label={`🕶️ ${T.missions}`} sub={T.missionsAbout} />
      <button type="button" onClick={() => setGames(true)} className="flex items-center justify-between rounded-2xl border-[3px] border-black bg-white/10 px-4 py-3 font-display font-black">
        <span>
          🎮 {T.games} <span className="text-ink-muted">{n} {T.gamesOn}</span>
        </span>
        <span>←</span>
      </button>
      <div>
        <div className="mb-1 text-xs font-bold tracking-wider text-ink-muted">🔁 {T.rounds}</div>
        <button type="button" onClick={() => api.settings({ totalRounds: 5 })} className={`mb-2 flex w-full items-center justify-between rounded-2xl border-[3px] border-black px-4 py-2 font-display font-black ${snap.settings.totalRounds === 5 ? 'bg-lime text-black shadow-hard-sm' : 'bg-black/40'}`}>
          <span>⚡ {T.quickNight}</span>
          <span className="text-sm opacity-80">{T.quickNightAbout}</span>
        </button>
        <div className="grid grid-cols-5 gap-2">
          {[10, 15, 20, 30, 0].map((r) => {
            const on = snap.settings.totalRounds === r;
            return (
              <button key={r} type="button" onClick={() => api.settings({ totalRounds: r })} className={`rounded-2xl border-[3px] border-black py-2 font-display font-black text-lg ${on ? 'bg-lime text-black shadow-hard-sm' : 'bg-black/40'}`}>
                {r === 0 ? '∞' : r}
              </button>
            );
          })}
        </div>
        <div className="mt-1 text-xs text-ink-muted">{snap.settings.totalRounds ? est(snap.settings.totalRounds) : T.endless} · {T.roundsNote}</div>
      </div>
      {games && <GamesPicker snap={snap} onClose={() => setGames(false)} />}
    </div>
  );
}

// One line right above "start": the host sees whether secret missions are on without scrolling,
// and can flip it there.
function MissionsLine({ snap }) {
  if (snap.settings.format !== 'party') return null;
  const on = snap.settings.missions;
  return (
    <button type="button" onClick={() => api.settings({ missions: !on })} className="mb-2 w-full rounded-2xl border-2 border-white/15 bg-bg-elevated px-3 py-2 text-center text-sm font-bold">
      🕶️ {on ? T.missionsLineOn : T.missionsLineOff}
    </button>
  );
}

function LobbyBig({ snap }) {
  const count = snap.players.filter((p) => p.connected).length;
  const ok = snap.settings.format === 'boat' ? [2, 4].includes(count) : count >= 2;
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,320px)_1fr_minmax(0,380px)] gap-8">
      <div className="flex flex-col items-center gap-4">
        <div className="font-display font-black text-2xl">{T.scanToJoin}</div>
        <Qr text={joinUrl(snap.code)} size={280} />
        <div className="text-ink-muted">{T.orOpen}</div>
        <div className="ltr font-display font-black text-lg">{joinHost()}</div>
        <CodeTiles code={snap.code} />
        {snap.settings.locked && <Chip color="red">🔒 {T.lockRoom}</Chip>}
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="font-display font-black text-4xl">
          {snap.settings.format === 'boat' ? `🃏 ${T.boatName}` : `🎉 ${T.partyMix}`} <span className="text-ink-muted text-2xl">· {snap.players.length}</span>
        </h2>
        {snap.players.length ? <Seats snap={snap} big /> : <div className="flex flex-1 items-center justify-center font-display font-black text-3xl text-ink-muted">{T.waitingForPlayers}</div>}
      </div>
      <div className="flex flex-col gap-4 rounded-[34px] border border-white/15 bg-white/5 p-5">
        <SettingsPanel snap={snap} />
        {snap.settings.format === 'boat' && (
          <div className="font-display font-black text-xl text-ink-muted">{T.chip2to12} · {T.chipDeck}</div>
        )}
        <div className="mt-auto">
          <MissionsLine snap={snap} />
          {ok ? <HoldButton label={`${T.startNight} 🚀`} onDone={api.start} color={snap.settings.format === 'boat' ? 'cyan' : T.modes[snap.settings.mode].color} className="w-full" /> : <Btn color="dark" size="lg" className="w-full" disabled>{snap.settings.format === 'boat' ? 'محتاجين ٢ أو ٤ لاعيبة متصلين' : `${T.needPlayers} ٢`}</Btn>}
          {ok && <div className="mt-2 text-center text-xs text-ink-muted">{T.holdToStart}</div>}
        </div>
      </div>
    </div>
  );
}

function LobbyPhone({ snap }) {
  const P = playerMap(snap);
  const me = P[snap.me];
  const control = isControl(snap);
  const { identity } = useStore();
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const count = snap.players.filter((p) => p.connected).length;
  const ok = snap.settings.format === 'boat' ? [2, 4].includes(count) : count >= 2;
  const share = async () => {
    const url = joinUrl(snap.code, 'invite');
    capture('share_clicked', { method: navigator.share ? 'native' : 'copy', player_count: count, phase: snap.phase });
    try {
      if (navigator.share) await navigator.share({ title: T.appName, text: `تعالى العب معانا «${T.appName}» 🎉`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  };
  return (
    <div className="flex flex-1 flex-col px-5">
      {control ? (
        <>
          <div className="flex flex-col items-center gap-3 rounded-[30px] border-4 border-black bg-bg-elevated p-4 shadow-hard">
            <div className="text-sm text-ink-muted">{T.roomCode}</div>
            <CodeTiles code={snap.code} size="md" />
            <div className="text-center text-sm text-ink-muted">{T.shareHint}</div>
            <div className="grid w-full grid-cols-2 gap-2">
              <Btn size="sm" onClick={share}>
                {copied ? T.copied : '📤 ابعت'}
              </Btn>
              <Btn
                size="sm"
                color="dark"
                onClick={() => {
                  if (!showQr) capture('share_clicked', { method: 'qr', player_count: count, phase: snap.phase });
                  setShowQr(!showQr);
                }}
              >
                ▦ QR
              </Btn>
            </div>
            {showQr && <Qr text={joinUrl(snap.code)} size={230} />}
          </div>
          <h3 className="mb-2 mt-5 font-display font-black text-xl">
            {T.players} · {snap.players.length}
          </h3>
          <Seats snap={snap} />
          <div className="mt-5">
            <p className="mb-3 text-center text-sm text-ink-muted">{snap.settings.format === 'boat' ? T.chip2to12 : `${T.twoPlayersHint} ${T.duoGamesHint}`}</p>
            <SettingsPanel snap={snap} />
          </div>
          <div className="dock-bottom mt-auto pt-5">
            <MissionsLine snap={snap} />
            {ok ? <HoldButton label={`${T.startNight} 🚀`} onDone={api.start} color={snap.settings.format === 'boat' ? 'cyan' : T.modes[snap.settings.mode].color} className="w-full" /> : <Btn color="dark" size="lg" className="w-full" disabled>{snap.settings.format === 'boat' ? 'محتاجين ٢ أو ٤ لاعيبة متصلين' : `${T.needPlayers} ٢`}</Btn>}
            {ok && <div className="mt-2 text-center text-xs text-ink-muted">{T.holdToStart}</div>}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-5 pt-6 text-center">
          <motion.div initial={{ scale: 0.5, rotate: -8 }} animate={{ scale: 1, rotate: -2 }} className="w-full overflow-hidden rounded-[30px] border-4 border-black bg-white text-black shadow-hard">
            <div className="py-2" style={{ background: HEX[me?.color] }}>
              <div className="font-display font-black text-2xl">{T.hello}</div>
            </div>
            <div className="flex items-center justify-center gap-3 p-5">
              <span className="text-6xl">{me?.sticker}</span>
              <span className="font-display font-black text-4xl">{me?.name}</span>
            </div>
          </motion.div>
          <h1 className="font-display font-black text-4xl">{T.youreIn}</h1>
          <p className="text-lg text-ink-muted">{T.waitingForHost}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {snap.players.map((p) => (
              <Avatar key={p.id} p={p} size={40} />
            ))}
          </div>
          <div className="mt-auto w-full pb-6">
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================= briefing
function statusOf(snap, p) {
  return { kind: snap.ready.includes(p.id) ? 'ready' : snap.steps[p.id] ?? 'results' };
}
const ORDER = { results: 0, rules: 1, ready: 2 };

function ReadyList({ snap, big }) {
  const control = isControl(snap);
  const people = snap.players.filter((p) => !p.excluded).map((p) => ({ p, s: statusOf(snap, p) }));
  people.sort((a, b) => ORDER[a.s.kind] - ORDER[b.s.kind]);
  const waiting = people.filter((x) => x.s.kind !== 'ready').length;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`font-display font-black ${big ? 'text-2xl' : 'text-xl'} ${waiting ? '' : 'animate-pulse text-lime'}`}>{waiting ? `⏳ ${T.waitingForN(waiting)}` : T.everyoneSet}</div>
      <div className="flex flex-wrap justify-center gap-2">
        {people.map(({ p, s }) => {
          const label = !p.connected ? T.stAway : s.kind === 'ready' ? T.stReady : s.kind === 'rules' ? T.stRules : T.stResults;
          return (
            <button
              key={p.id}
              type="button"
              disabled
              className={`flex items-center gap-2 rounded-2xl border-[3px] border-black py-1 pl-3 pr-1.5 text-right ${s.kind === 'ready' ? 'bg-lime/90 text-black opacity-80' : 'bg-white text-black shadow-hard-sm'}`}
            >
              <Avatar p={p} size={28} />
              <span className="font-display font-black text-sm">{p.name}</span>
              <span className="text-xs opacity-80">{label}</span>
            </button>
          );
        })}
      </div>
      {control && waiting > 0 && (
        <Btn size="sm" color="dark" onClick={api.forceStart}>
          {T.startAnyway}
        </Btn>
      )}
    </div>
  );
}

function PausedBanner({ snap }) {
  const away = snap.phase === 'briefing' ? snap.players.filter((p) => !p.connected && !p.excluded) : [];
  if (!away.length) return null;
  return (
    <div className="mx-4 mb-3 rounded-3xl border-4 border-black bg-orange p-3 text-black shadow-hard">
      <div className="font-display font-black text-lg">⏸️ {T.pausedTitle}</div>
      <div className="text-sm">{T.pausedSub}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {away.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-2xl bg-black/15 px-2 py-1">
            <Avatar p={p} size={26} />
            <span className="font-display font-black text-sm">{p.name}</span>
            <span className="text-xs">{T.awayFor(Math.round(p.awayFor / 1000))}</span>
            {isControl(snap) && (
              <button type="button" onClick={() => api.exclude(p.id)} className="rounded-full bg-black px-2 py-0.5 text-xs font-black text-white">
                {T.playWithout(p.name)}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function NextGameCard({ snap, big }) {
  const meta = useGameMeta(snap.nextGameId);
  if (snap.final)
    return (
      <div className="rounded-[34px] border-4 border-black bg-yellow p-6 text-black shadow-hard">
        <div className="font-display font-black text-5xl">{T.thatsAWrap}</div>
        <p className="mt-2 text-lg">{T.finalDesc}</p>
      </div>
    );
  if (!meta) return null;
  return (
    <div className="relative overflow-hidden rounded-[34px] border-4 border-black shadow-hard" style={{ background: HEX[meta.color] }}>
      <div className="stripes absolute inset-0 opacity-50" />
      <div className="relative p-5" style={{ color: darkText(meta.color) ? '#000' : '#fff' }}>
        <div className="text-xs font-black tracking-[0.25em] opacity-70">{T.nextUp}{snap.settings.totalRounds && snap.round + 1 === snap.settings.totalRounds ? ` · ${T.lastRound}` : ''}</div>
        <div className="mt-1 flex items-center gap-3">
          <span className={big ? 'text-7xl' : 'text-5xl'}>{meta.icon}</span>
          <div>
            <div className={`font-display font-black ${big ? 'text-5xl' : 'text-3xl'}`}>{meta.name}</div>
            <div className="font-display font-bold opacity-80">{meta.tagline}</div>
          </div>
        </div>
      </div>
      <div className="relative m-2 rounded-[26px] bg-black/80 p-4 text-white">
        <div className="mb-1 text-xs font-bold tracking-wider text-ink-muted">{T.howToPlay}</div>
        <p className={big ? 'text-xl leading-relaxed' : 'leading-relaxed'}>{meta.howTo}</p>
        <div className="mt-3 rounded-2xl border-2 border-white/15 p-3 font-display font-black" style={{ color: HEX[meta.color] }}>
          {'⭐ '}
          {meta.rule}
        </div>
        {meta.details && (
          <details className="mt-2 text-sm text-ink-muted">
            <summary className="cursor-pointer select-none rounded-xl bg-white/10 px-3 py-2 font-bold text-white">👇 {T.moreDetails}</summary>
            <p className="mt-1 leading-relaxed">{meta.details}</p>
          </details>
        )}
        {snap.fallbackNote && <p className="mt-2 text-sm text-ink-muted">{T.fallbackNote(snap.fallbackNote.games.join('، '), snap.fallbackNote.need, snap.fallbackNote.game)}</p>}
      </div>
    </div>
  );
}

function ResultsBlock({ snap, big }) {
  const res = snap.lastResult;
  const meta = useGameMeta(res?.gameId);
  if (!res) return null;
  const P = playerMap(snap);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-ink-muted">
        <span className="text-2xl">{meta?.icon}</span>
        <span className="font-display font-black">{T.roundResults} · {meta?.name}</span>
      </div>
      <motion.h2 initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`font-display font-black leading-snug ${big ? 'text-4xl' : 'text-2xl'}`}>
        {res.headline}
      </motion.h2>
      <Reveal res={res} />
      <ResultTable snap={snap} compact={!big} />
      {big && <Gallery res={res} snap={snap} />}

    </div>
  );
}

function BriefingBig({ snap }) {
  return (
    <div className="grid flex-1 grid-cols-2 gap-8">
      <div className="flex min-w-0 flex-col gap-4">
        {snap.waterBreak && <div className="rounded-3xl border-4 border-black bg-cyan p-4 font-display font-black text-2xl text-black shadow-hard">💧 {T.waterBreak}</div>}
        {snap.lastResult ? (
          <ResultsBlock snap={snap} big />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="font-display font-black text-6xl">يلا بينا! 🎉</div>
            <div className="text-2xl text-ink-muted">كل واحد يقرا القواعد على موبايله ويدوس «أنا جاهز».</div>
            <div className="flex flex-wrap gap-3">
              {snap.players.map((p) => (
                <NameTag key={p.id} p={p} size={48} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-6">
        <NextGameCard snap={snap} big />
        <ReadyList snap={snap} big />
      </div>
    </div>
  );
}

function myOutcome(snap) {
  const res = snap.lastResult;
  if (!res || !res.roster.includes(snap.me)) return null;
  return { won: res.winners.includes(snap.me), lost: res.losers.includes(snap.me), pts: res.points?.[snap.me] ?? 0 };
}

function BriefingPhone({ snap }) {
  const res = snap.lastResult;
  const out = myOutcome(snap);
  const ready = snap.ready.includes(snap.me);
  const [view, setView] = useState(res && !ready ? 'results' : 'rules');
  const P = playerMap(snap);
  const me = P[snap.me];
  useEffect(() => {
    api.step(view === 'results' && res ? 'results' : 'rules');
  }, [view]);
  useEffect(() => {
    if (out?.lost) {
      sfx.buzz();
      haptic.heavy();
    } else if (out?.won) sfx.win();
  }, [res?.round]);
  if (view === 'results' && res)
    return (
      <div className="flex flex-1 flex-col gap-4 px-5">
        {out ? (
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-[30px] border-4 border-black p-4 text-center shadow-hard" style={{ background: out.lost ? HEX.red : out.won ? HEX.lime : '#fff', color: out.lost ? '#fff' : '#000' }}>
            <div className="text-5xl">{out.lost ? '😬' : out.won ? '🏆' : '😎'}</div>
            <div className="font-display font-black text-3xl">{out.lost ? T.youLost : out.won ? T.youWon : T.youreSafe}</div>
            <div className="font-display font-black" dir="auto">{out.pts > 0 ? `+${out.pts}` : out.pts} نقطة</div>
          </motion.div>
        ) : (
          <div className="rounded-3xl bg-black/30 p-4 text-center font-display font-black">{T.watchBigScreen}</div>
        )}
        <div className="rounded-3xl border-[3px] border-white/10 bg-black/30 p-3">
          <ResultsBlock snap={snap} />
          <Gallery res={res} snap={snap} />
        </div>
        <div className="dock-bottom mt-auto pt-3">
          <Btn color="white" size="lg" className="w-full" onClick={() => setView('rules')}>
            {T.continueBtn} ←
          </Btn>
        </div>
      </div>
    );
  return (
    <div className="flex flex-1 flex-col gap-4 px-5">
      {snap.waterBreak && <div className="rounded-3xl border-4 border-black bg-cyan p-3 font-display font-black text-black">💧 {T.waterBreak}</div>}
      <NextGameCard snap={snap} />
      <MissionCard snap={snap} />
      {res && (
        <button type="button" onClick={() => setView('results')} className="text-center text-sm text-ink-muted underline">
          ← {T.roundResults}
        </button>
      )}
      <div className="dock-bottom mt-auto flex flex-col gap-3 pt-3">
        {ready ? (
          <div className="rounded-3xl border-4 border-black bg-lime py-4 text-center font-display font-black text-2xl text-black shadow-hard">{T.youAreReady}</div>
        ) : (
          <Btn color="lime" size="xl" className="w-full" onClick={api.ready}>
            {snap.final ? T.seeAwards : T.ready}
          </Btn>
        )}
        {(ready || isControl(snap)) && <ReadyList snap={snap} />}
      </div>
    </div>
  );
}

// Is my own mission card unfolded right now? Read by the prank question's tap tracking only.
const ownMission = { open: false };

function MissionCard({ snap }) {
  const m = snap.mission;
  const P = playerMap(snap);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    ownMission.open = !!m && open;
    return () => {
      ownMission.open = false;
    };
  }, [m, open]);
  if (!m) return null;
  const text = m.text.replace('{name}', P[m.target]?.name ?? '؟');
  return (
    <div data-own-mission="1" className="rounded-[28px] border-4 border-dashed border-white/25 bg-[#111] p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between font-display font-black text-lg">
        <span>🕶️ {T.secretMission}</span>
        <span className="text-sm text-ink-muted">{open ? T.missionHide : T.missionShow}</span>
      </button>
      {open && (
        <div className="mt-2">
          <div className="font-display font-black text-2xl text-lime">{text}</div>
          <p className="mt-1 text-sm text-ink-muted">{T.missionHint}</p>
          <Btn color="cyan" size="sm" className="mt-3 w-full" disabled={m.claimed} onClick={api.claimMission}>
            {m.claimed ? T.waitingConfirm : T.missionDone}
          </Btn>
        </div>
      )}
    </div>
  );
}

// Someone says they pranked me: a question of its own, answered inside the same card.
// It covers the screen so it can't be mistaken for my own mission button, waits while a
// round is being played, and ignores taps for a moment after each answer so a quick
// double tap can't answer the next question by accident.
const CLAIM_TAP_LOCK_MS = 700;
// if the server still lists a claim this long after we answered it, the answer was lost: ask again
const CLAIM_RESEND_MS = 5000;
// What the asked player touches FIRST is the thing we need to know: a player who still holds their
// own mission may take this question for their own mission button. The final answer alone would hide
// that, so the first touch is classified by position (works while the answers are still locked) and
// sent with the answer. Nothing typed or named is sent: only which area, timings and a tap count.
const inside = (el, x, y) => {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
};

function ClaimOverlay({ snap }) {
  const P = playerMap(snap);
  const [answered, setAnswered] = useState(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const yesRef = useRef(null);
  const noRef = useRef(null);
  const cardRef = useRef(null);
  const tap = useRef(null); // { id, shownAt, first, taps } for the question on screen
  const c = snap.claims?.find((x) => x.id !== answered);
  const hidden = !c || snap.phase === 'playing';
  // device clock only (no server offset). Layout effect: locked before the question is first painted,
  // and re-armed whenever it becomes visible again, so a round ending can't reveal it unlocked.
  useLayoutEffect(() => {
    if (hidden) return undefined;
    setLocked(true);
    lockedRef.current = true;
    const t = setTimeout(() => {
      setLocked(false);
      lockedRef.current = false;
    }, CLAIM_TAP_LOCK_MS);
    return () => clearTimeout(t);
  }, [c?.id, hidden, answered]);
  // the question became visible: start (or keep) its tap record, report it was shown once per claim
  useEffect(() => {
    if (hidden || tap.current?.id === c.id) return;
    const hasOpenMission = !!snap.mission && !snap.mission.claimed;
    tap.current = { id: c.id, shownAt: performance.now(), first: null, taps: 0, hasOpenMission };
    capture('mission_claim_shown', { claim_id: c.id, has_open_mission: hasOpenMission, own_mission_card_open: ownMission.open, missions_arm: snap.settings.missionsArm ?? null });
  }, [c?.id, hidden]);
  // every touch anywhere while the question is up, captured before any button can swallow it
  useEffect(() => {
    if (hidden) return undefined;
    const onDown = (e) => {
      const rec = tap.current;
      if (!rec || rec.id !== c.id) return;
      rec.taps += 1;
      if (rec.first) return;
      const x = e.clientX;
      const y = e.clientY;
      const own = [...document.querySelectorAll('[data-own-mission]')].some((el) => inside(el, x, y));
      rec.first = {
        firstTap: inside(yesRef.current, x, y) ? 'yes' : inside(noRef.current, x, y) ? 'no' : inside(cardRef.current, x, y) ? 'question' : 'backdrop',
        onOwnMission: own,
        locked: lockedRef.current,
        msToFirstTap: performance.now() - rec.shownAt,
        ownCardOpen: ownMission.open,
      };
      capture('mission_claim_first_tap', { claim_id: c.id, first_tap: rec.first.firstTap, first_tap_on_own_mission: own, first_tap_while_locked: rec.first.locked, ms_shown_to_first_tap: Math.round(rec.first.msToFirstTap), has_open_mission: rec.hasOpenMission, missions_arm: snap.settings.missionsArm ?? null });
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [c?.id, hidden]);
  const pendingIds = (snap.claims ?? []).map((x) => x.id).join(',');
  useEffect(() => {
    if (!answered) return undefined;
    if (!pendingIds.split(',').includes(answered)) {
      setAnswered(null);
      return undefined;
    }
    const t = setTimeout(() => setAnswered(null), CLAIM_RESEND_MS);
    return () => clearTimeout(t);
  }, [answered, pendingIds]);
  if (hidden) return null;
  const from = P[c.from]?.name ?? '؟';
  const answer = (yes) => {
    if (lockedRef.current) return;
    setLocked(true);
    lockedRef.current = true;
    setAnswered(c.id);
    const rec = tap.current?.id === c.id ? tap.current : null;
    api.answerClaim(c.id, yes, rec ? { ...rec.first, taps: rec.taps, msToAnswer: performance.now() - rec.shownAt } : undefined);
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-5" role="dialog" aria-modal="true" aria-labelledby="claim-q">
      <div ref={cardRef} className="w-full max-w-sm rounded-[28px] border-4 border-black bg-magenta p-5 text-white shadow-hard">
        <div className="flex items-center gap-2 font-display font-black">
          <Avatar p={P[c.from]} size={36} />
          <span>{T.claimFrom(from)}</span>
        </div>
        <div className="mt-3 rounded-2xl bg-black/30 p-3 font-display font-black text-xl">{c.text.replace('{name}', P[c.target]?.name ?? '')}</div>
        <h2 id="claim-q" className="mt-4 text-center font-display font-black text-2xl">{T.claimQuestion}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {/* locked by the handler, not the disabled attribute, so an early touch is still seen */}
          <div ref={yesRef}>
            <Btn color="white" className={`w-full ${locked ? 'opacity-50' : ''}`} aria-disabled={locked} onClick={() => answer(true)}>
              {T.yesItHappened}
            </Btn>
          </div>
          <div ref={noRef}>
            <Btn color="dark" className={`w-full ${locked ? 'opacity-50' : ''}`} aria-disabled={locked} onClick={() => answer(false)}>
              {T.noItDidnt}
            </Btn>
          </div>
        </div>
        <p className="mt-3 text-center text-sm text-white/80">{T.claimStakes(from)}</p>
      </div>
    </div>
  );
}

// ======================================================================= intro
function Intro({ snap, big }) {
  const meta = useGameMeta(snap.nextGameId);
  const t = useNow(100);
  const left = Math.max(0, Math.ceil((snap.phaseEndsAt - t) / 1000));
  const last = useRef(null);
  useEffect(() => {
    if (left !== last.current) {
      left > 0 ? sfx.countdown() : sfx.countdownGo();
      haptic.light();
      last.current = left;
    }
  }, [left]);
  if (!meta) return null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
      <div className="font-display font-black text-ink-muted">{T.roundN(snap.round + 1)}</div>
      <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }} className="flex items-center justify-center rounded-[40px] border-[6px] border-black shadow-hard" style={{ background: HEX[meta.color], width: big ? 220 : 150, height: big ? 220 : 150, fontSize: big ? 130 : 90 }}>
        {meta.icon}
      </motion.div>
      <h1 className={`text-stroke font-display font-black ${big ? 'text-8xl' : 'text-5xl'}`}>{meta.name}</h1>
      <p className={`font-display font-bold text-ink-muted ${big ? 'text-3xl' : 'text-xl'}`}>{meta.tagline}</p>
      <motion.div key={left} initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`font-display font-black ${big ? 'text-9xl' : 'text-7xl'}`} style={{ color: HEX[meta.color] }}>
        {left || 'يلا!'}
      </motion.div>
      {!big && <div className="text-ink-muted">{snap.roster?.includes(snap.me) === false ? T.watchBigScreen : T.getReady}</div>}
    </div>
  );
}

// ======================================================================= playing
function PlayBig({ snap }) {
  const UI = GAME_UI[snap.currentGameId];
  const meta = useGameMeta(snap.currentGameId);
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-4xl">{meta?.icon}</span>
        <span className="font-display font-black text-3xl">{meta?.name}</span>
        <span className="mr-auto">
          <RoundChip snap={snap} />
        </span>
      </div>
      {UI?.Big ? <UI.Big snap={snap} v={snap.game} /> : null}
    </div>
  );
}

function PlayPhone({ snap }) {
  const UI = GAME_UI[snap.currentGameId];
  if (!snap.roster?.includes(snap.me))
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-6xl">👀</div>
        <div className="font-display font-black text-2xl">{T.watchBigScreen}</div>
        <div className="text-ink-muted">هتدخل من الجولة اللي جاية. تقدر تستخدم الشات دلوقتي.</div>
      </div>
    );
  return <div className="flex flex-1 flex-col px-4 pb-4">{UI?.Phone ? <UI.Phone snap={snap} v={snap.game} /> : null}</div>;
}

// ======================================================================= end
function Ended({ snap, big }) {
  const P = playerMap(snap);
  const boat = snap.settings.format === 'boat';
  const rows = [...snap.players].sort((a, b) => b.stats.points - a.stats.points);
  useEffect(() => {
    sfx.airhorn();
  }, []);
  return (
    <div className={`flex flex-1 flex-col gap-5 ${big ? '' : 'px-5'}`}>
      <h1 className={`text-stroke font-display font-black ${big ? 'text-7xl' : 'text-5xl'}`}>🏆 {T.awards}</h1>
      <div className={`grid gap-4 ${big ? 'grid-cols-3' : 'grid-cols-1'}`}>
        {(snap.awards ?? []).map((a, i) => (
          <motion.div key={a.key} initial={{ y: 30, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: i % 2 ? 1.5 : -1.5 }} transition={{ delay: 0.25 * i, type: 'spring', stiffness: 220, damping: 16 }} className="rounded-[30px] border-4 border-black p-4 shadow-hard" style={{ background: HEX[['yellow', 'magenta', 'cyan', 'lime', 'orange', 'violet'][i % 6]] }}>
            <div className="text-5xl">{a.icon}</div>
            <div className="font-display font-black text-xl text-black">{a.title}</div>
            <div className="mt-2 flex items-center gap-2">
              <Avatar p={P[a.pid]} size={40} />
              <span className="font-display font-black text-2xl text-black">{P[a.pid]?.name}</span>
            </div>
            <div className="mt-1 font-bold text-black/70">{a.value}</div>
          </motion.div>
        ))}
      </div>
      <div className="rounded-[30px] border-4 border-black bg-bg-elevated p-4 shadow-hard">
        <div className="mb-2 font-display font-black text-xl">{T.scoreboard}</div>
        {rows.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 border-b border-white/10 py-1.5 last:border-0">
            <span className="w-6 text-center font-display font-black">{i + 1}</span>
            <Avatar p={p} size={30} />
            <span className="flex-1 font-display font-black">{p.name}</span>
            <span className="text-sm text-lime">{p.stats.points} {T.points}</span>
          </div>
        ))}
      </div>
      {isControl(snap) && (
        <div className="dock-bottom mt-auto grid grid-cols-2 gap-3 pt-2">
          <Btn color="lime" size="lg" onClick={api.playAgain}>
            {T.playAgain}
          </Btn>
          <Btn color="white" size="lg" onClick={api.toLobby}>
            {T.backToLobby}
          </Btn>
        </div>
      )}
    </div>
  );
}
