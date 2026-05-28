# Installation

Run the interactive setup:

```bash
npx tryoz setup
```

The wizard detects supported coding agents, lets you select one or more, asks for
Global or Project scope, asks for an `oz-` API key, previews all changes, writes
the selected configs, installs the Oz skill or policy, and verifies the remote
MCP server with `tools/list`.

## Recommended Path

Use Global scope for personal machines:

```bash
npx tryoz setup --global
```

Use Project scope when the repository should carry the Oz policy for all
contributors:

```bash
npx tryoz setup --project
```

## Non-Interactive Setup

```bash
npx tryoz setup --codex --claude --global --api-key oz-your-key
npx tryoz setup --all --project --api-key oz-your-key
```

## API Key

The CLI requires keys to start with `oz-`.

You can pass a key directly:

```bash
npx tryoz setup --api-key oz-your-key
```

Or set an environment variable:

```bash
export OZ_API_KEY='oz-your-key'
npx tryoz setup
```

The CLI does not silently edit shell startup files.

## Endpoint

The default endpoint is:

```txt
https://tryoz.dev/mcp
```

Override it only for local testing:

```bash
npx tryoz setup --endpoint http://localhost:3000/mcp
```
