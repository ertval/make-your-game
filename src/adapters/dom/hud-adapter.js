/*
 * Track C HUD DOM adapter.
 *
 * This module owns the DOM boundary for HUD metric rendering and applies only
 * textContent updates based on externally supplied state. It contains no game
 * logic, performs no per-frame DOM creation, and keeps formatting rules local
 * to the adapter so ECS systems can remain DOM-agnostic.
 *
 * Public API:
 * - createHudAdapter(rootElement): create a HUD adapter bound to one root node.
 *
 * Implementation notes:
 * - HUD nodes are queried once during adapter creation and then reused.
 * - Missing HUD nodes are tolerated so the adapter can operate against partial
 *   test fixtures without throwing.
 * - Rendering uses only textContent to preserve the safe-sink requirement.
 * - Live-region updates are throttled so accessibility status announcements do
 *   not spam on every render tick.
 */

export const ARIA_LIVE_THROTTLE_MS = 1000;

function getNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function setTextContentIfChanged(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

export function formatLives(lives) {
  return '❤️'.repeat(Math.max(0, lives));
}

export function formatScore(score) {
  return String(Math.max(0, score)).padStart(5, '0');
}

export function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function buildStatusMessage(previousState, lives, score, timer, level) {
  if (!previousState) {
    return `Lives ${lives}. Score ${formatScore(score)}. Time ${formatTimer(timer)}.`;
  }

  if (lives !== previousState.lives) {
    return `Lives ${lives}.`;
  }

  if (score !== previousState.score) {
    return `Score ${formatScore(score)}.`;
  }

  if (level !== previousState.level) {
    return `Level ${level}.`;
  }

  if (timer !== previousState.timer && timer <= 10) {
    return `Time ${formatTimer(timer)} remaining.`;
  }

  return '';
}

export function createHudAdapter(rootElement) {
  const elements = {
    bombs: rootElement.querySelector('[data-hud="bombs"]'),
    fire: rootElement.querySelector('[data-hud="fire"]'),
    level: rootElement.querySelector('[data-hud="level"]'),
    lives: rootElement.querySelector('[data-hud="lives"]'),
    score: rootElement.querySelector('[data-hud="score"]'),
    status: rootElement.querySelector('[data-hud="status"]'),
    timer: rootElement.querySelector('[data-hud="timer"]'),
  };
  let lastAnnouncedAt = 0;
  let lastAnnouncement = '';
  let previousState = null;

  if (elements.status) {
    elements.status.setAttribute('aria-live', 'polite');
    elements.status.setAttribute('aria-atomic', 'true');
  }

  function update(state) {
    const { lives = 0, score = 0, timer = 0, bombs = 0, fire = 0, level = 1 } = state || {};
    const nextFormattedState = {
      bombs: String(bombs),
      fire: String(fire),
      level: String(level),
      lives: formatLives(lives),
      score: formatScore(score),
      timer: formatTimer(timer),
    };

    setTextContentIfChanged(elements.lives, nextFormattedState.lives);
    setTextContentIfChanged(elements.score, nextFormattedState.score);
    setTextContentIfChanged(elements.timer, nextFormattedState.timer);
    setTextContentIfChanged(elements.bombs, nextFormattedState.bombs);
    setTextContentIfChanged(elements.fire, nextFormattedState.fire);
    setTextContentIfChanged(elements.level, nextFormattedState.level);

    const statusMessage = buildStatusMessage(previousState, lives, score, timer, level);
    const now = getNow();

    if (
      elements.status &&
      statusMessage &&
      statusMessage !== lastAnnouncement &&
      now - lastAnnouncedAt >= ARIA_LIVE_THROTTLE_MS
    ) {
      setTextContentIfChanged(elements.status, statusMessage);
      lastAnnouncement = statusMessage;
      lastAnnouncedAt = now;
    }

    if (previousState) {
      previousState.bombs = bombs;
      previousState.fire = fire;
      previousState.level = level;
      previousState.lives = lives;
      previousState.score = score;
      previousState.timer = timer;
    } else {
      previousState = {
        bombs,
        fire,
        level,
        lives,
        score,
        timer,
      };
    }
  }

  return {
    update,
  };
}
