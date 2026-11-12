# Working in Mafia

## Source of truth

Read `PRD.md` before changing behavior. It is the locked product contract. Read `ARCHITECTURE-ESSENTIALS.md` for the short architectural constraints and `ARCHITECTURE.md` for full ownership and data-model details.

## Non-negotiables

- Keep all game rules in pure TypeScript under `src/game/`; do not put outcome logic in React components.
- Treat the engine as the single source of truth for deaths, saves, eliminations, runoffs, reveals, parity, and wins.
- Never expose secret roles in group-visible UI, accessibility text, public selectors, or persisted transient reveal state.
- Preserve offline behavior and action-level localStorage persistence.
- Add or update focused Vitest tests for every rules change, especially privacy behavior.

## Development

```powershell
npm ci
npm run dev
npm run typecheck
npm run test
npm run build
npm run test:e2e   # builds, then runs Playwright against the preview server
```

Use strict TypeScript. Keep changes narrow, follow existing naming, and do not add dependencies without a clear architectural reason. Do not commit or push unless explicitly asked.
