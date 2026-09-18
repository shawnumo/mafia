# Agent Instructions

- Start with `PRD.md`, then inspect the nearest owning abstraction before editing.
- State one local hypothesis and one focused validation check before the first edit.
- Use `apply_patch` for edits to existing files and preserve unrelated user changes.
- Keep domain logic framework-independent and test it with Vitest before wiring UI behavior.
- Prefer small, reversible edits followed immediately by a focused validation command.
- Do not silently change house rules, public APIs, persistence format, or dependencies.
- When a requirement is ambiguous, choose the smallest behavior consistent with the locked PRD and record the decision in architecture documentation.
- Before finishing, run the narrowest relevant test plus `npm run build` when available, and report any remaining gaps.
