// UI registry: one { Phone, Big } pair per mini-game id. Rules live on the server.
import reflex from './reflex.jsx';
import brain from './brain.jsx';
import social from './social.jsx';
import chaos from './chaos.jsx';
import fresh from './fresh.jsx';

export const GAME_UI = { ...reflex, ...brain, ...social, ...chaos, ...fresh };
