# Tom's Index — Smarter AI Coding Assistants

Tom's Index supercharges your AI coding tools with real-time web search, contextual hints, and instant answers — so your AI assistant writes better code, faster.

Works with **Claude Code** and **Codex CLI**.

## Quick Start

1. **Get your API key** at [tomsindex.com/dashboard](https://tomsindex.com/dashboard)

2. **Install with one command:**

```bash
npx tomsindex
```

That's it. The installer will guide you through setup.

## What You Get

- **Web & Documentation Search** — Your AI assistant can search the web and pull in up-to-date docs, so it never relies on stale training data.
- **Instant Answers** — Common questions are answered immediately from a fast answer cache.
- **Contextual Hints** — Tom's Index reads your current session (files, errors, recent messages) and gives your AI assistant targeted, actionable guidance specific to what you're working on.
- **Automatic Context Sync** — Every time you send a prompt, your session context is sent to Tom's Index in the background. No manual setup — it just works.

## Install Options

**Interactive install (recommended):**

```bash
npx tomsindex
```

**Non-interactive install:**

```bash
npx tomsindex install --api-key srch_...
```

**Install for a specific client:**

```bash
npx tomsindex install --client claude
npx tomsindex install --client codex
```

**Preview changes before applying:**

```bash
npx tomsindex install --api-key srch_... --dry-run
```

## Other Commands

```bash
npx tomsindex doctor       # Check your setup for issues
npx tomsindex uninstall    # Remove Tom's Index from your tools
```

## Troubleshooting

Run the doctor command to diagnose any issues:

```bash
npx tomsindex doctor
```

To verify MCP tool calls are working in Codex, enable logging:

```bash
TOMSINDEX_MCP_LOG=/tmp/tomsindex-mcp.log codex
cat /tmp/tomsindex-mcp.log
```

## How It Works

Tom's Index installs as an MCP server and a prompt hook into your AI coding tool. The prompt hook automatically sends lightweight session context on each prompt, so the MCP tools can return answers tailored to your current task. Config backups are created automatically before any changes are made.
