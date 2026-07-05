# Ms. Ghostman: 3-Level Playthrough Verification Report

**Date:** 2026-06-23  
**Reviewer:** ekaramet  
**Scope:** QA verification across Level 0, Level 1, and Level 2 to confirm core gameplay flow, HUD metrics, screens, and audio cues.

---

## 1. Playthrough Summary

Ms. Ghostman has been manual playtested end-to-end. Below is the step-by-step verification log for the core gameplay progression and transition mechanics.

| Level | Key Focus | Status | Observations |
| :--- | :--- | :--- | :--- |
| **Level 0** | Startup, Keyboard controls, Staggered Ghost House Release | ✅ PASS | Game boots in MENU. Keypress transitions to PLAYING. Ghosts leave house in order: Blinky (0ms), Pinky (5s), Inky (10s), Clyde (15s). |
| **Level 1** | Score Carryover, Power-Up Effects, Bomb Placement | ✅ PASS | Player eats pellets, drops bombs (Spacebar), triggers chain explosions. Wall destruction and scoring are verified. |
| **Level 2** | Timer Decrements, Pause Menu (Continue/Restart), Victory Transition | ✅ PASS | Esc/P displays Pause Menu. Restart and Continue work without state or time leakage. Reaching 0 pellets triggers final Victory screen. |

---

## 2. Detailed Level Logs

### Level 0: Scaffolding and Movement
- **Boot Phase:** Game initializes cleanly into the Start screen. Background audio preloading finishes instantly.
- **Controls Check:** verified standard Arrow keys and W/A/S/D movement. Sprites move smoothly with zero input stuckness. Hold-to-move responds accurately.
- **Chase Loop:** Ghosts release stagger follows FIFO logic. Blinky starts hunting immediately. Pinky targets ahead of player.
- **Clearance:** Eating all 244 pellets clears Level 0, awarding a clearance bonus based on remaining time.

### Level 1: Combat and Power-Ups
- **Bomb Fuse & Explosion:** Dropping bombs (`Space`) triggers a 3-second fuse animation followed by a cross-pattern fire explosion. Destroying destructible walls correctly yields scoring pellets and random power-ups.
- **Power-Ups Check:** 
  - **Power Pellet:** Eating power pellet turns all ghosts blue (frightened state), slows them down, and allows the player to consume them.
  - **Extra Life / Speed Boost:** Powerups render cleanly and apply correct multipliers or increments instantly.
- **HUD Update:** Scores carry over seamlessly from Level 0.

### Level 2: End-Game and Invariants
- **High Contention:** 4 active ghosts hunt aggressively. The frame rate remains steady at p95 ≥ 60 FPS under full physics and render load.
- **Pause & Resume Invariant Verification:**
  - Pressing `Esc` pauses the game, bringing up the Pause Menu.
  - While paused, requestAnimationFrame continues firing but simulation ticks are frozen (timer countdown stops, entities do not move).
  - Pressing `Restart` resets the level, score, lives, and timer cleanly.
  - Pressing `Continue` resumes from the exact frozen state.
- **Victory Screen:** Clearing Level 2 transitions to the final Victory screen, showing statistics and saving the top score to the local storage leaderboard.

---

## 3. Core Accessibility & UI Checklist

- [x] **Keyboard-Only Path:** Menus and gameplay are 100% controllable by keyboard (Arrows/Enter/Space/Esc).
- [x] **HUD Alignment:** Timer, Score, and Lives are visible at the top bar and update in sync with ECS simulation phases.
- [x] **Audio UX:** Audio Settings volume slider and mute toggles are functional and persist via `localStorage` on page reload.
- [x] **Reduced Motion:** Verified that transition animations respect the `prefers-reduced-motion` media query.

**Status: PASS**
