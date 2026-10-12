# 1GP Skills

Reusable instructions for AI coding assistants working on games for [1GP](https://www.ai-made.games). Integration skills call REST APIs directly from game code. No skill requires a runtime SDK or MCP server, and none uploads source code.

## 1GP leaderboard

Teach your AI to identify a game's actual round start and final settlement, insert native REST calls, handle retry/identity correctly, and verify the integration.

1. Download [1gp-leaderboard.zip](https://github.com/1gp-studio/skills/releases/latest/download/1gp-leaderboard.zip), or use the [website download](https://www.ai-made.games/downloads/1gp-leaderboard.zip).
2. Extract the **entire `1gp-leaderboard` folder**, including references, into your game project:
   - Codex: `.agents/skills/1gp-leaderboard/`
   - Claude Code: `.claude/skills/1gp-leaderboard/`
3. On your game's 1GP leaderboard page, select the board and click **Copy integration prompt**. Paste into your coding assistant. The prompt supplies your game's configuration; the reusable skill contains none of it.

Invoke explicitly if needed: `$1gp-leaderboard` in Codex, `/1gp-leaderboard` in Claude Code. If it does not appear, start a new session. For personal installation across projects, use `~/.agents/skills/` for Codex or `~/.claude/skills/` for Claude Code. Do not overwrite an edited local copy without reviewing changes.

[Codex documentation](https://learn.chatgpt.com/docs/build-skills) · [Claude Code documentation](https://code.claude.com/docs/en/skills) · [1GP REST guide](https://www.ai-made.games/guide/leaderboards)

## 1GP cloud saves

Teach your AI to define a complete save snapshot, restore it before gameplay starts, keep offline progress, migrate old formats and verify a real save/load round trip.

1. Download [1gp-cloud-save.zip](https://github.com/1gp-studio/skills/releases/latest/download/1gp-cloud-save.zip), or use the [website download](https://www.ai-made.games/downloads/1gp-cloud-save.zip).
2. Extract the **entire `1gp-cloud-save` folder** into `.agents/skills/` (Codex) or `.claude/skills/` (Claude Code).
3. On your game's 1GP page, open cloud saves and click **Copy integration prompt**. Paste it into your coding assistant; the prompt supplies the game ID and save-format version.

## 1GP store kit

Teach your AI to play the game and prepare its 1GP store page: title, description, category, tags, AI tools, screen, session length, a maker-notes draft, a 16:9 cover, screenshots and a short preview video. Everything goes into a `.1gp/` folder in the game project; nothing is uploaded.

1. Download [1gp-store-kit.zip](https://github.com/1gp-studio/skills/releases/latest/download/1gp-store-kit.zip), or use the [website download](https://www.ai-made.games/downloads/1gp-store-kit.zip).
2. Extract the **entire `1gp-store-kit` folder** into `.agents/skills/` (Codex) or `.claude/skills/` (Claude Code).
3. Ask your assistant to prepare the 1GP store materials (`$1gp-store-kit` / `/1gp-store-kit`).
4. On 1GP, in the publish wizard or the game's **Edit** dialog, click **Import store kit**, choose `.1gp/`, review and save.

## 中文

下载 ZIP，将完整的 `1gp-leaderboard` 文件夹放入游戏项目：Codex 使用 `.agents/skills/`，Claude Code 使用 `.claude/skills/`。然后在 1GP 游戏页选择榜单，点击「复制接入提示词」，交给 AI 执行。Skill 提供通用流程，提示词提供当前榜单配置。游戏运行时仅使用 REST API。

云存档：同样把完整的 `1gp-cloud-save` 文件夹放进去，在游戏页的云存档里点「复制接入提示词」交给 AI。提示词提供游戏 ID 和存档格式版本。

上架物料：同样把完整的 `1gp-store-kit` 文件夹放进去，对 AI 说「帮我准备上架物料」。AI 会试玩游戏，在 `.1gp/` 里写好名字、介绍、分类、标签、制作信息，并做好封面、截图和预览视频。在 1GP 发布页或游戏的「编辑」里点「导入上架物料」，选这个文件夹，检查后保存。

## Releases

Source of truth: each folder in `skills/`. Run `python3 scripts/package_skill.py` to validate every skill and produce deterministic ZIPs plus SHA-256 checksums in `dist/`. CI runs the same checks. Each skill keeps its own `metadata.version` in SKILL.md; the repository release version is in `VERSION`. To publish, bump the changed skill's version and `VERSION`, commit, and push the matching `vX.Y.Z` tag. Every release contains every skill's ZIP, so the website's `releases/latest/download/<skill>.zip` links always work. No generated archive is maintained in the website repository.
