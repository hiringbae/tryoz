# Telemetry

The CLI sends minimal anonymous telemetry by default.

Recorded:

- command name
- selected client IDs
- OS/platform
- success/failure
- CLI version

Never recorded:

- prompts
- file contents
- API keys
- absolute repository paths

Disable telemetry:

```bash
npx tryoz setup --no-telemetry
```
