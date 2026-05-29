# Codex

```bash
npx tryoz setup --codex --global
```

Global setup writes:

- `~/.codex/config.toml`
- `~/.codex/skills/oz/SKILL.md`

Project setup additionally writes an Oz policy block to `AGENTS.md`.

Setup stores the Oz API key in the Codex MCP `Authorization` header, so Codex can
use Oz without a separate `OZ_API_KEY` export.
