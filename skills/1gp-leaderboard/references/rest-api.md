# 1GP leaderboard REST v1

All paths are relative to the platform origin supplied in the user's copied prompt, followed by `/api/v1`. The game uses native HTTP requests, not a platform script. `boardId` is the REST identifier; the `key` is not needed for these paths.

## Player token

Inside the platform's game iframe, register a `message` listener, then send:

```js
window.parent.postMessage({
  source: 'aimadegames', type: 'leaderboard-session',
  requestId: crypto.randomUUID()
}, platformOrigin);
```

Accept only messages from `window.parent` with `event.origin === platformOrigin`, `source === 'aimadegames-platform'`, `type === 'leaderboard-session'`, and the matching requestId. Successful replies contain `apiOrigin === platformOrigin` and `session: {token, expiresAt, gameId, player: {displayName, isGuest}}`. Failure replies contain `error`. Validate session.gameId against the configured gameId. Timeout and remove the listener after 15 seconds. The platform performs the same-origin POST `/games/{gameId}/sessions` itself; a cross-origin game cannot mint sessions using platform login cookies.

The token lasts one hour and is scoped to the game, player and registered game origin. Keep it in memory. Refresh with the same handshake. Guests retain browser-scoped identity; login does not merge guest scores. Redirecting a game to another origin requires its registered play URL to be updated. Standalone games cannot perform this handshake.

## Requests

Use `credentials: 'omit'` and `Authorization: Bearer <token>`. For JSON send `Content-Type: application/json`. CORS supports these headers and `Idempotency-Key`; responses expose `Retry-After`. Check response.ok before treating JSON as success.

| Method and path | Purpose and response |
| --- | --- |
| GET `/games/{gameId}/leaderboards` | Enabled boards in `{leaderboards:[...]}`. |
| POST `/leaderboards/{boardId}/runs` | Actual round start, no body, UUID Idempotency-Key. 201 `{runId,startedAt,submitBefore}`. Same key returns the same run. |
| POST `/runs/{runId}/score` | Final score, separate UUID Idempotency-Key, body `{"score":12800}`. 200 `{accepted,submittedScore,personalBest,isPersonalBest,rank,participants}`. |
| GET `/leaderboards/{boardId}/entries?limit=10&cursor=...` | `{entries:[...],nextCursor}`. Limit 1–50. Pass cursor unchanged; null ends pagination. |
| GET `/leaderboards/{boardId}/me?around=2` | `{entry,neighbors}`; around 0–10. No score or hidden score yields null entry and empty neighbors. |

Each entry contains entryId, score, rank, achievedAt, isMe and player {displayName, avatarUrl, isGuest}; avatar paths beginning with `/` are relative to the platform. Public entries never expose account IDs. Live rankings may change across pages; deduplicate by entryId.

Scores are nonnegative integers within the supplied minScore/maxScore and at most 9,000,000,000,000. `desc` retains the largest personal best; `asc` retains the smallest. `milliseconds` uses integer milliseconds; `points` and `count` retain game-defined meaning. minPlayMs is measured by the server since run creation. Runs expire after two hours. Allow at most 20 starts and 20 successful settlements per player per minute. Session creation is also rate-limited.

A lower result is accepted but does not replace a better personal best. Tied scores share rank. Hidden entries stay hidden after improvement and return null rank. A repeated settlement with the same key and score returns the original receipt; changed key or score returns 409. The receipt's rank is from settlement time; GET /me reads the current rank. Receipts remain for 30 days after run expiry.

## Errors

Shape: `{"error":{"code":"...","message":"..."}}`.

- 400 INVALID_INPUT / INVALID_CURSOR: fix parameters; do not blindly retry.
- 401 SESSION_EXPIRED: refresh through the parent, then retry the same operation once.
- 403 FORBIDDEN: wrong game/origin/player or revoked access; stop ranking for that operation.
- 404 NOT_FOUND / BOARD_UNAVAILABLE / RUN_NOT_FOUND: check configuration or disabled board.
- 409 ALREADY_SUBMITTED: stop resubmitting; read current personal rank if needed.
- 410 RUN_EXPIRED: cannot settle this run; do not fabricate a replacement round.
- 422 INVALID_SCORE: bounds or minimum duration failed; do not mutate the score to force acceptance.
- 429 RATE_LIMITED: respect Retry-After (currently 60 seconds); bound retries.
- 503 SERVICE_UNAVAILABLE or network timeout: allow play; retry with original keys, run and score when appropriate.

Client-reported results are for casual ranking, not proof against cheating. Board creation, disabling and moderation are publisher-only website operations and outside this skill's integration task.
