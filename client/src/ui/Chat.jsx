// Room chat: phone bottom sheet / desktop side panel, unread badge, toast, keyboard-safe input.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, getState, onChatMessage, useStore } from '../net.js';
import { HEX, Countdown } from './kit.jsx';
import { sfx } from '../sound.js';

const MAX = 300;
const SYS = {
  // shown right after a player's name, so phrased to read right for anyone
  join: 'جوه الأوضة دلوقتي 👋',
  left: 'برّه الأوضة دلوقتي',
  kicked: 'برّه الأوضة بقرار المضيف',
  away: 'النت فصل 📶',
  back: 'رجوع تاني 👋',
  newHost: 'المضيف الجديد 👑',
};
const ERR = { slow: 'بالراحة شوية، استنى ثانية وابعت تاني', repeat: 'نفس الرسالة اتبعتت لسه', empty: 'الرسالة فاضية', not_member: 'انت مش في الأوضة' };
const time = (t) => new Date(t).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });

// Sound + vibration for new messages (optional, follows the global mute too)
export function useChatSound() {
  useEffect(
    () =>
      onChatMessage(() => {
        const s = getState();
        if (!s.chatOpen && s.chatSound && !s.muted) sfx.tick();
      }),
    [],
  );
}

export function ChatButton() {
  const { chatOpen, chatUnread } = useStore();
  return (
    <button
      type="button"
      data-nokey="1"
      aria-label={chatUnread ? `الشات، ${chatUnread} رسايل جديدة` : 'الشات'}
      aria-expanded={chatOpen}
      onClick={() => api.chatOpen(!chatOpen)}
      className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/25 text-xl ${chatOpen ? 'bg-white text-black' : 'bg-bg-elevated'}`}
    >
      💬
      {chatUnread > 0 && (
        <motion.span key={chatUnread} initial={{ scale: 0.4 }} animate={{ scale: 1 }} className="absolute -left-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-black bg-red px-1 font-display font-black text-xs text-white">
          {chatUnread > 99 ? '99+' : chatUnread}
        </motion.span>
      )}
    </button>
  );
}

export function ChatToast() {
  const { chatToast, chatOpen } = useStore();
  useEffect(() => {
    if (!chatToast) return;
    const t = setTimeout(() => api.chatClearToast(), 3200);
    return () => clearTimeout(t);
  }, [chatToast?.id]);
  return (
    <AnimatePresence>
      {chatToast && !chatOpen && (
        <motion.button
          key={chatToast.id}
          type="button"
          data-nokey="1"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          onClick={() => api.chatOpen(true)}
          className="fixed left-1/2 z-[70] flex max-w-[86vw] -translate-x-1/2 items-center gap-2 rounded-full border-2 border-black bg-white py-1 pl-3 pr-1 text-black shadow-hard-sm"
          style={{ top: 'calc(max(var(--safe-top), 12px) + 52px)' }}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-black text-sm" style={{ background: HEX[chatToast.color] }}>
            {chatToast.sticker}
          </span>
          <span className="truncate text-sm" dir="auto">
            <b>{chatToast.name}:</b> {chatToast.text}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

function Message({ m, mine }) {
  if (m.kind === 'sys')
    return (
      <div className="my-1 flex justify-center">
        <span className="rounded-full bg-white/10 px-3 py-0.5 text-xs text-ink-muted">
          {m.sticker} {m.name} {SYS[m.type] ?? ''} · {time(m.at)}
        </span>
      </div>
    );
  return (
    <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[30%] border-2 border-black text-base" style={{ background: HEX[m.color] ?? HEX.magenta }} aria-hidden>
        {m.sticker}
      </span>
      <div className={`max-w-[78%] rounded-2xl border-2 border-black px-3 py-1.5 ${mine ? 'bg-lime text-black' : 'bg-white text-black'}`}>
        <div className="flex items-baseline gap-2 text-[11px] opacity-70">
          <span className="font-display font-black">{mine ? 'انت' : m.name}</span>
          <span>{time(m.at)}</span>
        </div>
        {/* plain text only: React escapes it; dir=auto keeps Arabic/English mixes readable */}
        <div dir="auto" className="whitespace-pre-wrap break-words text-[15px] leading-snug" style={{ unicodeBidi: 'plaintext' }}>
          {m.text}
        </div>
      </div>
    </div>
  );
}

function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener('resize', f);
    vv.addEventListener('scroll', f);
    f();
    return () => {
      vv.removeEventListener('resize', f);
      vv.removeEventListener('scroll', f);
    };
  }, []);
  return inset;
}

function ChatBody({ snap, readOnly, onClose }) {
  const { chat, chatPending, chatSound } = useStore();
  const list = useRef(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const [text, setText] = useState('');
  const lastCount = useRef(chat.length);
  const playing = snap.phase === 'playing' || snap.phase === 'intro' || snap.phase === 'boat';

  const scrollDown = (smooth) => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setNewBelow(0);
  };
  useLayoutEffect(() => scrollDown(false), []);
  useEffect(() => {
    const added = chat.length - lastCount.current;
    lastCount.current = chat.length;
    if (added <= 0) return;
    const mineLast = chat[chat.length - 1]?.pid === snap.me;
    // never yank someone reading older messages down; offer a button instead
    if (atBottom || mineLast) scrollDown(true);
    else setNewBelow((n) => n + added);
  }, [chat.length]);
  useEffect(() => {
    if (chatPending.length) scrollDown(true);
  }, [chatPending.length]);

  const onScroll = () => {
    const el = list.current;
    const b = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAtBottom(b);
    if (b) setNewBelow(0);
  };
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    api.chatSend(t.slice(0, MAX));
    setText('');
  };
  const left = MAX - text.length;

  return (
    <div className="flex h-full min-h-0 flex-col" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b-2 border-black/40 px-3 py-2">
        <span className="font-display font-black text-lg">💬 شات الأوضة</span>
        <button type="button" data-nokey="1" onClick={api.chatToggleSound} aria-label="صوت الرسايل" className="mr-auto rounded-full bg-white/10 px-2 py-1 text-sm">
          {chatSound ? '🔔' : '🔕'}
        </button>
        {onClose && (
          <button type="button" data-nokey="1" onClick={onClose} aria-label="اقفل الشات" className="h-9 w-9 rounded-full bg-white/10 font-black">
            ✕
          </button>
        )}
      </div>
      {playing && (
        <div className="flex items-center gap-2 bg-yellow px-3 py-1 text-xs font-bold text-black">
          ⏱️ الجولة شغالة والمؤقت ماشي وانت بتكتب {snap.phaseEndsAt && snap.phase === 'playing' && <span className="mr-auto">باقي <Countdown endsAt={snap.phaseEndsAt} /> ث</span>}
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={list} onScroll={onScroll} className="scroll-y absolute inset-0 flex flex-col gap-2 px-3 py-3" aria-live="polite">
          {!chat.length && !chatPending.length && <div className="m-auto text-center text-sm text-ink-muted">مفيش رسايل لسه. قول أهلًا 👋</div>}
          {chat.map((m) => (
            <Message key={m.id} m={m} mine={m.kind === 'user' && m.pid === snap.me} />
          ))}
          {chatPending.map((p) => (
            <div key={p.cid} className="flex flex-row-reverse items-end gap-2 opacity-70">
              <div className="max-w-[78%] rounded-2xl border-2 border-dashed border-black bg-lime/70 px-3 py-1.5 text-black">
                <div dir="auto" className="break-words text-[15px]">
                  {p.text}
                </div>
                <div className="text-[11px]">
                  {p.error ? (
                    <>
                      <span className="text-red">{ERR[p.error] ?? 'ما اتبعتتش'}</span>{' '}
                      <button type="button" data-nokey="1" className="underline" onClick={() => api.chatDismiss(p.cid)}>
                        شيلها
                      </button>
                    </>
                  ) : (
                    'بتتبعت…'
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {newBelow > 0 && (
          <button type="button" data-nokey="1" onClick={() => scrollDown(true)} className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border-2 border-black bg-cyan px-4 py-1 font-display font-black text-sm text-black shadow-hard-sm">
            رسائل جديدة ({newBelow}) ↓
          </button>
        )}
      </div>
      {readOnly ? (
        <div className="border-t-2 border-black/40 p-3 text-center text-xs text-ink-muted">الشاشة الكبيرة بتعرض الشات بس. الكتابة من الموبايلات.</div>
      ) : (
        <form onSubmit={submit} className="flex items-end gap-2 border-t-2 border-black/40 p-2">
          <div className="relative flex-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
              }}
              rows={1}
              dir="auto"
              maxLength={MAX}
              enterKeyHint="send"
              placeholder="اكتب رسالة…"
              aria-label="اكتب رسالة"
              className="block max-h-28 min-h-11 w-full resize-none rounded-2xl border-2 border-black bg-white px-3 py-2 text-base text-black outline-none"
            />
            {left < 60 && <span className="absolute bottom-1 left-2 text-[10px] text-black/50">{left}</span>}
          </div>
          <button type="submit" data-nokey="1" disabled={!text.trim()} className="press brutal-sm h-11 shrink-0 rounded-2xl bg-lime px-4 font-display font-black text-black disabled:opacity-40">
            ابعت
          </button>
        </form>
      )}
    </div>
  );
}

// Phones: bottom sheet over the game. The game stays mounted underneath, so answers and timers keep going.
export function ChatSheet({ snap }) {
  const { chatOpen } = useStore();
  const kb = useKeyboardInset();
  useEffect(() => {
    if (!chatOpen) return;
    const f = (e) => e.key === 'Escape' && api.chatOpen(false);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [chatOpen]);
  return (
    <AnimatePresence>
      {chatOpen && (
        <>
          <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-black/50" onClick={() => api.chatOpen(false)} />
          <motion.div
            key="sheet"
            role="dialog"
            aria-label="شات الأوضة"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed inset-x-0 z-[90] mx-auto max-w-xl overflow-hidden rounded-t-[28px] border-4 border-b-0 border-black bg-bg-elevated"
            style={{ bottom: kb, height: kb ? `calc(100dvh - ${kb}px - 56px)` : 'min(72dvh, 640px)', paddingBottom: kb ? 0 : 'var(--safe-bottom)' }}
          >
            <ChatBody snap={snap} onClose={() => api.chatOpen(false)} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Large screens: a side panel that takes its own column, so it never covers the game.
export function ChatSide({ snap, readOnly }) {
  const { chatOpen } = useStore();
  if (!chatOpen) return null;
  return (
    <aside className="relative z-20 hidden w-[340px] shrink-0 border-r-4 border-black bg-bg-elevated lg:block" style={{ height: 'calc(100dvh - 72px)', position: 'sticky', top: 72 }}>
      <ChatBody snap={snap} readOnly={readOnly} onClose={() => api.chatOpen(false)} />
    </aside>
  );
}
