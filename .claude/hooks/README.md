# Claude Code hooks

Automated checks that run after Claude edits source files.

## Installed hooks

### `on-code-change.mjs`

Triggers on `Edit` / `Write` / `MultiEdit` tool calls. When the
touched file is under `server/src/**.ts` or `web/src/**.{js,jsx,ts,tsx}`,
it launches background jobs:

| File changed | Background checks |
|--------------|-------------------|
| `server/src/*.ts` | `npx tsc --noEmit` inside `server/` |
| `server/src/__tests__/*.ts` | `bun test` inside `server/` |
| `web/src/*.{js,jsx}` | `npx vite build` inside `web/` |

Results are appended to `.claude/hooks/last-check.log`.

The hook returns immediately (<50ms); the actual build runs detached so
Claude's tool loop isn't blocked.

## Reading the log

```powershell
Get-Content .claude/hooks/last-check.log -Tail 20
```

or in bash:
```bash
tail -20 .claude/hooks/last-check.log
```

## Disabling

Delete or rename `.claude/settings.json`. The hook script will no longer
be invoked.

## Extending

To add more hook events (e.g., `UserPromptSubmit`, `SessionStart`),
edit `.claude/settings.json` and add matchers following Claude Code's
[hooks documentation](https://docs.claude.com/en/docs/claude-code/hooks).
