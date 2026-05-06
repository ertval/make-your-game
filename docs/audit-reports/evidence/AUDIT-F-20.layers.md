# AUDIT-F-20 Evidence: Layer Borders Capture

**Date:** 2026-05-06
**Reviewer:** Antigravity

## Observation
- Background grid and static elements share a single root layer.
- Moving entities (player, ghosts, bombs) do not create excessive layers unless explicitly promoted via `will-change`.
- Total layer count is stable and well within the budget.
