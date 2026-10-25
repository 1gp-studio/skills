# Native browser request example

Adapt this example to actual round state and lifecycle hooks. Replace boardId from the user’s copied prompt. The game may be embedded at any official platform address, so the handshake asks all of them and later requests go to the one that answered; do not hard-code a single address. Additionally check session.gameId against the configured gameId before using a session. This is illustrative game code, not an installed runtime dependency.

```js
// The platform's official addresses. Requests go to the one that answers the handshake.
const platforms = ['https://www.aiwanna.games', 'https://aiwanna.games', 'https://www.ai-made.games', 'https://ai-made.games', 'https://1gp-game-platform.vercel.app'];
let platform = platforms[0];
const boardId = 'YOUR_BOARD_ID';

function getPlayerSession() {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const finish = (error, session) => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      error ? reject(error) : resolve(session);
    };
    const receive = (event) => {
      const data = event.data;
      if (event.source !== window.parent || !platforms.includes(event.origin) ||
          !data || data.source !== 'aimadegames-platform' ||
          data.type !== 'leaderboard-session' || data.requestId !== requestId) return;
      if (data.error) return finish(new Error(data.error));
      if (data.apiOrigin !== event.origin || !data.session?.token) return;
      platform = event.origin;
      finish(null, data.session);
    };
    const timer = setTimeout(() => finish(new Error('Session timeout')), 15000);
    window.addEventListener('message', receive);
    // One copy per address; the browser delivers only the one the game is embedded in.
    for (const target of platforms)
      window.parent.postMessage({source:'aimadegames', type:'leaderboard-session', requestId}, target);
  });
}

async function request(path, token, body, key) {
  const response = await fetch(platform + '/api/v1/' + path, {
    method: key ? 'POST' : 'GET', credentials: 'omit',
    headers: {Authorization: 'Bearer ' + token,
      ...(key ? {'Idempotency-Key': key} : {}),
      ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error?.message), {
    code: data.error?.code, retryAfter: response.headers.get('Retry-After')
  });
  return data;
}

// Save these per round. Reuse the same keys when retrying that round.
const startKey = crypto.randomUUID();
const scoreKey = crypto.randomUUID();
const session = await getPlayerSession();
const run = await request('leaderboards/' + boardId + '/runs', session.token, null, startKey);

// At final game-over, use the actual integer score from your game:
async function submitFinalScore(score) {
  // Refreshing the token preserves this player's run.
  const current = Date.parse(session.expiresAt) <= Date.now() + 60000
    ? await getPlayerSession() : session;
  return request('runs/' + run.runId + '/score', current.token, {score}, scoreKey);
}
// Catch failures in your game's event handlers so gameplay can continue.
// Retry settlement with the SAME run, scoreKey and final score.
// For a new round create new keys and call the start endpoint again.
```
