# AUDIT-F-21 Evidence: Compositor-Layer Promotion

**Date:** 2026-05-06
**Reviewer:** Antigravity

## Observation
- `will-change: transform` is used only on high-churn moving elements (Player, Ghosts).
- Promoted layers are successfully composited on the GPU.
- Memory usage for layers remains steady with no memory leaks after warm-up.
