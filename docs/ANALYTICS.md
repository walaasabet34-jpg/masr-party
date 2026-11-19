# Product analytics (PostHog)

Analytics only **observes** the game. It never changes game mechanics, scoring or UI. With no key
configured, every call is a silent no-op, so local dev and tests run as before.

## Architecture

| Where | What | Why |
|---|---|---|
| `server/analytics.js` (posthog-node) | `room_created`, `room_joined`, `game_started`, `player_game_started`, `game_selected`, `round_completed`, `player_round_completed`, `basra_match_completed`, `party_ended`, `game_exited` | The server owns room state, so each event fires once on the real state transition. A refresh or reconnect re-takes the same seat and cannot duplicate anything. |
| `client/src/posthog.js` (posthog-js) | `game_opened`, `$pageview` (journey), `chat_message_sent`, `mission_claimed` (counts only), exceptions, session replay | Things only the browser knows |
| `server/index.js` | ~12 one-line hooks in connection handlers and the tick loop | No change to `room.js` or any game |

The browser sends its anonymous PostHog `distinct_id` and `session_id` with create/join/resume
(`aid`, `sid`). Server events then join the same player journey and session replay.

## Events

| Event | Fires | Key properties |
|---|---|---|
| `game_opened` | first load of a browser tab session (sessionStorage; a reload does not count) | `entry` (`direct`/`invite_link`), `has_saved_session` |
| `room_created` | host creates a room | `room_id`, `format` (`party`/`basra`), `mode`, `host_surface` (`phone`/`screen`) |
| `room_joined` | a **new seat** is taken (not reconnects) | `room_phase`, `joined_mid_game`, `player_count` |
| `game_started` | a night starts (lobby → play, or "play again"); **room/host-level** | `play_again`, `total_rounds`, `missions`, `games_enabled`, `player_count` |
| `player_game_started` | each connected player when the night starts; also an arriving player if joining an active night | `late_join`, `play_again` (when a night starts) |
| `game_selected` | a mini-game round actually begins (Basra: once per match) | `game_id`, `game_kind`, `round`, `player_count` |
| `round_completed` | a round resolves (Basra: each hand); **room/host-level** | `game_id`, `round`, `skipped`, `round_duration_ms`, `player_count`, `winners_count`, `deductions_count` |
| `player_round_completed` | a player participated in a completed (not skipped) round/hand | `game_id`, `round` |
| `basra_match_completed` | a Basra match reaches its actual `over` stage (not merely one finished hand) | `game_id`, `hands_completed` |
| `party_ended` | the night ends | `end_reason` (`completed`/`host_ended`/`room_closed`), `rounds_completed`, `night_duration_ms` |
| `game_exited` | a player leaves the room, once per seat | `exit_reason` (`left`/`kicked`/`disconnected` after 2 min away/`room_closed`/`idle`), `session_duration_ms`, `rounds_played` |
| `$pageview` | screen change | `$pathname` = `/app/home`, `/app/lobby`, `/app/briefing`, `/app/play/<game_id>`, `/app/ended`… |

Every server event carries `room_id`, `format`, `mode`, `host_surface` and `player_count`.

## Privacy

- **Never sent:** player names, chat text, prompts, answers, drawings, cards, room codes, seat tokens.
  `room_id` is a salted SHA-256 hash (new salt each process start), so it cannot be turned back
  into a join code.
- **Anonymous only:** no `identify()` and `person_profiles: 'identified_only'`. Server events set
  `$process_person_profile: false`, and server GeoIP is off.
- **No autocapture, heatmaps, dead clicks or automatic pageviews.** Button text would include names.
- **URLs:** query strings and fragments are stripped in `before_send`, and the `join` param is
  masked by the SDK in initial person info and `/flags`. The Vite client stops sending the wizard's
  boot log, because log records bypass `before_send` and carried `?join=CODE`.
- **Session replay:** every input and every text node is masked (`maskTextSelector: '*'`).
  Human-readable attributes (`aria-label`, `title`, `placeholder`, `alt`, `value`, `data-*`, …) are
  masked through `maskAttributeFn`, while `class`/`style` are kept so replays still render.
  Console logs, network headers and bodies, and canvas are not recorded. Add `data-ph-block` to
  any element to remove it from replays entirely. Set `VITE_POSTHOG_REPLAY=off` to disable replay.
- **Recommended PostHog project settings:** enable *Discard client IP data*; under Session replay,
  set *Mask all inputs* and *Mask all text* on as well (belt and braces); set a minimum duration
  (e.g. 5 s) and a sample rate (e.g. 25–50 %) to stay within the free tier.

## Setup on Render (when approved)

1. Create a PostHog project (EU or US cloud) and copy the project token.
2. In Render → service → Environment, add `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`,
   `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` (the host is e.g. `https://eu.i.posthog.com`).
   The `VITE_*` vars are read at build time, so a rebuild is needed.
3. Deploy, open the site, and check *Activity → Live events*.

## Tests

- `server/test/analytics.test.js` drives real sockets against a mock ingestion endpoint and checks:
  - Each lifecycle event fires exactly once; refreshes are not joins.
  - Skipped rounds, kick/leave/disconnect/room-close exits, play-again and Basra hands are all reported.
  - No names, codes, tokens or chat appear in any payload.
- A browser check (Playwright against a mock PostHog, run during development) decodes every posthog-js request, including the
  gzip-compressed replay frames, and verifies:
  - One `game_opened` across a reload.
  - Journeys use code-free paths.
  - Server and browser share the same anonymous id.
  - No names, chat, room code or Arabic text appear in replay frames.
  - With no key there are zero external requests.

## Proposed dashboard: "Sahra Tal2a — Product"

| # | Insight | Type & definition |
|---|---|---|
| 1 | **Active players** (DAU / WAU / MAU) | Trends, unique users of `room_joined` + `room_created`, daily, plus weekly/monthly series. Add a stickiness insight (DAU/MAU) on the same events. |
| 2 | **Visitors → players funnel** | **Unique persons**, steps `game_opened` → (`room_created` OR `room_joined`) → `player_game_started` → `player_round_completed` (within 1 h). The room events `game_started` and `round_completed` are attributed to the host and must not be used as individual-player funnel steps. Break down by `entry` only where supported by the event properties/person settings. |
| 3 | **Game popularity** | Trends, total `game_selected` broken down by `game_id`, shown as a bar chart, last 30 days. Also a pie chart of `format` (party vs Basra). |
| 4 | **Completion rate per game** | **Party mini-games only:** `round_completed` with `skipped = false` / `game_selected`, broken down by `game_id` and excluding `basra`. **Basra match completion:** `basra_match_completed` / `game_selected` filtered to `game_id = basra`. **Basra hand activity:** count `round_completed` filtered to `game_id = basra` separately; do not divide hand count by match starts. Use consistent windows and inspect cohort boundaries before treating ratios as actual completion rates. |
| 5 | **Night completion** | Trends of `party_ended` broken down by `end_reason`, plus formula `completed / game_started` |
| 6 | **Engagement: rounds per night** | Trends, average of `party_ended.rounds_completed`, weekly |
| 7 | **Session duration** | Trends, median and p90 of `game_exited.session_duration_ms` (÷ 60000 for minutes), plus `night_duration_ms` |
| 8 | **Players per room** | Trends, average `game_started.player_count`, and a distribution by `player_count` |
| 9 | **Why players exit** | Trends of `game_exited` broken down by `exit_reason`, stacked |
| 10 | **Retention** | Retention insight: start event `room_joined` or `room_created`, return event the same, weekly, 8 weeks. Add a second one on `game_opened` for visitors. |
| 11 | **Player journeys** | Paths insight on `$pageview` (`$pathname`), starting at `/app/home`, to see where people drop off before joining |
| 12 | **Replay playlist** | Saved filter: recordings with `game_exited.exit_reason = disconnected`, or with `round_completed.skipped = true`, to see UX friction |

**Metric limitations:** `game_opened` is one event per browser tab session, not a verified unique human; PostHog distinct IDs are anonymous browser IDs. A phone and big-screen session are separate browser identities. `game_started` / `party_ended` are room/host events; `player_game_started` / `player_round_completed` are individual player events. Replays of room-level events may link to the host rather than every guest. A Basra hand ending is not the same as a completed Basra match. Avoid combining those units when charting.

Suggested cohorts: *Hosts* (did `room_created`), *Returning players* (`room_joined` in 2+ different
weeks) and *Basra players* (`game_selected` where `game_id = basra`).
