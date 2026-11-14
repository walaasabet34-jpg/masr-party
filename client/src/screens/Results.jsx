// Round-result widgets shared by the big screen and phones.
import { motion } from 'framer-motion';
import { T } from '../copy.js';
import { Avatar, HEX, playerMap } from '../ui/kit.jsx';
import { Drawing } from '../games/draw.jsx';

function Row({ r, p, lost, i, pts }) {
  return (
    <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.05 * i }} className={`flex items-center gap-2 rounded-2xl border-[3px] border-black px-2 py-1.5 ${lost ? 'bg-red text-white' : 'bg-white text-black'}`}>
      {r.place && <span className="w-6 text-center font-display font-black">{r.place}</span>}
      <Avatar p={p} size={34} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display font-black">
          {r.mark && <span className="ml-1">{r.mark}</span>}
          {p?.name ?? '؟'}
        </div>
        {r.why && <div className={`truncate text-xs ${lost ? 'text-white/80' : 'text-black/60'}`}>{r.why}</div>}
      </div>
      <span className="font-display font-black tabular text-sm">{r.value}</span>
      {pts !== undefined && <span className={`rounded-full border-2 border-black px-2 font-display font-black text-xs ${lost ? 'bg-black/30' : 'bg-lime'}`}>+{pts}</span>}
    </motion.div>
  );
}

export function ResultTable({ snap, compact }) {
  const res = snap.lastResult;
  if (!res?.table) return null;
  const P = playerMap(snap);
  const { table } = res;
  const lost = (id) => res.losers.includes(id);
  const pts = (id) => (snap.settings.noDrinks ? res.points?.[id] : undefined);
  if (table.layout === 'bars') {
    const max = Math.max(1, ...table.rows.map((r) => r.n ?? 0));
    return (
      <div className="flex flex-col gap-2">
        {table.rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2">
            <Avatar p={P[r.id]} size={34} />
            <div className="relative h-9 flex-1 overflow-hidden rounded-xl border-[3px] border-black bg-black/40">
              <motion.div initial={{ width: 0 }} animate={{ width: `${((r.n ?? 0) / max) * 100}%` }} transition={{ delay: 0.1 + i * 0.06, duration: 0.7 }} className="absolute inset-y-0 right-0" style={{ background: lost(r.id) ? HEX.red : HEX.lime }} />
              <span className="relative flex h-full items-center px-2 font-display font-black text-sm" style={{ color: '#fff', textShadow: '0 1px 2px #000' }}>
                {r.mark} {P[r.id]?.name} · {r.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (table.layout === 'groups' || table.layout === 'pairs') {
    const groups = table.groups ?? [];
    const loose = table.rows.filter((r) => r.group === undefined);
    return (
      <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
        {groups.map((g, k) => (
          <div key={k} className="rounded-2xl border-[3px] border-black bg-black/30 p-2">
            {g.title && <div className="mb-1 px-1 font-display font-black text-sm">{g.title} {g.count !== undefined && <span className="text-ink-muted">· {g.count}</span>}</div>}
            <div className="flex flex-col gap-1.5">
              {table.rows
                .filter((r) => r.group === k)
                .map((r, i) => (
                  <Row key={r.id} r={r} p={P[r.id]} lost={lost(r.id)} i={i} pts={pts(r.id)} />
                ))}
            </div>
          </div>
        ))}
        {loose.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {loose.map((r, i) => (
              <Row key={r.id} r={r} p={P[r.id]} lost={lost(r.id)} i={i} pts={pts(r.id)} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {table.rows.map((r, i) => (
        <Row key={r.id} r={r} p={P[r.id]} lost={lost(r.id)} i={i} pts={pts(r.id)} />
      ))}
    </div>
  );
}

export function Reveal({ res }) {
  if (!res?.reveal) return null;
  return (
    <div className="rounded-2xl border-[3px] border-black bg-yellow p-3 text-black shadow-hard-sm">
      {res.reveal.q && <div className="text-sm opacity-70">{res.reveal.q}</div>}
      <div className="text-xs font-bold tracking-wider opacity-70">{res.reveal.label}</div>
      <div className="font-display font-black text-2xl">{res.reveal.value}</div>
    </div>
  );
}

export function Gallery({ res, snap }) {
  if (!res?.gallery?.length) return null;
  const P = playerMap(snap);
  return (
    <div className="flex flex-col gap-3">
      <div className="font-display font-black">{T.galleryTitle}</div>
      {res.gallery.map((c, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 rounded-2xl border-[3px] border-black bg-black/30 p-2">
          <div className="rounded-xl bg-white p-2 text-sm text-black">
            <div className="text-[11px] opacity-60">{P[c.steps[0]?.by]?.name}</div>
            {c.steps[0]?.text || '…'}
          </div>
          <div className={`overflow-hidden rounded-xl bg-white ${c.blamed === 'draw' || c.blamed === 'both' ? 'ring-4 ring-red' : ''}`}>
            <Drawing drawing={c.steps[1]?.drawing} />
          </div>
          <div className={`rounded-xl bg-white p-2 text-sm text-black ${c.blamed === 'guess' || c.blamed === 'both' ? 'ring-4 ring-red' : ''}`}>
            <div className="text-[11px] opacity-60">{P[c.steps[2]?.by]?.name}</div>
            {c.steps[2]?.text || '…'} {c.perfect && '🎉'}
          </div>
        </div>
      ))}
    </div>
  );
}
