import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './posthog.js';
import App from './App.jsx';

// Keyboard parity for touch-first controls: many game pads react to pointerdown (for speed),
// so Enter/Space on a focused button sends the same pointer events.
document.addEventListener('keydown', (e) => {
  const b = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && b instanceof HTMLButtonElement && !b.dataset.nokey) {
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, isPrimary: true }));
  }
});
document.addEventListener('keyup', (e) => {
  const b = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && b instanceof HTMLButtonElement && !b.dataset.nokey) {
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, isPrimary: true }));
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
