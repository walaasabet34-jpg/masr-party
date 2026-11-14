// Room chat: plain text, group only, kept for the room's lifetime.
// The sender is always the socket's own seat: payloads never say who they are from.

export const CHAT_MAX_LEN = 300;
const KEEP = 500; // messages kept per room
const MIN_GAP_MS = 400;
const BURST = 6; // messages per 10 s
const DUP_MS = 10000;

// Remove control characters and bidi overrides (they can disguise text), squeeze spaces.
export function cleanChat(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[‪-‮⁦-⁩‎‏]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX_LEN);
}

export class Chat {
  constructor(emit) {
    this.emit = emit; // (msg) => void, pushes to everyone in the room
    this.messages = [];
    this.seq = 0;
    this.rate = new Map(); // pid -> { times: [], last: '', lastAt: 0, cids: Set }
  }
  add(msg) {
    const m = { id: ++this.seq, at: Date.now(), ...msg };
    this.messages.push(m);
    if (this.messages.length > KEEP) this.messages.shift();
    this.emit(m);
    return m;
  }
  system(type, p) {
    return this.add({ kind: 'sys', type, pid: p.id, name: p.name, color: p.color, sticker: p.sticker });
  }
  send(p, rawText, cid, now = Date.now()) {
    const text = cleanChat(rawText);
    if (!text) return { ok: false, error: 'empty' };
    const r = this.rate.get(p.id) ?? { times: [], last: '', lastAt: 0, cids: new Map() };
    this.rate.set(p.id, r);
    // a resend after reconnecting: same client id -> same message, never twice
    if (typeof cid === 'string' && cid.length <= 64 && r.cids.has(cid)) return { ok: true, id: r.cids.get(cid), dup: true };
    r.times = r.times.filter((t) => now - t < 10000);
    if (r.times.length && now - r.times[r.times.length - 1] < MIN_GAP_MS) return { ok: false, error: 'slow' };
    if (r.times.length >= BURST) return { ok: false, error: 'slow' };
    if (text === r.last && now - r.lastAt < DUP_MS) return { ok: false, error: 'repeat' };
    r.times.push(now);
    r.last = text;
    r.lastAt = now;
    const m = this.add({ kind: 'user', pid: p.id, name: p.name, color: p.color, sticker: p.sticker, text });
    if (typeof cid === 'string' && cid.length <= 64) {
      r.cids.set(cid, m.id);
      if (r.cids.size > 60) r.cids.delete(r.cids.keys().next().value);
    }
    return { ok: true, id: m.id };
  }
  since(after = 0) {
    return this.messages.filter((m) => m.id > after);
  }
}
