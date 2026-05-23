# TomsIndex CLI

Installs Tom's Index MCP tools and prompt hooks for Claude Code and Codex CLI.

## Install

```bash
npx tomsindex
```

The installer prints the API key page, asks you to paste your key, then installs for both Claude Code and Codex CLI.

Get a key here:

```text
https://tomsindex.com/dashboard
```

Non-interactive install:

```bash
npx tomsindex install --api-key srch_...
```

Defaults:

- `--client both`
- user/global config
- `--url https://tomsindex.com`

Use `--dry-run` to preview config changes:

```bash
npx tomsindex install --client both --api-key srch_... --dry-run
```

## Commands

```bash
tomsindex install --client claude|codex|both --url https://tomsindex.com --api-key srch_...
tomsindex uninstall --client claude|codex|both
tomsindex doctor
tomsindex mcp
tomsindex hook claude
tomsindex hook codex
```

## MCP Tools

- `tomsindex_search`: web/documentation search via `POST /v1/tools/web_search`
- `tomsindex_ask`: answer cache lookup via `GET /v1/answer`
- `tomsindex_hint`: one actionable hint + follow-up questions via `POST /v1/hint`
- `tomsindex_hints`: structured coding-task hints via `POST /v1/hints`
- `tomsindex_hints_feedback`: outcome feedback via `POST /v1/hints/feedback`

## Session Context

The `UserPromptSubmit` hook automatically sends session context (recent messages, file paths, errors) to Tom's Index on every prompt. This makes `tomsindex_hint` responses specific to your current work — referencing your actual files and errors instead of giving generic advice.

Context is stored server-side for 1 hour per session. No manual setup needed.

## Config Behavior

Claude:

- Adds a `UserPromptSubmit` hook to `~/.claude/settings.json`.
- Hook reads conversation transcript and sends session context to `POST /v1/session/context`.
- Runs `claude mcp add --scope user tomsindex ...` when available.

Codex:

- Adds `[features].hooks = true`, MCP config, and a `UserPromptSubmit` hook to `~/.codex/config.toml`.
- Managed Codex blocks are wrapped with comments so repeated installs are idempotent.

Both installers create timestamped backups before writing existing config files.

## Debugging

To verify whether Codex calls a Tom's Index MCP tool, enable MCP call logging before starting Codex:

```bash
TOMSINDEX_MCP_LOG=/tmp/tomsindex-mcp.log codex
cat /tmp/tomsindex-mcp.log
```

Each MCP tool call is logged as one JSON line.
