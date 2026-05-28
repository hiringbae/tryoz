# Codex

```bash
npx tryoz setup --codex --global
```

Global setup writes:

- `~/.codex/config.toml`
- `~/.codex/skills/oz/SKILL.md`

Project setup additionally writes an Oz policy block to `AGENTS.md`.

Codex uses `OZ_API_KEY` through `bearer_token_env_var`, so export the key before
launching Codex:

```bash
export OZ_API_KEY='oz-your-key'
```
