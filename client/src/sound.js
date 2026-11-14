// Synthesized sound effects (no audio files) + light haptics.
import { getState } from './net.js';

let ctx = null;
function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// iOS needs the first sound to come from a user gesture.
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => ac(), { once: true });

function tone(freq, dur, type = 'square', vol = 0.08, to) {
  if (getState().muted) return;
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (to) o.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur + 0.02);
}
function noise(dur, vol = 0.15) {
  if (getState().muted) return;
  const a = ac();
  if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource();
  s.buffer = buf;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(g).connect(a.destination);
  s.start();
}
const later = (ms, f) => setTimeout(f, ms);

export const sfx = {
  tick: () => tone(1200, 0.03, 'square', 0.04),
  tap: () => tone(600, 0.06, 'triangle', 0.08, 900),
  pop: () => tone(300, 0.12, 'sine', 0.12, 800),
  whoosh: () => tone(200, 0.18, 'sine', 0.06, 900),
  go: () => {
    tone(880, 0.15, 'square', 0.1);
    later(90, () => tone(1320, 0.25, 'square', 0.1));
  },
  buzz: () => tone(110, 0.35, 'sawtooth', 0.12, 60),
  countdown: () => tone(440, 0.12, 'square', 0.08),
  countdownGo: () => tone(880, 0.35, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => later(i * 90, () => tone(f, 0.18, 'triangle', 0.1))),
  penalty: () => {
    tone(200, 0.4, 'sawtooth', 0.1, 80);
    noise(0.3, 0.08);
  },
  boom: () => {
    noise(0.6, 0.3);
    tone(80, 0.6, 'sine', 0.3, 30);
  },
  airhorn: () => {
    tone(466, 0.5, 'sawtooth', 0.12, 440);
    later(180, () => tone(466, 0.7, 'sawtooth', 0.12, 430));
  },
  music: (step) => tone([392, 440, 494, 523, 587, 523, 494, 440][step % 8], 0.18, 'triangle', 0.07),
};

export const haptic = {
  light: () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(25),
  heavy: () => navigator.vibrate?.([40, 30, 40]),
};
