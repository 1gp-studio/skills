---
name: 1gp-cloud-save
description: Integrate 1GP platform cloud saves into a browser game, including explicit state serialization, loading before gameplay, local persistence, and save-format migrations. Use with the game's cloud-save integration prompt from its 1GP page.
metadata:
  version: "1.1.0"
---

# 1GP cloud saves

Use the game ID, platform origin and schema version from the user's copied integration prompt. Read `<platformOrigin>/cloud-save-api.md` for the current contract before implementing. The optional dependency-free SDK is `<platformOrigin>/sdk/cloud-saves-v1.js`; a native REST implementation must preserve the same conflict, identity, and startup rules.

Inspect the game's existing persistence and boot sequence. Define a JSON snapshot containing everything required to resume at its supported checkpoint. Use stable IDs for entities and assets. Convert engine objects, maps, sets, dates and large integers explicitly. Do not collect the entire origin's localStorage or serialize the running engine. Preserve existing standalone/local play.

With the SDK, await `AIMadeGames.saves.initialize({platformOrigin, gameId, schemaVersion, gameVersion, exportState, importState, migrateState, summary})` before starting gameplay. Use the exact callback signatures in the API guide. `migrateState` is needed only when older formats exist. If initialization remains pending because the player must resolve a conflict or retry, do not start a fresh game that can overwrite their save. The platform provides management and conflict UI; the game does not need its own main menu.

Call `save()` after checkpoints and important changes. Keep complete snapshots small (256 KiB UTF-8 for the whole request), use a short readable summary, and let the SDK persist pending work and retry. Do not place account credentials, developer secrets, or unrelated personal information in saves. Cloud persistence does not make client-reported rewards or leaderboard scores authoritative.

Keep these invariants when implementing native REST or adapting an engine:

- Get a dedicated cloud-save session through the mounted platform iframe handshake. Leaderboard tokens are not save tokens. The game may be embedded at any official platform origin (`['https://www.aiwanna.games', 'https://aiwanna.games', 'https://www.ai-made.games', 'https://ai-made.games', 'https://1gp-game-platform.vercel.app']`): ask each, accept a reply only from one on that list, and then use the origin that replied. Validate parent window, request ID and game ID; never send credentials or state to `*`.
- A failed read is not an empty save. Only a successful read establishes the base revision. Signed-out players keep their progress locally.
- Include `baseRevision` and a UUID `Idempotency-Key` when writing. Preserve both the key and the request body on retries. Mutation receipts contain metadata; GET returns the full snapshot.
- On a revision conflict, keep both versions and obtain the player's choice. Never use device timestamps or unconditional last-write-wins.
- Separate local caches and pending requests by platform, game and account identity. Stop the old game instance on account changes; never upload its state into the newly selected account.
- Migrate older snapshots intentionally. Preserve unreadable newer snapshots and require an updated game. Do not silently replace them with a fresh start.
- Honor the documented platform pause/discard/reload command acknowledgements so restoring a backup does not race an autosave.

Validate a real save/load round trip before declaring support: refresh, second device/account session, offline save and retry, two conflicting sessions, schema migration, signed-out play, account switch, and platform backup restore/reset/delete. Confirm the game can actually resume; loading the SDK alone is not proof of integration.

Change only the requested game integration. Report which state is restored, what checkpoint boundaries apply, and any engine limitations. Publishing the game or altering production data remains a separate action requiring appropriate user authorization.
