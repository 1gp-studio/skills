# Writing the preview director

The preview is a short trailer that makes people want to play, not a recording of someone idling on the title screen. You write a **director**: a script that sets up the game's best moments one after another and steps the game frame by frame while `scripts/record.mjs` captures it.

## What a good preview looks like

The 渔喵传说 (Fishy Tails) trailer is the reference: 16 s, portrait.

| Time | Shot | Why |
|---|---|---|
| 0–3 s | The core loop at its most satisfying: bite → reel → a rare fish leaps out → reward card | The first second decides whether people keep watching. Show play, not menus. |
| 3–7 s | 6 cuts of 0.6 s: one highlight per area/level/character | Shows variety and how much game there is. |
| 7–11 s | The biggest spectacle: a boss, a huge combo, a chain reaction | The climax. |
| 11–14 s | The second system (shop, base, crafting), if the game has one | Depth. |
| 14–16 s | The title screen as an end card | People remember the name. |

Rules:
- **12–18 s in total.** Most shots are 0.6–3 s. One shot over 4 s only if something keeps happening in it.
- **Gameplay in the first second.** Never start on a loading screen, menu, tutorial text or a still frame.
- **Captions**: 4–6 Chinese characters or 1–3 English words, in the game's main language, on 3–4 shots at most. Place them where they don't cover the hero, the action or the HUD. One caption may stay across several consecutive cuts (「九片海域」 across the whole montage).
- **No screen shake, no flashing debug info, no cursor** unless the cursor is the game's own.
- **Seeded randomness** (record.mjs does it) so a good take can be re-recorded identically.
- The video has no sound; don't rely on music for impact.

Size matches the game: portrait games `--size 1080x1920`, landscape and desktop games `--size 1920x1080`. Never letterbox a portrait game into a wide video or the other way round.

## Getting at the game

Pick one way:

1. **Single-file or closure games** (`(() => { ... })()` in index.html): `--hook TEXT` pastes the director right before the last occurrence of `TEXT` in the entry HTML. That puts it inside the closure. Choose the line that starts the main loop, for example `--hook "requestAnimationFrame(frame);"`. The director can then call any function and assign any variable: `newRun()`, `go('title')`, `state = 'boss'`.
2. **Games with globals**: without `--hook`, the director runs in page scope and sees `window` properties and the top-level `let`/`const` of classic scripts.
3. **Bundled games** (Vite, webpack, ES modules) and **engine exports** (Godot, Unity, Construct, Phaser builds): internals are not reachable. Build the game first and pass the build folder, or start the dev server and pass `--url`. Then drive the game with real input: `REC.tap`, `REC.down`/`REC.move`/`REC.up`, `REC.key`.
   - If the game already has a debug or cheat hook (`?debug`, `window.game`), use it.
   - Do not edit game source to make recording easier.
   - Godot exports that use threads need `--isolate`.

Read the code to find how each moment is reached:
- state machine names (`go('fight')`, `scene.start('Boss')`);
- level setup (`setupZone(5)`, `loadLevel(3)`);
- spawners;
- reward and popup functions.

Forcing a state directly is better than playing for minutes to reach it. When the game needs input to keep going (holding to reel, steering), set the input variable in the per-frame callback (`hold = true`) or send real input.

## The REC API

The director is the body of an `async` function. Time only moves when you call `wait` or `skip`.

```js
REC.start();                       // frames from now on go into the video (REC.stop() pauses)
await REC.wait(3, t => { ... });   // step 3 s; the callback runs before every frame with t = seconds into the wait
await REC.skip(0.5);               // fast-forward 0.5 s without painting or recording (let a scene settle)
await REC.shot('02-boss');         // PNG into --shots; captions are hidden for it
await REC.tap(x, y);               // CSS px; REC.width × REC.height is the viewport
await REC.down(x, y); await REC.wait(1); await REC.up(x, y);   // hold
await REC.key('ArrowLeft', 0.5);   // press for 0.5 s of game time
REC.caption('挑战海怪', { y: .19, size: .085, font: '"Fusion Pixel",sans-serif', weight: 400 });  // y and size are fractions of the screen
REC.caption('');                   // clear
REC.log('state', state);           // printed in the terminal
```

Don't start a `REC.shot` from inside a `wait` callback without `await`-ing it. Take shots between waits, or `await` them in the callback.

## Example (abridged from 渔喵传说)

```js
wantedTrack = () => 'z0';
const gameRender = render; render = () => { shake = 0; gameRender(); };   // no screen shake
const fresh = zone => { cleanSlate(); go('idle'); newRun(); if (zone) setupZone(zone); };
const cap = (text, y = .19) => REC.caption(text, { y, size: .085, font: '"Fusion Pixel",sans-serif', weight: 400 });
REC.start();

// 1. hook: a shiny fish bites, gets reeled in and leaps out
fresh(0);
biter = { key: 'tang', x: 118, y: 196, face: -1, ph: 'bite', t: 0, n: 1, c: 0, shiny: true }; go('wait');
await REC.wait(3, t => {
  if (state === 'wait' && t > .45) { startFight(); hold = true; }
  if (state === 'fight') hold = true;
});
await REC.shot('01-catch');

// 2. montage: one leap per sea, 0.62 s each, one caption across all of them
cap('九片海域', .7);
for (const zone of [1, 2, 3, 4, 7, 8]) {
  fresh(zone); await REC.skip(.3);
  F = { key: best(zone), x: 120, y: SURF + 1 }; catchFish();
  await REC.wait(.62);
}

// 3. boss, its pull scripted so the cut lands on time
cap('挑战海怪');
fresh(5); startBoss(); await REC.skip(.35);
await REC.wait(4.2, () => { if (state === 'boss') { hold = true; B.p = Math.min(1, B.p + 1 / 30 * .27); } });
await REC.shot('03-boss');

// 4. end card
cap('');
go('title');
await REC.wait(2.4);
```

Record it:

```bash
node <skill>/scripts/record.mjs <gameDir> --director /tmp/kit/trailer.js --hook "requestAnimationFrame(frame);" --lang zh-CN --size 1080x1920 --video 1gp-kit/preview.webm --shots 1gp-kit/shots --frames /tmp/kit/frames
```

## Review before you keep it

- Open the JPEGs in `--frames` (one every 0.5 s) in order. If ffmpeg is installed, `ffmpeg -i preview.webm -vf "fps=1.5,scale=216:-1,tile=9x3" -frames:v 1 sheet.jpg` makes one contact sheet.
- Check:
  - Is there gameplay in the first frame?
  - Does every cut show something new?
  - Do any captions cover the action?
  - Are there errors, blank frames or debug text?
- Fix the director and record again. The seed makes takes repeatable; change `--seed` for a different take.
- Keep the file ≤ 20 MB. A shorter video or a lower `--bitrate` (default 6 Mbps) brings it down.
