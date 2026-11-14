// Drawing pad (touch + mouse + pen) and a renderer for submitted drawings.
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

export const PALETTE = ['#000000', '#FF1744', '#FF9100', '#FFD600', '#00C853', '#2979FF', '#AA00FF', '#FF4FA3', '#8D5524', '#9E9E9E'];
const SIZES = [5, 12, 24, 40];

export function Drawing({ drawing, className = '' }) {
  const strokes = drawing?.strokes ?? [];
  return (
    <svg viewBox="0 0 1000 1000" className={`block aspect-square w-full bg-white ${className}`}>
      {strokes.map((s, i) => {
        const pts = [];
        for (let k = 0; k + 1 < s.p.length; k += 2) pts.push(`${s.p[k]},${s.p[k + 1]}`);
        if (pts.length === 1) return <circle key={i} cx={s.p[0]} cy={s.p[1]} r={s.w / 2} fill={s.c} />;
        return <polyline key={i} points={pts.join(' ')} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </svg>
  );
}

export const DrawPad = forwardRef(function DrawPad({ disabled }, ref) {
  const canvas = useRef(null);
  const [strokes, setStrokes] = useState([]);
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(12);
  const [eraser, setEraser] = useState(false);
  const cur = useRef(null);

  useImperativeHandle(ref, () => ({ get: () => ({ strokes }), isEmpty: () => !strokes.length }), [strokes]);

  const paint = (list) => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    const k = c.width / 1000;
    for (const s of list) {
      g.strokeStyle = s.c;
      g.fillStyle = s.c;
      g.lineWidth = s.w * k;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      if (s.p.length === 2) {
        g.arc(s.p[0] * k, s.p[1] * k, (s.w * k) / 2, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      g.moveTo(s.p[0] * k, s.p[1] * k);
      for (let i = 2; i + 1 < s.p.length; i += 2) g.lineTo(s.p[i] * k, s.p[i + 1] * k);
      g.stroke();
    }
  };
  useEffect(() => {
    const c = canvas.current;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = r.width * dpr;
    c.height = r.width * dpr;
    paint(strokes);
  }, []);
  useEffect(() => paint(cur.current ? [...strokes, cur.current] : strokes), [strokes]);

  const pos = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
  };
  const down = (e) => {
    if (disabled) return;
    canvas.current.setPointerCapture(e.pointerId);
    cur.current = { c: eraser ? '#FFFFFF' : color, w: eraser ? Math.max(24, size) : size, p: pos(e) };
    paint([...strokes, cur.current]);
  };
  const move = (e) => {
    if (!cur.current) return;
    const [x, y] = pos(e);
    const p = cur.current.p;
    if (Math.abs(p[p.length - 2] - x) + Math.abs(p[p.length - 1] - y) < 6) return;
    p.push(x, y);
    paint([...strokes, cur.current]);
  };
  const up = () => {
    if (!cur.current) return;
    const s = cur.current;
    cur.current = null;
    setStrokes((l) => [...l, s]);
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="aspect-square w-full rounded-2xl border-4 border-black bg-white" />
      <div className="flex flex-wrap items-center gap-1.5">
        {PALETTE.map((c) => (
          <button key={c} type="button" aria-label={c} onClick={() => (setColor(c), setEraser(false))} className="h-8 w-8 rounded-full border-[3px] border-black" style={{ background: c, outline: !eraser && color === c ? '3px solid #fff' : 'none' }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {SIZES.map((s) => (
          <button key={s} type="button" onClick={() => setSize(s)} className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 ${size === s ? 'border-white bg-white/20' : 'border-white/20'}`}>
            <span className="rounded-full bg-white" style={{ width: Math.max(4, s / 2), height: Math.max(4, s / 2) }} />
          </button>
        ))}
        <button type="button" onClick={() => setEraser(!eraser)} className={`rounded-xl border-2 px-3 py-2 font-display font-black text-sm ${eraser ? 'border-white bg-white text-black' : 'border-white/20'}`}>
          ممحاة
        </button>
        <button type="button" onClick={() => setStrokes((l) => l.slice(0, -1))} className="rounded-xl border-2 border-white/20 px-3 py-2 font-display font-black text-sm">
          تراجع
        </button>
        <button type="button" onClick={() => setStrokes([])} className="rounded-xl border-2 border-white/20 px-3 py-2 font-display font-black text-sm">
          امسح
        </button>
      </div>
    </div>
  );
});
