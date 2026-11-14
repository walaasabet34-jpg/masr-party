import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { api, now, useStore } from '../net.js';
import { sfx, haptic } from '../sound.js';
import { T } from '../copy.js';

export const HEX = {
  magenta: '#FF2D95',
  lime: '#C6FF00',
  cyan: '#00E5FF',
  orange: '#FF6B00',
  violet: '#7C3AED',
  yellow: '#FFD600',
  red: '#FF1744',
  mint: '#00FFA3',
  pink: '#FF8FD8',
  blue: '#2979FF',
};
export const darkText = (c) => !['violet', 'blue', 'red', 'magenta'].includes(c);

export function useNow(ms = 250) {
  const [t, set] = useState(now());
  useEffect(() => {
    const id = setInterval(() => set(now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

export const useIsBig = () => {
  const [big, set] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const f = () => set(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return big;
};

export function Blobs({ color = 'magenta', second = 'violet' }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <div className="blob" style={{ width: 640, height: 640, right: -180, top: -200, '--glow': HEX[color] }} />
      <div className="blob" style={{ width: 520, height: 520, left: -140, bottom: -160, '--glow': HEX[second], animationDelay: '-5s' }} />
      <div className="blob" style={{ width: 360, height: 360, right: '38%', top: '40%', '--glow': HEX.cyan, animationDelay: '-9s', opacity: 0.22 }} />
    </div>
  );
}

export function Logo({ size = 'md', stacked = false }) {
  const s = { sm: 'text-2xl', md: 'text-4xl', lg: 'text-6xl', xl: 'text-[min(30vw,170px)]' }[size];
  return (
    <div className={`font-display font-black leading-[0.9] ${s} ${stacked ? 'flex flex-col' : 'flex gap-[0.25em]'} select-none`} aria-label={T.appName}>
      <span className="text-lime text-stroke">سهرة</span>
      <span className="text-magenta text-stroke">طلقة</span>
    </div>
  );
}

export function Btn({ children, color = 'white', onClick, disabled, size = 'md', className = '', type = 'button', ...rest }) {
  const bg = color === 'white' ? '#fff' : color === 'dark' ? '#15152A' : HEX[color];
  const fg = color === 'dark' || !darkText(color) ? '#fff' : '#000';
  const pad = { sm: 'px-4 py-2 text-sm', md: 'px-5 py-3.5 text-lg', lg: 'px-6 py-5 text-2xl', xl: 'px-8 py-6 text-3xl' }[size];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        sfx.tap();
        haptic.light();
        onClick?.(e);
      }}
      className={`press brutal rounded-3xl font-display font-black uppercase ${pad} ${disabled ? 'opacity-50' : ''} ${className}`}
      style={{ background: bg, color: fg }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ color = 'lime', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-[3px] border-black px-3 py-0.5 font-display font-black text-sm shadow-hard-sm ${className}`} style={{ background: HEX[color] ?? color, color: darkText(color) ? '#000' : '#fff' }}>
      {children}
    </span>
  );
}

export function Avatar({ p, size = 44, ring, dim, badge }) {
  if (!p) return null;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className={`flex h-full w-full items-center justify-center rounded-[30%] border-[3px] border-black ${dim || p.connected === false ? 'opacity-40 grayscale' : ''}`}
        style={{ background: HEX[p.color] ?? HEX.magenta, fontSize: size * 0.55, boxShadow: ring ? `0 0 0 3px ${ring}` : undefined }}
      >
        <span aria-hidden>{p.sticker}</span>
      </div>
      {badge && <span className="absolute -bottom-1 -left-1 rounded-full border-2 border-black bg-white px-1 text-[11px] leading-4 text-black">{badge}</span>}
    </div>
  );
}

export function NameTag({ p, size = 40, sub, right }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar p={p} size={size} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display font-black">{p?.name}</div>
        {sub && <div className="truncate text-xs text-ink-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Panel({ children, className = '', color }) {
  return (
    <div className={`rounded-[28px] border-4 border-black p-4 shadow-hard ${className}`} style={{ background: color ? HEX[color] : '#15152A' }}>
      {children}
    </div>
  );
}

export function Countdown({ endsAt, className = '' }) {
  const t = useNow(200);
  if (!endsAt) return null;
  const s = Math.max(0, Math.ceil((endsAt - t) / 1000));
  return <span className={`ltr tabular font-display font-black ${className}`}>{s}</span>;
}

export function TimeBar({ endsAt, total, color = 'lime' }) {
  const t = useNow(100);
  if (!endsAt) return null;
  const f = Math.max(0, Math.min(1, (endsAt - t) / total));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-2 border-black bg-black/40">
      <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${f * 100}%`, background: f < 0.2 ? HEX.red : HEX[color], marginInlineStart: 'auto' }} />
    </div>
  );
}

export function Qr({ text, size = 240 }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).then(setSvg);
  }, [text]);
  return <div className="rounded-2xl border-4 border-black bg-white p-2 shadow-hard" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function CodeTiles({ code, size = 'lg' }) {
  const cls = size === 'lg' ? 'h-20 w-16 text-5xl' : size === 'md' ? 'h-14 w-11 text-3xl' : 'h-9 w-7 text-xl';
  return (
    <div className="ltr flex gap-2" aria-label={`كود الأوضة ${code}`}>
      {code.split('').map((ch, i) => (
        <motion.span key={i} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06 }} className={`flex items-center justify-center rounded-xl border-[3px] border-black bg-white font-display font-black text-black shadow-hard-sm ${cls}`}>
          {ch}
        </motion.span>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, sub, className = '' }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`flex w-full items-center gap-3 rounded-3xl border-[3px] border-white/20 bg-black/30 p-4 text-right ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="font-display font-black text-lg">{label}</div>
        {sub && <div className="text-sm text-ink-muted">{sub}</div>}
      </div>
      <span className={`flex h-8 w-14 shrink-0 items-center rounded-full border-[3px] border-black px-[3px] transition-colors ${on ? 'bg-lime' : 'bg-white/25'}`}>
        <motion.span animate={{ x: on ? -22 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className="block h-5 w-5 rounded-full border-2 border-black bg-white" />
      </span>
    </button>
  );
}

export function DrinksSwitch() {
  const { noDrinks } = useStore();
  return (
    <button
      type="button"
      onClick={() => {
        api.setNoDrinks(!noDrinks);
        sfx.pop();
      }}
      className="press flex items-center gap-2 rounded-full border-[3px] border-black px-3 py-1.5 font-display font-black text-sm shadow-hard-sm"
      style={{ background: noDrinks ? '#2a2a40' : HEX.yellow, color: noDrinks ? '#fff' : '#000' }}
    >
      <span className={`flex h-5 w-9 items-center rounded-full bg-black px-0.5 ${noDrinks ? 'justify-end' : 'justify-start'}`}>
        <span className="h-3.5 w-3.5 rounded-full bg-white" />
      </span>
      {noDrinks ? T.drinksOff : T.drinksOn}
    </button>
  );
}

export function Menu({ extra }) {
  const [open, setOpen] = useState(false);
  const { muted } = useStore();
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const f = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', f);
    return () => document.removeEventListener('pointerdown', f);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-label={T.menu} onClick={() => setOpen(!open)} className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/25 ${open ? 'bg-white text-black' : 'bg-bg-elevated'}`}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M3 5h14M3 10h14M3 15h14" />
        </svg>
      </button>
      {open && (
        <motion.div initial={{ scale: 0.9, opacity: 0, y: -6 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="absolute left-0 top-14 z-50 w-72 rounded-[28px] border-4 border-black bg-bg-elevated p-5 shadow-hard">
          <div className="flex items-center justify-between gap-3">
            <span className="font-display font-black text-lg">{T.sound}</span>
            <div className="flex rounded-full bg-black/50 p-1">
              {[false, true].map((m) => (
                <button key={String(m)} type="button" onClick={() => muted !== m && api.toggleMute()} className={`rounded-full px-4 py-1 font-display font-black ${muted === m ? 'bg-white text-black' : 'text-ink-muted'}`}>
                  {m ? T.off : T.on}
                </button>
              ))}
            </div>
          </div>
          {extra && <div className="mt-4 flex flex-col gap-2">{extra(() => setOpen(false))}</div>}
        </motion.div>
      )}
    </div>
  );
}

export function TopBar({ left, right, drinks }) {
  return (
    <div className="safe-top relative z-30 flex items-center justify-between gap-2 px-4 pb-2">
      <div className="flex min-w-0 items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">
        {drinks && <DrinksSwitch />}
        {right}
      </div>
    </div>
  );
}

export function BackBtn({ onClick, label = T.back }) {
  return (
    <button type="button" onClick={onClick} className="press flex items-center gap-1 rounded-full border-2 border-white/15 bg-[#1e2540] px-4 py-2 font-display font-black">
      <span aria-hidden>→</span> {label}
    </button>
  );
}

export function ConnBanner() {
  const { conn, snap } = useStore();
  if (!snap || conn === 'open') return null;
  return <div className="fixed inset-x-0 top-0 z-[100] bg-red py-1 text-center font-display font-black text-sm text-white">{T.reconnecting}</div>;
}

export function HoldButton({ label, onDone, ms = 900, color = 'lime', className = '' }) {
  const [p, setP] = useState(0);
  const t0 = useRef(null);
  const raf = useRef(0);
  const step = () => {
    const f = Math.min(1, (performance.now() - t0.current) / ms);
    setP(f);
    if (f >= 1) {
      t0.current = null;
      setP(0);
      sfx.go();
      haptic.heavy();
      onDone();
      return;
    }
    raf.current = requestAnimationFrame(step);
  };
  const down = () => {
    t0.current = performance.now();
    raf.current = requestAnimationFrame(step);
  };
  const up = () => {
    cancelAnimationFrame(raf.current);
    t0.current = null;
    setP(0);
  };
  return (
    <button
      type="button"
      data-nokey="1"
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && down()}
      onKeyUp={up}
      className={`relative overflow-hidden brutal rounded-3xl px-6 py-5 font-display font-black text-2xl text-black ${className}`}
      style={{ background: '#fff' }}
    >
      <span className="absolute inset-y-0 right-0" style={{ width: `${p * 100}%`, background: HEX[color] }} />
      <span className="relative">{label}</span>
    </button>
  );
}

export const playerMap = (snap) => Object.fromEntries((snap?.players ?? []).map((p) => [p.id, p]));
export const useGameMeta = (id) => {
  const { metaById } = useMetas();
  return metaById[id];
};
let metaCache = null;
const metaSubs = new Set();
export function useMetas() {
  const [m, setM] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return;
    metaSubs.add(setM);
    if (metaSubs.size === 1)
      fetch('/api/info')
        .then((r) => r.json())
        .then((j) => {
          metaCache = { list: j.games, metaById: Object.fromEntries(j.games.map((g) => [g.id, g])), lanUrls: j.lanUrls ?? [] };
          metaSubs.forEach((f) => f(metaCache));
        });
    return () => metaSubs.delete(setM);
  }, []);
  return m ?? { list: [], metaById: {}, lanUrls: [] };
}
export const rule = (meta, dry) => (dry ? meta?.ruleDry : meta?.rule);

export function useMemoNames(snap) {
  return useMemo(() => playerMap(snap), [snap]);
}
