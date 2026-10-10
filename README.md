# 1GP Skills

Reusable instructions for AI coding assistants working on games for [1GP](https://www.ai-made.games). Game code calls REST APIs directly. These skills do not require a runtime SDK or MCP server and do not upload source code.

## 1GP leaderboard

Teach your AI to identify a game's actual round start and final settlement, insert native REST calls, handle retry/identity correctly, and verify the integration.

1. Download [1gp-leaderboard.zip](https://github.com/1gp-studio/skills/releases/latest/download/1gp-leaderboard.zip), or use the [website download](https://www.ai-made.games/downloads/1gp-leaderboard.zip).
2. Extract the **entire `1gp-leaderboard` folder**, including references, into your game project:
   - Codex: `.agents/skills/1gp-leaderboard/`
   - Claude Code: `.claude/skills/1gp-leaderboard/`
3. On your game's 1GP leaderboard page, select the board and click **Copy integration prompt**. Paste into your coding assistant. The prompt supplies your game's configuration; the reusable skill contains none of it.

Invoke explicitly if needed: `$1gp-leaderboard` in Codex, `/1gp-leaderboard` in Claude Code. If it does not appear, start a new session. For personal installation across projects, use `~/.agents/skills/` for Codex or `~/.claude/skills/` for Claude Code. Do not overwrite an edited local copy without reviewing changes.

[Codex documentation](https://learn.chatgpt.com/docs/build-skills) · [Claude Code documentation](https://code.claude.com/docs/en/skills) · [1GP REST guide](https://www.ai-made.games/guide/leaderboards)

## 中文

下载 ZIP，将完整的 `1gp-leaderboard` 文件夹放入游戏项目：Codex 使用 `.agents/skills/`，Claude Code 使用 `.claude/skills/`。然后在 1GP 游戏页选择榜单，点击「复制接入提示词」，交给 AI 执行。Skill 提供通用流程，提示词提供当前榜单配置。游戏运行时仅使用 REST API。

## Releases

Source of truth: `skills/1gp-leaderboard/`. Run `python3 scripts/package_skill.py` to validate and produce a deterministic ZIP plus SHA-256 checksum in `dist/`. CI runs the same checks. To publish, update the version in SKILL.md, commit, and push the corresponding `vX.Y.Z` tag. The release workflow automatically creates the public release assets; the website's stable download URL redirects to the latest release. No generated archive is maintained in the website repository.
