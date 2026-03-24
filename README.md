# 🎮 Ms. Ghostman

> **Pac-Man × Bomberman** — Eat every pellet. Bomb every wall. Survive every ghost.

A single-player browser game built with **pure JavaScript, HTML, and CSS** — no canvas, no frameworks. Grid-based strategy where you navigate a haunted maze, drop bombs to clear destructible walls and eliminate ghosts, and collect every pellet to clear each level.

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Gameplay](#-gameplay)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Scripts & Commands](#-scripts--commands)
- [Architecture](#-architecture)
- [Performance Targets](#-performance-targets)
- [Development Workflow](#-development-workflow)
- [Documentation](#-documentation)
- [Tech Stack & Constraints](#-tech-stack--constraints)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

Ms. Ghostman is a hybrid arcade game combining:

- **Pac-Man**: Navigate a maze, eat all pellets to complete a level
- **Bomberman**: Drop bombs to destroy walls, create paths, and eliminate enemies

The result is a strategic, grid-based game where every move matters. Block off ghost routes, set bomb traps, chain explosions, and race against the clock.

### Key Features

- 🕹️ **Hold-to-move controls** — smooth, responsive keyboard input
- 💣 **Bomb mechanics** — 3-second fuse, cross-shaped explosions, chain reactions
- 👻 **4 unique ghost personalities** — from aggressive to unpredictable
- ⚡ **Power-ups** — increased bomb range, extra bombs, speed boosts, ghost-stunning pellets
- ⏱️ **Countdown timer** — beat the clock for bonus points
- 🏆 **Scoring & combos** — chain-kill ghosts for exponential bonuses
- ⏸️ **Pause menu** — continue or restart without losing progress
- 📊 **3 difficulty levels** — increasing maze density, ghost count, and speed
- 🎨 **60 FPS DOM rendering** — no canvas, pure CSS Grid + transform animations

---

## 🎮 Gameplay

### Controls

| Key | Action |
|---|---|
| `↑` `↓` `←` `→` | Move Ms. Ghostman (hold for continuous movement) |
| `Space` | Drop a bomb |
| `Escape` / `P` | Pause / Resume |
| `Enter` | Confirm menu selections |

### How to Win

1. **Eat all pellets** on the map to clear the level
2. **Drop bombs** to destroy walls blocking your path
3. **Avoid or eliminate ghosts** — they kill on contact
4. **Don't get caught** in your own explosions!
5. **Beat the countdown** — time runs out = game over
6. Clear all 3 levels to earn **VICTORY**

### Scoring

| Action | Points |
|---|---|
| Eat pellet | 10 |
| Eat Power Pellet | 50 |
| Kill ghost (bomb) | 200 |
| Kill stunned ghost | 400 |
| Combo kills | 200 × 2^(n-1) per ghost |
| Collect power-up | 100 |
| Level complete | 1000 + time bonus |

---

## 📁 Project Structure

```
make-your-game/
├── index.html                      # Single-page entry point
├── package.json                    # ES module config, scripts, exports
├── biome.json                      # Biome linter/formatter config
├── vite.config.js                  # Vite dev server config
│
├── docs/                           # 📚 Documentation
│   ├── requirements.md             # Original project requirements
│   ├── audit.md                    # Audit checklist for grading
│   ├── game-description.md         # Full game rules & mechanics
│   └── implementation-plan.md      # Detailed dev plan (4 workflow tracks)
│
├── src/                            # 🧠 Source code
│   ├── main.js                     # Entry — bootstraps all systems
│   │
│   ├── core/                       # Pure domain logic (zero DOM)
│   │   ├── constants.js            # Enums, tuning values, cell types
│   │   ├── grid.js                 # Grid operations, pathfinding
│   │   ├── player.js               # Player state transitions
│   │   ├── bomb.js                 # Bomb placement, explosion calc
│   │   ├── ghost.js                # Ghost AI & personality
│   │   ├── scoring.js              # Score calculations
│   │   ├── timer.js                # Countdown logic
│   │   ├── collision.js            # Grid-based collision detection
│   │   └── *.test.js               # Co-located unit tests
│   │
│   ├── features/                   # Feature modules (co-located)
│   │   ├── feat.game-loop/         # requestAnimationFrame loop + state machine
│   │   ├── feat.renderer/          # DOM grid rendering + object pools
│   │   ├── feat.input/             # Keyboard input handler
│   │   ├── feat.hud/               # Score/lives/timer display (Signals)
│   │   ├── feat.pause-menu/        # Pause overlay
│   │   ├── feat.screens/           # Start, game over, victory screens
│   │   └── feat.maps/              # Level JSON data + map loader
│   │
│   ├── infrastructure/             # Side-effect adapters
│   │   ├── dom-adapter.js          # Safe DOM creation helpers
│   │   ├── storage-adapter.js      # High score persistence
│   │   └── audio-adapter.js        # Sound effects (bonus)
│   │
│   └── shared/                     # Cross-cutting utilities
│       ├── signal.js               # Minimal Signal implementation
│       ├── object-pool.js          # Generic object pool
│       ├── result.js               # Result<T, E> pattern
│       └── types.js                # JSDoc typedefs
│
├── assets/                         # 🎨 Static assets
│   ├── sprites/                    # SVG sprites
│   └── sounds/                     # Sound effects (bonus)
│
├── styles/                         # 💅 CSS
│   ├── reset.css                   # CSS reset
│   ├── variables.css               # Design tokens (colors, sizes, fonts)
│   ├── grid.css                    # CSS Grid layout for game board
│   └── animations.css              # Keyframe animations
│
└── AGENTS.md                       # Coding guidelines (ES2026 standards)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 20.x
- **npm** ≥ 10.x

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd make-your-game

# Install dependencies
npm ci
```

### Run the Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. Vite serves the app with hot-reload.

---

## 📜 Scripts & Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run test` | Run all unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate test coverage report |
| `npm run lint` | Run Biome linter |
| `npm run format` | Run Biome formatter |
| `npm run check` | Run Biome lint + format check |

---

## 🏛️ Architecture

The game follows **Clean Architecture** with a **Functional Core / Imperative Shell** pattern:

```
┌──────────────────────────────────────────┐
│           Imperative Shell               │
│  (main.js, renderer, input, audio)       │
│  DOM interactions, browser APIs, I/O     │
├──────────────────────────────────────────┤
│         Application / Features           │
│  (game loop, state machine, HUD, menus)  │
│  Orchestration, signals, side effects    │
├──────────────────────────────────────────┤
│            Core / Domain                 │
│  (grid, player, bomb, ghost, scoring)    │
│  PURE FUNCTIONS — zero DOM, zero I/O    │
└──────────────────────────────────────────┘
```

### Key Design Decisions

1. **No Canvas**: The game board is a CSS Grid. Each cell is a `<div>`. Movement uses `transform: translate()`.
2. **No Frameworks**: Vanilla JS with ES Modules. State management via custom Signals.
3. **60 FPS**: Fixed-timestep game loop with `requestAnimationFrame`. Render interpolation for smooth visuals.
4. **Object Pooling**: Explosion fire tiles and bombs are pooled to avoid garbage collection pauses.
5. **Minimal Repaints**: Only changed cells update. `will-change: transform` on moving entities only.
6. **Immutable State**: Core domain functions receive state and return new state — no mutation.
7. **Safe DOM**: All DOM creation via `createElement` — no `innerHTML`. XSS-safe by construction.

---

## ⚡ Performance Targets

| Metric | Target |
|---|---|
| Frame rate | ≥ 60 FPS (50-60 acceptable) |
| Frame budget | < 16.67ms per frame |
| DOM elements | ≤ 500 |
| Layer count | 3-5 composited layers |
| GC pauses | < 1ms (object pooling) |
| JS heap | < 10MB |
| Layout thrashing | Zero (batch reads → writes) |

### How to Measure

1. Open **DevTools → Performance** tab
2. Record a 10-second gameplay session
3. Verify:
   - No frame drops (green bar stays solid)
   - `requestAnimationFrame` fires consistently  
   - Paint events are minimal (enable Paint Flashing in Rendering tab)
   - Layer count is low (enable Layers panel)

---

## 👥 Development Workflow

The project is split into **4 parallel workflow tracks** to enable 4 developers to work simultaneously with minimal conflicts:

| Track | Dev | Scope | Key Files |
|---|---|---|---|
| **Track A** | Dev 1 | Core Engine & Orchestration | `src/main.js`, `src/features/feat.game-loop/*`, `src/shared/*` |
| **Track B** | Dev 2 | Grid, Physics & Player | `src/core/grid.js`, `src/core/bomb.js`, `src/features/feat.input/*` |
| **Track C** | Dev 3 | AI & Gameplay Systems | `src/core/ghost.js`, `src/core/scoring.js`, Power Pellet system |
| **Track D** | Dev 4 | Rendering & UI Shell | `src/features/feat.renderer/*`, `src/features/feat.hud/*`, `styles/*` |

See [implementation-plan.md](docs/implementation-plan.md) for the full ticket breakdown, dependency graph, and integration milestones.

### Git Workflow

- Each track works on its own feature branch: `feat/track-a-engine`, `feat/track-b-player`, etc.
- Merge into `main` at integration milestones
- All commits follow conventional commits: `feat:`, `fix:`, `test:`, `docs:`
- Run `npm run check` and `npm run test` before every push

---

## 📚 Documentation

| Document | Description |
|---|---|
| [requirements.md](docs/requirements.md) | Original project requirements and objectives |
| [audit.md](docs/audit.md) | Grading audit checklist |
| [game-description.md](docs/game-description.md) | Full game rules, mechanics, scoring, and technical constraints |
| [implementation-plan.md](docs/implementation-plan.md) | Detailed implementation plan with 4 workflow tracks and ~20 tickets |
| [AGENTS.md](AGENTS.md) | ES2026 coding guidelines and standards |

---

## 🛠️ Tech Stack & Constraints

### Used

| Technology | Purpose |
|---|---|
| **JavaScript (ES2026)** | Game logic, DOM manipulation |
| **HTML5** | Semantic page structure |
| **CSS3** | Grid layout, animations, styling |
| **Vite** | Dev server, bundler |
| **Biome** | Linting + formatting |
| **Vitest** | Unit testing |
| **SVG** | Sprites and visual assets |

### Explicitly NOT Used (by requirement)

| Technology | Reason |
|---|---|
| `<canvas>` | Project requirement — DOM only |
| React / Vue / Angular | No frameworks allowed |
| Game engines (Phaser, etc.) | Must build custom engine |
| jQuery | Vanilla JS only |
| `var` | ES2026 standard — `const`/`let` only |
| CommonJS (`require`) | ES Modules only |
| `innerHTML` | XSS prevention by construction |

---

## 🤝 Contributing

1. Read [AGENTS.md](AGENTS.md) for coding standards
2. Read [implementation-plan.md](docs/implementation-plan.md) for your assigned track
3. Follow the Git workflow above
4. Write tests for all core domain functions
5. Run `npm run check && npm run test` before pushing
6. Request review at integration milestones

---

## 📄 License

This project is developed as an educational exercise.

---

*Ms. Ghostman — Where Pac-Man meets Bomberman. Eat. Bomb. Survive.* 🎮💣👻
