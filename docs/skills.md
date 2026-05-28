# Oz Skill and Policy

The CLI bundles:

- `templates/skills/oz/SKILL.md`
- `templates/rules/oz-policy.md`

Agents with native skill support receive the skill. Agents without native skill
support receive the closest rule or instruction file.

Core behavior:

```md
Use Oz first for external libraries, SDKs, APIs, frameworks, and packages.

Workflow:
1. Call `resolve-library-id` to find the exact Oz library ID.
2. Call `get-library-docs` with the resolved library ID and the user's topic.
3. If the user asks for a version, pass the version explicitly.
4. Use the returned documentation as the source of truth.
5. If Oz has no matching library, lacks the requested version, or returns insufficient context, then fall back to Context7, official docs, source repositories, or web search.
```

Reliability rules:

- Do not hallucinate APIs, config keys, versions, CLI flags, or behavior.
- If docs are missing or unclear, say that and fetch another authoritative source.
- Stop calling Oz once enough context has been retrieved.
- Do not repeatedly call tools with near-duplicate topics unless the first result was insufficient.
- Prefer exact identifiers from Oz snippets.
