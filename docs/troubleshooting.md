# Troubleshooting

## `Missing Oz API key`

Pass a key or set `OZ_API_KEY`:

```bash
npx tryoz setup --api-key oz-your-key
```

## `Oz API key must start with oz-`

Use an Oz user API key. The CLI rejects keys without the `oz-` prefix.

## MCP tools/list fails

Check network access and verify the endpoint:

```bash
npx tryoz mcp test --api-key oz-your-key
```

## Agent does not show Oz tools

Restart the selected coding agent. Most agents read MCP config on startup.

## Wrong files were selected

Run a dry run first:

```bash
npx tryoz setup --dry-run
```

Remove Oz-owned entries:

```bash
npx tryoz remove
```
