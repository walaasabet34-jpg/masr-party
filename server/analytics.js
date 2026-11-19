// Product analytics (PostHog). Server-side so lifecycle events fire once, on the real state
// transition — a page refresh or socket reconnect can never re-send "game_started".
//
// Privacy rules enforced here:
//  - no player names, chat text, prompts, answers or room codes are ever sent;
//  - rooms are identified by a salted hash that cannot be turned back into the join code;
//  - people are the browser's anonymous PostHog id (never identified), no person profiles.
//
// Observation only: nothing in this file reads back into the game, and every call is wrapped
// so an analytics failure can never break a room.
import { createHash, randomBytes } from 'node:crypto';
import { PostHog } from 'posthog-node';
import { getGame } from './games/index.js';

const KEY = process.env.POSTHOG_PROJECT_TOKEN;
const HOST = process.env.POSTHOG_HOST;
const DISABLED = process.env.POSTHOG_DISABLED === '1';
const EXIT_AFTER_AWAY_MS = Number(process.env.ANALYTICS_EXIT_AFTER_MS) || 2 * 60 * 1000;
const SALT = randomBytes(16).toString('hex'); // per process: hashes are not linkable across restarts

let client = null;
if (KEY && HOST && !DISABLED) {
  client = new PostHog(KEY, {
    host: HOST,
    flushAt: Number(process.env.POSTHOG_FLUSH_AT) || 20,
    flushInterval: Number(process.env.POSTHOG_FLUSH_INTERVAL_MS) || 10000,
    disableGeoip: true, // the server's IP says nothing about the player
  });
  client.on?.('error', () => {});
}

export const analyticsEnabled = () => !!client;

const hash = (s) => createHash('sha256').update(SALT + s).digest('hex').slice(0, 16);
// ids from the browser SDK: uuid-like strings only, anything else is dropped
const cleanId = (v) => (typeof v === 'string' && /^[A-Za-z0-9._:-]{8,80}$/.test(v) ? v : null);

const roomInfo = new WeakMap();
function info(room) {
  let r = roomInfo.get(room);
  if (!r) {
    r = {
      id: hash(room.code + ':' + room.createdAt),
      host: null, // { aid, sid } of whoever created the room
      people: new Map(), // playerId -> { aid, sid, joinedAt, rounds, exited }
      phase: room.phase,
      gameStartedAt: room.game?.startedAt ?? null,
      gameId: room.game?.id ?? null,
      result: room.lastResult,
      nightStartedAt: null,
      roundsThisNight: 0,
      hand: null,
      handStage: null,
      handStartedAt: null,
    };
    roomInfo.set(room, r);
  }
  return r;
}

function person(room, playerId) {
  const r = info(room);
  let p = r.people.get(playerId);
  if (!p) {
    p = { aid: null, sid: null, joinedAt: Date.now(), rounds: 0, exited: false };
    r.people.set(playerId, p);
  }
  return p;
}

function base(room) {
  const r = info(room);
  return {
    room_id: r.id,
    format: room.settings.format === 'boat' ? 'basra' : 'party',
    mode: room.settings.mode,
    host_surface: room.displayToken ? 'screen' : 'phone',
    player_count: room.players.filter((p) => p.connected).length,
  };
}

function send(distinctId, event, properties, sid) {
  if (!client) return;
  try {
    client.capture({
      distinctId,
      event,
      properties: { ...properties, ...(sid ? { $session_id: sid } : {}), $process_person_profile: false, source: 'server' },
    });
  } catch {
    /* analytics never breaks the game */
  }
}

// room-level events are attributed to the host's browser (or the room hash if it has no SDK)
function roomEvent(room, event, props) {
  const r = info(room);
  send(r.host?.aid ?? 'room_' + r.id, event, { ...base(room), ...props }, r.host?.sid);
}
function playerEvent(room, playerId, event, props) {
  const p = person(room, playerId);
  send(p.aid ?? 'player_' + hash(info(room).id + playerId), event, { ...base(room), ...props }, p.sid);
}

const safe = (f) => (...a) => {
  try {
    f(...a);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.warn('analytics', e);
  }
};

// Called by connection handlers with the ids the browser SDK sent (optional, validated).
export const remember = safe((room, playerId, ids = {}) => {
  const aid = cleanId(ids.aid);
  const sid = cleanId(ids.sid);
  if (playerId) {
    const p = person(room, playerId);
    if (aid) p.aid = aid;
    if (sid) p.sid = sid;
  }
  return { aid, sid };
});

export const roomCreated = safe((room, playerId, ids = {}) => {
  const r = info(room);
  r.host = { aid: cleanId(ids.aid), sid: cleanId(ids.sid) };
  if (playerId) remember(room, playerId, ids);
  roomEvent(room, 'room_created', { player_count: room.players.length });
});

export const roomJoined = safe((room, player, ids = {}) => {
  remember(room, player.id, ids);
  playerEvent(room, player.id, 'room_joined', {
    room_phase: room.phase === 'boat' ? 'playing' : room.phase,
    joined_mid_game: !!player.late,
    player_count: room.players.length,
  });
});

function exit(room, playerId, reason, now = Date.now()) {
  const p = person(room, playerId);
  if (p.exited) return;
  p.exited = true;
  playerEvent(room, playerId, 'game_exited', {
    exit_reason: reason,
    room_phase: room.phase === 'boat' ? 'playing' : room.phase,
    session_duration_ms: Math.max(0, now - p.joinedAt),
    rounds_played: p.rounds,
  });
}
export const playerExited = safe((room, player, reason) => exit(room, player.id, reason));

function endNight(room, reason, now) {
  const r = info(room);
  if (!r.nightStartedAt) return;
  roomEvent(room, 'party_ended', {
    end_reason: reason,
    rounds_completed: r.roundsThisNight,
    night_duration_ms: now - r.nightStartedAt,
  });
  r.nightStartedAt = null;
}

export const roomClosed = safe((room, reason) => {
  const now = Date.now();
  const r = info(room);
  if (r.phase !== 'lobby' && r.phase !== 'ended') endNight(room, 'room_closed', now);
  for (const id of r.people.keys()) exit(room, id, reason === 'idle' ? 'idle' : 'room_closed', now);
});

// Compare the room with what we saw last time and report each transition exactly once.
export const observe = safe((room, cause = 'tick', now = Date.now()) => {
  if (!client) return;
  const r = info(room);
  const was = r.phase;
  const is = room.phase;

  // a night begins: lobby -> briefing/boat, or ended -> briefing/boat through "play again"
  if ((was === 'lobby' || was === 'ended') && (is === 'briefing' || is === 'boat')) {
    r.nightStartedAt = now;
    r.roundsThisNight = 0;
    roomEvent(room, 'game_started', {
      play_again: cause === 'room:playAgain',
      total_rounds: is === 'boat' ? null : room.settings.totalRounds || 'unlimited',
      missions: !!room.settings.missions,
      games_enabled: room.settings.enabledGames.length || 'all',
    });
    if (is === 'boat') {
      roomEvent(room, 'game_selected', { game_id: 'basra', game_name: 'Basra', game_kind: 'cards', round: 1 });
    }
  }

  // party mini-game picked and started
  if (room.game && room.game.startedAt !== r.gameStartedAt) {
    const g = getGame(room.game.id);
    roomEvent(room, 'game_selected', {
      game_id: g.id,
      game_kind: g.kind ?? null,
      round: room.round,
      player_count: room.game.roster.length,
    });
    r.gameStartedAt = room.game.startedAt;
    r.gameId = g.id;
  }

  // a mini-game round resolved (normally, or skipped by the host)
  if (room.lastResult && room.lastResult !== r.result) {
    const res = room.lastResult;
    r.roundsThisNight += 1;
    for (const id of res.roster ?? []) person(room, id).rounds += 1;
    roomEvent(room, 'round_completed', {
      game_id: res.gameId,
      round: res.round,
      skipped: cause === 'room:skipRound',
      round_duration_ms: r.gameStartedAt ? now - r.gameStartedAt : null,
      player_count: res.roster?.length ?? null,
      winners_count: res.winners?.length ?? 0,
      deductions_count: Object.keys(res.deductions ?? {}).length,
    });
  }
  r.result = room.lastResult;

  // Basra: each finished hand is a round
  const b = is === 'boat' ? room.boat : null;
  if (b) {
    if (b.hand !== r.hand) {
      r.hand = b.hand;
      r.handStartedAt = now;
    }
    const done = b.stage === 'handOver' || b.stage === 'over';
    const wasDone = r.handStage === 'handOver' || r.handStage === 'over';
    if (done && !wasDone) {
      r.roundsThisNight += 1;
      for (const id of b.order) person(room, id).rounds += 1;
      roomEvent(room, 'round_completed', {
        game_id: 'basra',
        round: b.hand,
        skipped: false,
        round_duration_ms: r.handStartedAt ? now - r.handStartedAt : null,
        player_count: b.order.length,
        match_over: b.stage === 'over',
      });
    }
    r.handStage = b.stage;
  } else {
    r.hand = r.handStage = r.handStartedAt = null;
  }

  // the night ends (last round, host ended it, or Basra match finished and host closed it)
  if (is === 'ended' && was !== 'ended') {
    endNight(room, cause === 'room:end' ? 'host_ended' : 'completed', now);
  }
  // back to lobby mid-night counts as ended by host
  if (is === 'lobby' && was !== 'lobby' && was !== 'ended') endNight(room, 'host_ended', now);
  r.phase = is;

  // a player that stays disconnected is treated as having left (refreshes reconnect in seconds)
  for (const p of room.players) {
    if (!p.connected && p.awaySince && now - p.awaySince > EXIT_AFTER_AWAY_MS) exit(room, p.id, 'disconnected', now);
  }
});

export async function shutdownAnalytics() {
  if (!client) return;
  try {
    await Promise.race([client.shutdown(), new Promise((r) => setTimeout(r, 2000).unref())]);
  } catch {
    /* ignore */
  }
}
