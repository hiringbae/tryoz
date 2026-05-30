# CLI Reference

## Commands

```bash
npx tryoz setup
npx tryoz remove
npx tryoz logout
npx tryoz doctor
npx tryoz list-agents
npx tryoz detect
npx tryoz mcp test
npx tryoz --version
```

## Setup

```bash
npx tryoz setup [targets] [scope] [options]
```

When no target flags are provided, setup selects all supported agents by default.

Targets:

```txt
--codex
--claude
--cursor
--vscode
--cline
--windsurf
--opencode
--copilot
--copilot-agent
--grok
--gemini
--all
```

Scope:

```txt
--global
--project
```

Options:

```txt
--api-key oz-...
--endpoint https://tryoz.dev/mcp
--dry-run
--yes
--json
--no-prompt
--no-telemetry
```

## Remove

```bash
npx tryoz remove --codex --claude --global
npx tryoz logout --all --global
```

`logout` is an alias for `remove`.

Remove deletes only Oz-owned MCP entries, Oz skills, and marked Oz policy blocks.
It does not remove unrelated user config.

## Doctor

```bash
npx tryoz doctor --api-key oz-your-key
```

Doctor checks:

- API key format.
- Remote MCP `tools/list`.
- Selected agent CLI availability.
- Selected JSON/TOML config parse validity.

## MCP Test

```bash
npx tryoz mcp test --api-key oz-your-key
```

This calls the hosted Oz MCP endpoint and verifies the available tools.
