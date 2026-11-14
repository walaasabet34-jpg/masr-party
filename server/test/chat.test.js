// Chat over real sockets: isolation, identity, limits, dedupe, history after reconnect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { cleanChat } from '../chat.js';

const PORT = 19000 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, snap: null, seq: 0, acks: new Map(), chat: new Map(), history: 0 };
  ws.on('message', (d) => {
    const s = d.toString();
    if (s === 'pong') return;
    const m = JSON.parse(s);
    if (typeof m.ack === 'number') return c.acks.get(m.ack)?.(m.a[0]);
    if (m.t === 'room:state') c.snap = m.a[0];
    if (m.t === 'chat:msg') c.chat.set(m.a[0].id, m.a[0]);
    if (m.t === 'chat:history') { c.history++; for (const x of m.a[0]) c.chat.set(x.id, x); }
  });
  c.open = new Promise((r) => ws.on('open', r));
  c.req = (t, ...a) => new Promise((r) => { const id = ++c.seq; c.acks.set(id, r); ws.send(JSON.stringify({ t, a, id })); });
  c.user = () => [...c.chat.values()].filter((m) => m.kind === 'user');
  return c;
}

test('cleanChat keeps Arabic, English and emoji, drops control and bidi tricks', () => {
  assert.equal(cleanChat('  يلا  بينا 🎉 let\'s go  '), "يلا بينا 🎉 let's go");
  assert.equal(cleanChat('a‮b\u0007c'), 'ab c');
  assert.equal(cleanChat('<b>x</b>'), '<b>x</b>'); // stays text; the page never renders it as HTML
  assert.equal(cleanChat('x'.repeat(500)).length, 300);
});

test('chat: room isolation, identity, limits, dedupe and history after reconnect', async (t) => {
  const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  t.after(() => srv.kill());
  await sleep(600);
  const host = client(); await host.open;
  const a = await host.req('room:create', { name: 'وفاء' });
  const reem = client(); await reem.open;
  const rj = await reem.req('room:join', { code: a.code, name: 'ريم' });
  const other = client(); await other.open;
  const b = await other.req('room:create', { name: 'غريب' });
  assert.notEqual(a.code, b.code);
  await sleep(200);

  // spoofing: payload fields other than text are ignored, the sender is the socket's seat
  const r1 = await reem.req('chat:send', { text: 'أهلًا يا وفاء 👋 hello', cid: 'c1', pid: a.playerId, name: 'وفاء' });
  assert.ok(r1.ok);
  await sleep(150);
  const got = host.user().find((m) => m.id === r1.id);
  assert.equal(got.pid, rj.playerId);
  assert.equal(got.name, 'ريم');
  assert.equal(got.text, 'أهلًا يا وفاء 👋 hello');
  // isolation: the other room never sees it, and cannot ask for it
  assert.equal(other.user().length, 0);
  const h = await other.req('chat:history', {});
  assert.ok(h.messages.every((m) => m.name !== 'ريم'));
  // a socket that is not in a room cannot send
  const stranger = client(); await stranger.open;
  assert.equal((await stranger.req('chat:send', { text: 'hi' })).error, 'not_member');

  // same client id again (a resend after reconnect) is stored once
  const r2 = await reem.req('chat:send', { text: 'أهلًا يا وفاء 👋 hello', cid: 'c1' });
  assert.ok(r2.ok && r2.dup && r2.id === r1.id);
  // flood guard and repeat guard
  await sleep(450);
  assert.equal((await reem.req('chat:send', { text: 'أهلًا يا وفاء 👋 hello', cid: 'c2' })).error, 'repeat');
  let slow = 0;
  for (let i = 0; i < 10; i++) { const r = await reem.req('chat:send', { text: 'رسالة ' + i, cid: 'f' + i }); if (!r.ok) slow++; await sleep(450); }
  assert.ok(slow >= 3, 'burst limit kicks in');
  assert.equal((await reem.req('chat:send', { text: '   ' })).error, 'empty');

  // reconnect: history comes back once, merged by id, plus "away"/"back" system lines
  const before = host.user().length;
  reem.ws.close();
  await sleep(9000); // long enough for the "connection dropped" note
  const back = client(); await back.open;
  assert.ok((await back.req('room:join', { code: a.code, playerId: rj.playerId, token: rj.token })).ok);
  await sleep(300);
  assert.equal(back.user().length, before);
  const ids = [...back.chat.keys()];
  assert.equal(new Set(ids).size, ids.length);
  const sys = [...host.chat.values()].filter((m) => m.kind === 'sys').map((m) => m.type);
  assert.ok(sys.includes('join') && sys.includes('away') && sys.includes('back'), sys.join(','));
});
