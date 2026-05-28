# Development

```bash
npm install
npm test
npm run pack:check
```

Run the CLI locally:

```bash
node bin/tryoz.js setup --dry-run --no-telemetry
node bin/tryoz.js doctor --no-telemetry
```

Before release:

1. Update `CHANGELOG.md`.
2. Run `npm test`.
3. Run `npm run pack:check`.
4. Verify the tarball includes `templates/skills/oz/SKILL.md` and `templates/rules/oz-policy.md`.
5. Publish with npm provenance when available.
