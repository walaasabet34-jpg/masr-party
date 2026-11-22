// PostHog product analytics for the browser. Privacy-first by design:
//  - no autocapture (button text would include player names) and no automatic pageviews;
//  - anonymous only: nobody is ever identified, no person profiles are created;
//  - URLs are stripped of ?join=CODE and #fragments before anything leaves the tab;
//  - session replay masks every input and every piece of text (names, chat, answers).
// Without VITE_POSTHOG_KEY / VITE_POSTHOG_HOST everything here is a silent no-op.
import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST;
const replay = import.meta.env.VITE_POSTHOG_REPLAY !== 'off';
// automated browser tests only: headless Chromium is otherwise (correctly) dropped as a bot
const allowBots = import.meta.env.VITE_POSTHOG_ALLOW_BOTS === '1';

const URL_PROPS = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer', '$session_entry_url', '$prev_pageview_url'];
const QUERY_PROPS = ['$pathname', '$initial_pathname', '$session_entry_pathname', '$prev_pageview_pathname'];

function stripUrl(v) {
  if (typeof v !== 'string' || !v || v === '$direct') return v;
  try {
    const u = new URL(v);
    return u.origin + u.pathname;
  } catch {
    return v.split(/[?#]/)[0];
  }
}

export function sanitize(event) {
  if (!event?.properties) return event;
  const p = event.properties;
  for (const k of URL_PROPS) if (k in p) p[k] = stripUrl(p[k]);
  for (const k of QUERY_PROPS) if (typeof p[k] === 'string') p[k] = p[k].split(/[?#]/)[0];
  for (const k of ['$set', '$set_once']) {
    const s = event[k] ?? p[k];
    if (s) for (const u of URL_PROPS.concat(QUERY_PROPS)) if (typeof s[u] === 'string') s[u] = stripUrl(s[u]).split(/[?#]/)[0];
  }
  delete p.$search_engine_query;
  // replay "meta" frames carry the page URL
  if (Array.isArray(p.$snapshot_data)) {
    for (const f of p.$snapshot_data) if (f?.type === 4 && f.data?.href) f.data.href = stripUrl(f.data.href);
  }
  return event;
}

// attributes that can carry readable text (card names, the room code, chat badges): masked in
// replays. Layout attributes (class, style, ...) are kept so the replay still renders.
const TEXT_ATTRS = new Set(['aria-label', 'aria-valuetext', 'aria-description', 'aria-roledescription', 'title', 'alt', 'placeholder', 'value', 'label', 'content', 'href', 'download']);
export const maskAttribute = (name, value) => (value && (TEXT_ATTRS.has(name) || name.startsWith('data-')) ? '*'.repeat(Math.min(String(value).length, 12)) : value);

export const enabled = !!(key && host);

if (!enabled) {
  if (import.meta.env.DEV) console.info('PostHog off: set VITE_POSTHOG_KEY and VITE_POSTHOG_HOST to enable analytics.');
} else {
  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    opt_out_useragent_filter: allowBots,
    // the invite link is /?join=CODE: mask it everywhere the SDK records URLs, incl. /flags
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['join'],
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    rageclick: false,
    disable_surveys: true,
    capture_performance: false,
    enable_heatmaps: false,
    save_referrer: false,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_session_recording: !replay,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      maskInputOptions: { password: true, text: true, email: true, tel: true, search: true, textarea: true },
      blockSelector: '[data-ph-block]',
      maskAttributeFn: maskAttribute,
      recordCrossOriginIframes: false,
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: () => null,
    },
    before_send: sanitize,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    logs: {
      serviceName: 'masr-party-web',
      environment: import.meta.env.MODE,
      serviceVersion: '0.3.0',
    },
  });
}

export function capture(event, props) {
  if (enabled) posthog.capture(event, props);
}

// ids handed to the server so its lifecycle events join the same anonymous journey/replay
export function analyticsIds() {
  if (!enabled) return {};
  try {
    return { aid: posthog.get_distinct_id(), sid: posthog.get_session_id() };
  } catch {
    return {};
  }
}

// once per browser tab session: a refresh of the same tab is not a new "open"
export function trackOpened(props) {
  if (!enabled) return;
  try {
    if (sessionStorage.getItem('ph_opened')) return;
    sessionStorage.setItem('ph_opened', '1');
  } catch {
    /* storage blocked: still count it */
  }
  posthog.capture('game_opened', props);
}

// Journeys: a synthetic, code-free path per screen (e.g. /app/lobby, /app/play/<game>)
let lastScreen = null;
export function trackScreen(screen) {
  if (!enabled || !screen || screen === lastScreen) return;
  lastScreen = screen;
  posthog.capture('$pageview', { $current_url: location.origin + '/app/' + screen, $pathname: '/app/' + screen, screen });
}

export default posthog;
