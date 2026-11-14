import { motion } from 'framer-motion';
import { api } from '../net.js';
import { T } from '../copy.js';
import { Avatar, HEX, TimeBar, playerMap, useGameMeta, darkText } from '../ui/kit.jsx';
import { sfx, haptic } from '../sound.js';

export const roster = (snap) => (snap.roster ?? []).map((id) => playerMap(snap)[id]).filter(Boolean);
export const send = (type, payload) => {
  api.input({ type, payload });
};

export function GameTimer({ snap, until, total }) {
  const meta = useGameMeta(snap.currentGameId);
  const end = until ?? snap.phaseEndsAt;
  const tot = total ?? meta?.durationMs ?? 30000;
  return <TimeBar endsAt={end} total={tot} color={meta?.color ?? 'lime'} />;
}

export function Done({ ids, snap, label = T.answered, big }) {
  const ps = roster(snap);
  const set = new Set(ids ?? []);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`flex flex-wrap justify-center ${big ? 'gap-3' : 'gap-1.5'}`}>
        {ps.map((p) => (
          <motion.div key={p.id} animate={{ scale: set.has(p.id) ? 1 : 0.85, opacity: set.has(p.id) ? 1 : 0.35 }}>
            <Avatar p={p} size={big ? 56 : 32} badge={set.has(p.id) ? '✓' : null} />
          </motion.div>
        ))}
      </div>
      <div className="font-display font-black text-ink-muted">
        {set.size}/{ps.length} {label}
      </div>
    </div>
  );
}

export function Prompt({ children, color = 'white', big, small }) {
  const bg = color === 'white' ? '#fff' : HEX[color];
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0, rotate: -1 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} className={`rounded-[30px] border-4 border-black p-5 text-center font-display font-black shadow-hard ${big ? 'text-5xl leading-tight' : small ? 'text-xl' : 'text-2xl'}`} style={{ background: bg, color: color === 'white' || darkText(color) ? '#000' : '#fff' }}>
      {children}
    </motion.div>
  );
}

export function PlayerGrid({ players, selected, onPick, disabled, cols = 2 }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
      {players.map((p) => {
        const on = selected === p.id;
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              sfx.tap();
              haptic.light();
              onPick(p.id);
            }}
            className={`press flex items-center gap-2 rounded-2xl border-[3px] border-black p-2 text-right ${on ? 'shadow-hard-sm' : ''} ${disabled && !on ? 'opacity-50' : ''}`}
            style={{ background: on ? HEX[p.color] : '#fff', color: '#000' }}
          >
            <Avatar p={p} size={36} />
            <span className="truncate font-display font-black">{p.name}</span>
            {on && <span className="mr-auto">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Sent({ children = '✓' }) {
  return <div className="rounded-3xl border-4 border-black bg-lime p-4 text-center font-display font-black text-2xl text-black shadow-hard">{children}</div>;
}

export function Waiting({ text = T.waitingOthers }) {
  return <div className="text-center font-display font-black text-ink-muted">{text}</div>;
}

export function TextAnswer({ placeholder = 'اكتب هنا…', onSend, max = 60, disabled }) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget).get('t')?.toString().trim();
        if (!v) return;
        onSend(v);
        sfx.pop();
      }}
    >
      <textarea name="t" maxLength={max} rows={2} placeholder={placeholder} disabled={disabled} enterKeyHint="send" className="w-full resize-none rounded-2xl border-4 border-black bg-white p-3 font-display font-black text-xl text-black outline-none" onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), e.currentTarget.form.requestSubmit())} />
      <button type="submit" disabled={disabled} className="press brutal rounded-2xl bg-lime py-3 font-display font-black text-xl text-black">
        ابعت ←
      </button>
    </form>
  );
}

export function NumberPad({ onSend, max = 7 }) {
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const raw = new FormData(e.currentTarget).get('n')?.toString().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d]/g, '');
        if (!raw) return;
        onSend(Number(raw));
        sfx.pop();
      }}
    >
      <input name="n" inputMode="numeric" pattern="[0-9٠-٩]*" maxLength={max} autoComplete="off" placeholder="؟" className="ltr w-full rounded-2xl border-4 border-black bg-white p-3 text-center font-display font-black text-5xl text-black outline-none" />
      <button type="submit" className="press brutal rounded-2xl bg-lime py-3 font-display font-black text-xl text-black">
        ابعت ←
      </button>
    </form>
  );
}
