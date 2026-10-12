---
name: 1gp-store-kit
description: Generate a game's 1GP store-page materials (title, description, category, tags, AI tools, screen, session length, maker notes, cover, screenshots, gameplay preview) into a .1gp folder the creator imports with one click. Use when the user wants to publish or update a game on 1GP, asks for a cover, screenshots, preview video, tags or a store description, or says 上架物料 / 发布素材 / 做封面.
metadata:
  version: "1.0.0"
---

# 1GP store kit

Write everything into `.1gp/` at the game project root. The creator then clicks 导入上架物料 in the 1GP publish wizard or in the game's 编辑 dialog, picks that folder, reviews the filled form and saves. Nothing here publishes or changes the live game.

The leading dot keeps the 1GP publisher MCP from uploading the folder with the game. Do not put the kit inside a build output directory.

```
.1gp/
  game.json
  cover.png
  shots/01.png … (3–5 files)
  preview.webm
```

## 1. Understand the game first

Read the README, entry HTML, main scripts and any design doc. Run the game (step 3) before writing copy. Write about what is actually on screen, not what the code comments promise. Detect the game's language from its UI text and write all copy in that language. Default to Simplified Chinese when the UI mixes languages.

## 2. game.json

Every key is optional; omit a key you cannot determine rather than guessing. Never include access/whitelist or remix permission. Those are the creator's own decisions.

```json
{
  "title": "喵喵消消乐",
  "description": "…",
  "genre": "puzzle",
  "tags": ["像素风", "猫", "单手玩"],
  "tools": ["Claude Code"],
  "orientation": "portrait",
  "session": "short",
  "notes": "…",
  "cover": "cover.png",
  "screenshots": ["shots/01.png", "shots/02.png", "shots/03.png"],
  "preview": "preview.webm"
}
```

| Key | Rules |
|---|---|
| `title` | The in-game title, 1–120 characters. Do not invent a new name when the game already shows one. |
| `description` | ≤2000 characters. The first sentence appears on cards: say what you do and why it's fun, ≤40 characters. Then 2–4 short lines: how to play (the real controls), the goal, one highlight. No hype words (史诗级, 最好玩), no emoji spam, no claims you did not see in play. |
| `genre` | Exactly one of `casual` 休闲, `puzzle` 益智解谜, `action` 动作, `strategy` 策略, `simulation` 模拟经营, `adventure` 冒险剧情, `idle` 放置, `rhythm` 音乐节奏, or `null`. |
| `tags` | ≤5 tags, each ≤12 characters, no commas, `#` or spaces. Short and objective: the protagonist, the art style, the core mechanic, the control style (像素风, 猫, 三消, 单手玩, Roguelike). Never repeat the genre name and never use a `类` suffix. |
| `tools` | Only from `Claude Code`, `Cursor`, `Codex`, `ChatGPT`, `Claude`, `Gemini`, `其他`. Use the evidence in the project and include yourself. `.claude/` or `CLAUDE.md` means Claude Code. `.cursor/` or `.cursorrules` means Cursor. `AGENTS.md` or `.codex/` means Codex. `GEMINI.md` means Gemini. Ask the user about chat tools such as ChatGPT or Claude.ai; you cannot see those. |
| `orientation` | `portrait` (designed for phones held upright), `landscape` (wide, still touch-playable) or `desktop` (needs keyboard or mouse). Decide from the canvas/viewport size and the input handlers. Keyboard-only controls mean `desktop`. |
| `session` | One round lasts: `short` under 5 minutes, `medium` about half an hour, `long` open-ended (idle, sandbox, long campaigns). Base it on play, not hope. |
| `notes` | Maker notes, ≤4000 characters, first person as the creator. Use facts you can verify: the first commit date and the span of `git log`, the number of commits, the engine/stack, one or two interesting technical or design turns visible in history or docs. Leave a clearly marked blank for things only the creator knows, such as `（灵感来源：___）` and `（第一句提示词：___）`. Do not make up motivations, quotes or durations. |

Paths in `cover`, `screenshots` and `preview` are relative to `.1gp/`.

## 3. Capture media from the running game

Serve the game locally (for example `npx serve -l 4173 <dir>` or the project's dev script). Drive it with Playwright (`npx playwright@latest install chromium` if needed) through a short Node script you keep in a temp folder, not in `.1gp/`. Reach real gameplay by clicking or pressing the actual start controls; use the project's autoplay/test bot when one exists. Wait for fonts and assets to load before capturing. Mute audio.

Viewport: portrait games 390×844 at deviceScaleFactor 2; landscape or desktop games 1280×720 at deviceScaleFactor 1.5.

- **Cover** `cover.png` (also `.jpg`/`.webp`), 16:9, 1600×900, ≤20 MB. It is shown on cards at small sizes. Make the game's art and title the subject.
  - Landscape games: capture the title screen or a strong gameplay moment at 16:9.
  - Portrait games: build a 1600×900 HTML page and screenshot it. Put the portrait capture on the right side, and the game title in the game's own font and colors on the left. Fill the background with the game's palette.
  - Keep the title readable at 320 px wide. Do not add fake UI, "NEW" badges, prices, platform logos or text that is not in the game.
- **Screenshots** `shots/01.png …`: 3–5 images at the game's native aspect ratio, ≤20 MB each.
  - Pick distinct moments: the start, core play, a busy or late moment, and a win or result screen.
  - Each image must show something different. Leave out loading screens, menus, debug overlays, dev tools and cursor artifacts.
- **Preview** `preview.webm` (`.mp4`/`.gif` also accepted), 5–10 s, ≤20 MB, silent, loops on the game card. Record with Playwright `recordVideo` at the same viewport, then trim to the most active stretch. If ffmpeg is available, trim with `ffmpeg -ss <start> -t 8 -i in.webm -an -c:v libvpx-vp9 -b:v 1.5M preview.webm`. Without ffmpeg, start recording right before the action and close the page after 8 s. It should show play within the first second.

Look at every image and the video yourself before finishing. Redo any that is blank, cropped, mid-transition or shows an error.

## 4. Finish

Validate `game.json`:
- It parses as JSON.
- Every path exists.
- Limits hold: title ≤120, description ≤2000, ≤5 tags, each ≤12, notes ≤4000.

Then tell the user, briefly:
- where `.1gp/` is (macOS hides dot folders in the file picker; press Cmd+Shift+. to show them);
- to open 1GP → 发布游戏 (or the game's 编辑) → 导入上架物料, pick `.1gp/`, review and save;
- which fields you left empty or marked with blanks for them, and that 「允许别人改一改」 and 谁可以玩 are theirs to set;
- that screenshots and the preview upload when they press 保存 / 发布.

Add `.1gp/` to `.gitignore` only if the user asks; some creators like to keep the kit in the repo.
