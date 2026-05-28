# Contributing

Thanks for improving Tryoz.

## Useful Commands

```bash
npm install
npm test
npm run pack:check
```

## Development Rules

- Keep setup changes selected-agent scoped.
- Do not patch unrelated agent files.
- Back up existing config before modifying it.
- Do not write API keys to shell startup files.
- Add or update tests for installer behavior.
- Run `npm run pack:check` before release changes.

## Pull Requests

Open a pull request with:

- What changed.
- Which agents were tested.
- The output of `npm test`.
- The output of `npm run pack:check` when package contents changed.
