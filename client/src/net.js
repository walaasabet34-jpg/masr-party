// Socket + tiny store. One socket per tab; it reconnects with backoff and resumes the seat.
import { useSyncExternalStore } from 'react';

const LS = {
  get(k, d = null) {
    try {
      const v = localStorage.getItem('tal2a:' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      if (v === null || v === undefined) localStorage.removeItem('tal2a:' + k);
      else localStorage.setItem('tal2a:' + k, JSON.stringify(v));
    } catch {}
  },
};
export { LS };

const STICKERS = ['🐙', '🦊', '🐸', '🦄', '🦖', '🐼', '🦩', '🐯', '🐳', '🦥', '🐲', '🦜', '🐨', '🦁', '🐷', '👽', '🐫', '🐊', '🦆', '🐈'];
export const COLORS = ['magenta', 'lime', 'cyan', 'orange', 'violet', 'yellow', 'mint', 'pink', 'blue', 'red'];
export { STICKERS };
const randomLook = () => ({ color: COLORS[Math.floor(Math.random() * COLORS.length)], sticker: STICKERS[Math.floor(Math.random() * STICKERS.length)] });

let state = {
  snap: null,
  conn: 'idle',
  error: null,
  closed: null,
  clockOffset: 0,
  identity: LS.get('identity') ?? { name: '', ...randomLook() },
  session: LS.get('session'), // { code, role, playerId, token, displayToken }
  muted: LS.get('muted', false),
  resuming: !!LS.get('session'),
  // chat
  chat: [], // messages from the server, sorted by id
  chatPending: [], // { cid, text, error? } sent but not yet confirmed
  chatOpen: false,
  chatUnread: 0,
  chatSound: LS.get('chatSound', true),
  chatToast: null,
};
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
export const getState = () => state;
export function useStore() {
  return useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => state);
}
export const now = () => Date.now() + state.clockOffset;

// ------------------------------------------------------------------ socket
let ws = null;
let attempts = 0;
let seq = 0;
const acks = new Map();
let queue = [];
let retryTimer;
let pingTimer;
let lastHeard = 0;
const handlers = {};

function url() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

function connect() {
  clearTimeout(retryTimer);
  set({ conn: attempts ? 'reconnecting' : 'connecting' });
  let sock;
  try {
    sock = new WebSocket(url());
  } catch {
    return retry();
  }
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return;
    attempts = 0;
    lastHeard = Date.now();
    set({ conn: 'open' });
    resume();
    const q = queue;
    queue = [];
    q.forEach((m) => sock.send(m));
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (Date.now() - lastHeard > 25000) return sock.close();
      if (sock.readyState === 1) sock.send('ping');
    }, 10000);
  };
  sock.onmessage = (e) => {
    if (ws !== sock) return;
    lastHeard = Date.now();
    if (e.data === 'pong') return;
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (typeof m.ack === 'number') {
      const a = acks.get(m.ack);
      if (a) {
        acks.delete(m.ack);
        clearTimeout(a.timer);
        a.resolve(m.a?.[0]);
      }
      return;
    }
    handlers[m.t]?.(...(m.a ?? []));
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    clearInterval(pingTimer);
    retry();
  };
}
function retry() {
  set({ conn: 'reconnecting' });
  const wait = Math.min(4000, 250 * 2 ** attempts) * (0.75 + Math.random() * 0.5);
  attempts++;
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, wait);
}
function wake() {
  if (document.visibilityState === 'hidden') return;
  if (!ws || ws.readyState === 3) connect();
  else if (ws.readyState === 1 && Date.now() - lastHeard > 10000) ws.send('ping');
}
window.addEventListener('online', wake);
document.addEventListener('visibilitychange', wake);

function raw(m) {
  if (ws?.readyState === 1) ws.send(m);
  else if (queue.length < 200) queue.push(m);
  if (!ws) connect();
}
export function emit(t, ...a) {
  raw(JSON.stringify({ t, a }));
}
export function request(t, ...a) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      acks.delete(id);
      reject(new Error('timeout'));
    }, 12000);
    acks.set(id, { resolve, timer });
    raw(JSON.stringify({ t, a, id }));
  });
}

handlers['room:state'] = (snap) => {
  const off = snap.serverNow - Date.now();
  const clockOffset = state.clockOffset === 0 ? off : state.clockOffset * 0.7 + off * 0.3;
  set({ snap, clockOffset, error: null, closed: null, resuming: false });
};
function mergeChat(list) {
  const byId = new Map(state.chat.map((m) => [m.id, m]));
  let fresh = 0;
  let lastFresh = null;
  for (const m of list) {
    if (!byId.has(m.id)) {
      byId.set(m.id, m);
      if (m.kind === 'user' && m.pid !== state.snap?.me) {
        fresh++;
        lastFresh = m;
      }
    }
  }
  const chat = [...byId.values()].sort((a, b) => a.id - b.id);
  return { chat, fresh, lastFresh };
}
const chatListeners = new Set();
export const onChatMessage = (f) => (chatListeners.add(f), () => chatListeners.delete(f));
handlers['chat:history'] = (list) => {
  const { chat } = mergeChat(list);
  set({ chat });
};
handlers['chat:msg'] = (m) => {
  const { chat, fresh, lastFresh } = mergeChat([m]);
  const patch = { chat };
  if (fresh && !state.chatOpen) {
    patch.chatUnread = state.chatUnread + fresh;
    patch.chatToast = { id: lastFresh.id, name: lastFresh.name, sticker: lastFresh.sticker, color: lastFresh.color, text: lastFresh.text };
  }
  set(patch);
  if (fresh) chatListeners.forEach((f) => f(lastFresh));
};
handlers['room:closed'] = (reason) => {
  saveSession(null);
  set({ snap: null, closed: reason, resuming: false });
};

function saveSession(s) {
  LS.set('session', s);
  const sameRoom = s && state.session && s.code === state.session.code;
  set({ session: s, ...(sameRoom ? {} : { chat: [], chatPending: [], chatUnread: 0, chatToast: null }) });
}

// resend chat that was typed while the line was down (same cid: the server keeps it once)
function flushChat() {
  for (const p of state.chatPending) if (!p.error) sendChat(p);
}
async function sendChat(p) {
  try {
    const r = await request('chat:send', { text: p.text, cid: p.cid });
    if (r?.ok) set({ chatPending: state.chatPending.filter((x) => x.cid !== p.cid) });
    else if (r?.error) set({ chatPending: state.chatPending.map((x) => (x.cid === p.cid ? { ...x, error: r.error } : x)) });
  } catch {
    /* timeout: stays pending and is resent after reconnecting */
  }
}

async function resume() {
  const s = state.session;
  if (!s) return set({ resuming: false });
  try {
    const r = s.role === 'display' ? await request('room:attachDisplay', { code: s.code, displayToken: s.displayToken }) : await request('room:join', { code: s.code, playerId: s.playerId, token: s.token });
    if (r?.ok) flushChat();
    if (!r?.ok) {
      saveSession(null);
      set({ snap: null, resuming: false, error: r?.error === 'room_not_found' ? 'party_gone' : r?.error });
    }
  } catch {
    /* socket will retry */
  }
}

// ------------------------------------------------------------------ actions
const look = () => {
  const i = state.identity;
  return { name: i.name, color: i.color, sticker: i.sticker };
};

export const api = {
  boot() {
    if (state.session) connect();
  },
  setIdentity(patch) {
    const identity = { ...state.identity, ...patch };
    LS.set('identity', identity);
    set({ identity });
    if (state.snap?.me) emit('player:look', look());
  },
  shuffleLook() {
    api.setIdentity(randomLook());
  },
  toggleMute() {
    LS.set('muted', !state.muted);
    set({ muted: !state.muted });
  },
  async peek(code) {
    return request('room:peek', { code });
  },
  async hostOnPhone(opts) {
    const r = await request('room:create', { ...look(), ...opts });
    if (!r.ok) throw new Error(r.error);
    saveSession({ code: r.code, role: 'player', playerId: r.playerId, token: r.token });
    return r.code;
  },
  async hostOnScreen(opts) {
    const r = await request('room:createDisplay', opts);
    if (!r.ok) throw new Error(r.error);
    saveSession({ code: r.code, role: 'display', displayToken: r.displayToken });
    return r.code;
  },
  async join(code) {
    code = code.toUpperCase();
    const prev = state.session?.code === code ? state.session : null;
    const r = await request('room:join', { ...look(), code, playerId: prev?.playerId, token: prev?.token });
    if (!r.ok) {
      set({ error: r.error });
      throw new Error(r.error);
    }
    saveSession({ code: r.code, role: 'player', playerId: r.playerId, token: r.token });
    return r.code;
  },
  settings: (p) => emit('room:settings', p),
  start: () => emit('room:start'),
  ready: () => emit('player:ready'),
  step: (s) => emit('player:step', s),
  input: (inp) => emit('game:input', { ...inp, t: now() }),
  claimMission: () => emit('mission:claim'),
  answerClaim: (id, yes) => emit('mission:answer', id, yes),
  exclude: (id) => emit('room:exclude', id),
  kick: (id) => emit('room:kick', id),
  forceStart: () => emit('room:forceStart'),
  skipRound: () => emit('room:skipRound'),
  end: () => emit('room:end'),
  toLobby: () => emit('room:lobby'),
  playAgain: () => emit('room:playAgain'),
  boat: (act) => emit('boat:act', act),
  leave() {
    emit('room:leave');
    saveSession(null);
    set({ snap: null, error: null, closed: null });
  },
  clearError: () => set({ error: null, closed: null }),
  chatSend(text) {
    const cid = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 40);
    const p = { cid, text };
    set({ chatPending: [...state.chatPending, p] });
    sendChat(p);
  },
  chatDismiss(cid) {
    set({ chatPending: state.chatPending.filter((x) => x.cid !== cid) });
  },
  chatOpen(open) {
    set({ chatOpen: open, ...(open ? { chatUnread: 0, chatToast: null } : {}) });
  },
  chatToggleSound() {
    LS.set('chatSound', !state.chatSound);
    set({ chatSound: !state.chatSound });
  },
  chatClearToast: () => set({ chatToast: null }),
};

// handy for automated browser tests and debugging from the console
if (typeof window !== 'undefined') window.__tal2a = { getState: () => state, api };
