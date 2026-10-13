---
name: 1gp-store-kit
description: Prepare a game's 1GP store page in Chinese and English (title, description, category, tags, AI tools, screen, session length, maker notes, cover, screenshots and a trailer-style preview video) into a 1gp-kit folder the creator imports with one click. Use when the user wants to publish or update a game on 1GP, asks for a cover, screenshots, preview video, tags or a store description, or says 上架物料 / 发布素材 / 做封面 / 做预览视频.
metadata:
  version: "2.0.0"
---

# 1GP store kit

Write everything into `1gp-kit/` at the game project root. The creator opens `1gp-kit/preview.html` to check it, then clicks 导入上架物料 in the 1GP publish wizard or in the game's 编辑 dialog, picks the folder, reviews the form and saves. Nothing here publishes the game or changes the live page.

```
1gp-kit/
  game.json         text and choices, both languages
  cover.png         16:9, 1600×900
  shots/01-….png    3–5 screenshots, the game's own aspect ratio
  preview.webm      12–18 s trailer, portrait 1080×1920 or landscape 1920×1080, as the game is
  preview.html      what the creator opens to check everything
```

Work without asking the creator questions. Find out what you can from the project. Leave out what you can't verify, and list it for them at the end.

## 1. Read the project

The text fields come from reading, not running:
- README, docs, design notes;
- the entry HTML, the main scripts, the in-game text;
- `package.json`, `git log`.

Note while reading:
- the in-game title (both languages if the game has a language switch);
- the controls;
- the core loop and the goal;
- the areas, levels or bosses (they become trailer shots);
- the functions that set up those moments (step 3);
- the screen orientation.

## 2. game.json

Every key is optional; omit what you can't determine. Never write access/whitelist or remix permission: those are the creator's decisions.

```json
{
  "title": "渔喵传说", "titleEn": "Fishy Tails",
  "description": "…", "descriptionEn": "…",
  "genre": "casual",
  "tags": ["像素风", "猫", "钓鱼"], "tagsEn": ["Pixel art", "Cat", "Fishing"],
  "tools": ["Claude Code"], "orientation": "portrait", "session": "medium",
  "notes": "…",
  "cover": "cover.png", "screenshots": ["shots/01-catch.png", "shots/02-sea.png"], "preview": "preview.webm"
}
```

| Key | Rules |
|---|---|
| `title` / `titleEn` | The name the game shows, 1–120 characters. Use the game's own English name if it has one. Otherwise translate the meaning naturally; use pinyin only for a brand-like name. |
| `description` / `descriptionEn` | ≤2000 characters each. The first line is shown on cards: what you do and why it's fun, ≤40 characters (≤80 in English). Then 2–4 short lines: the real controls, the goal, one highlight. No hype words, no emoji runs, nothing you didn't see in the code or in play. Write the English as natural English, not a word-for-word translation. |
| `genre` | One of `casual` 休闲, `puzzle` 益智解谜, `action` 动作, `strategy` 策略, `simulation` 模拟经营, `adventure` 冒险剧情, `idle` 放置, `rhythm` 音乐节奏, or `null`. |
| `tags` | ≤5 tags, ≤12 characters each, no commas, `#` or spaces. Short and objective: protagonist, art style, core mechanic, controls (像素风, 猫, 三消, 单手玩). Never the category name, never a `类` suffix. |
| `tagsEn` | The same tags in English, ≤5, ≤24 characters each, spaces allowed. Prefer the common names: Pixel art, Cat, Match-3, One-handed, Roguelike, Boss fights, Idle, Cozy. |
| `tools` | Only `Claude Code`, `Cursor`, `Codex`, `ChatGPT`, `Claude`, `Gemini`, `其他`, from evidence in the project. Include yourself. `.claude/` or `CLAUDE.md` means Claude Code. `.cursor/` or `.cursorrules` means Cursor. `AGENTS.md` or `.codex/` means Codex. `GEMINI.md` means Gemini. |
| `orientation` | `portrait` (made for an upright phone), `landscape` (wide, still touch-playable) or `desktop` (needs keyboard or mouse). Decide from the canvas/viewport size and the input handlers. |
| `session` | One round: `short` under 5 min, `medium` about half an hour, `long` open-ended. |
| `notes` | Maker notes in the creator's voice, ≤4000 characters. Only verifiable facts: when work started and how long it ran (`git log`), the number of commits, the stack, one or two interesting turns visible in history or docs. **No blanks or placeholders.** Anything only the creator knows (inspiration, the first prompt) goes on the to-do list instead. |

Paths are relative to `1gp-kit/`.

## 3. Record the preview and screenshots

Use `scripts/record.mjs` from this skill. It needs Node 22+ and an installed Chrome or Edge. Nothing else: no npm install, no Playwright, no ffmpeg. It runs the game headless on a controlled clock, so the video is a smooth 30 fps on any machine.

1. **Make the game runnable.**
   - Static games: pass the folder.
   - Build steps: build first and pass the output folder, or start the dev server and pass `--url`.
2. **Write a director** in a temporary folder outside the project. Read [references/director.md](references/director.md) first: it has the trailer structure, the REC API, how to reach the game's internals, and a full example. The trailer should make people want to play:
   - gameplay in the first second;
   - the most satisfying moment in the first 3 s;
   - quick cuts for variety;
   - the biggest spectacle;
   - the title as the end card.
3. **Take the screenshots in the same run** with `REC.shot`: 3–5 distinct moments (core play, a later area, the spectacle, a second system or a result).
4. **Run it at the game's own orientation.**

   Portrait game:
   ```bash
   node <skill>/scripts/record.mjs <gameDir> --director <tmp>/trailer.js [--hook "<loop line>"] --lang zh-CN --size 1080x1920 --video 1gp-kit/preview.webm --shots 1gp-kit/shots --frames <tmp>/frames
   ```
   Landscape and desktop games use `--size 1920x1080`.
   - Use `--lang en-US` if the game's main language is English.
   - Add `--touch` for touch-only games.
5. **Review** the frames and shots (see the end of director.md). Fix and record again until the first second is gameplay, every cut shows something new and nothing is broken.

## 4. Cover

The cover is 1600×900 (16:9) for every game: it is the card image.
- **Landscape games**: run a short director at `--size 1600x900` that sets up the title screen or the strongest moment and calls `REC.shot('cover')`, then copy that PNG to `1gp-kit/cover.png`.
- **Portrait games**: copy [assets/cover.html](assets/cover.html) into the temp folder, next to a copy of the best screenshot and the game's font file. Fill in its DATA block. Then run:
  ```bash
  node <skill>/scripts/record.mjs still <tmp>/cover.html --size 1600x900 --out 1gp-kit/cover.png
  ```

In both cases:
- use the game's own font and colours;
- the title must be readable at 320 px wide;
- no badges, prices, platform logos, or text the game doesn't show.

## 5. Preview page

Copy [assets/preview.html](assets/preview.html) to `1gp-kit/preview.html`. Replace the contents of its DATA block with game.json plus a `"todo"` list. Write the list in the creator's language: short items for what they should add or check. For example:
- an inspiration line or the first prompt for the maker notes;
- chat AI tools you couldn't detect;
- a screenshot to swap.

Render it once to check, and look at the result:

```bash
node <skill>/scripts/record.mjs still 1gp-kit/preview.html --size 1200x2000 --scale 1 --out <tmp>/page.png
```

## 6. Check and report

- game.json parses, every path exists, and the limits hold. Limits: titles ≤120, descriptions ≤2000, ≤5 tags each (Chinese ≤12 characters, English ≤24), notes ≤4000, every file ≤20 MB.
- You have looked at the cover, every screenshot and the preview frames.

Tell the creator, briefly:
1. Open `1gp-kit/preview.html` to check everything in Chinese and English.
2. On 1GP: 发布游戏 (or 编辑 on the game page) → 导入上架物料 → choose `1gp-kit` → review → save.
3. The to-do list: what to add or confirm themselves.
4. Imported screenshots are **added after the existing ones**. After saving, they should open the 截图 tab, delete duplicates and ones they don't want, and set the order: they decide what is finally shown.
5. 「允许别人改一改」 and 谁可以玩 are for them to set.

The 1GP publisher MCP v0.3.2 and later never uploads `1gp-kit/`. Older versions upload every folder of a static game whose web root is the project root, and the preview video would push the upload over its 3 MB limit. In that case, tell the creator to update the MCP before publishing. Leave `.gitignore` alone unless the user asks.
