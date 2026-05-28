# Claude Code

```bash
npx tryoz setup --claude --global
```

Global setup prefers the Claude Code CLI when available:

```bash
claude mcp add-json --scope user oz ...
```

It also installs:

- `~/.claude/skills/oz/SKILL.md`

Project setup writes:

- `.mcp.json`
- `.claude/skills/oz/SKILL.md`
- `CLAUDE.md` Oz policy block
