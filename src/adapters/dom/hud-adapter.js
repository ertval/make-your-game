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
 * - Each metric node carries a permanent label (e.g. "Score:") plus a dedicated
 *   value node ([data-hud-value]). The adapter writes only into the value node so
 *   labels are never overwritten; it falls back to the metric element itself when
 *   no value node exists (partial test fixtures).
 * - Missing HUD nodes are tolerated so the adapter can operate against partial
 *   test fixtures without throwing.
 * - Rendering uses only textContent to preserve the safe-sink requirement.
 * - Live-region updates are throttled so accessibility status announcements do
 *   not spam on every render tick.
 */

/**
 * Throttle window for ARIA live-region announcements.
 *
 * @internal Exported for tests only; not part of the adapter's public API
 *   (`createHudAdapter`). Production code must not import this.
 */
export const ARIA_LIVE_THROTTLE_MS = 1000;

function getNow() {
  // ARIA throttling must compare timestamps from a single monotonic time base.
  // Mixing performance.now() with Date.now() yields meaningless intervals (the
  // two clocks have unrelated origins), so we standardize on performance.now()
  // and never fall back to Date.now(). When performance.now() is unavailable we
  // return null so the caller skips throttling and always announces — favouring
  // accessibility over throttling on hosts that lack a high-resolution clock.
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return null;
}

function setTextContentIfChanged(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

/**
 * Resolve the node a metric value should be written into. Prefers a dedicated
 * [data-hud-value] child so the metric's label text is preserved; falls back to
 * the metric element itself when no value node exists (e.g. test fixtures).
 */
function resolveValueNode(element) {
  if (element && typeof element.querySelector === 'function') {
    const valueNode = element.querySelector('[data-hud-value]');

    if (valueNode) {
      return valueNode;
    }
  }

  return element;
}

/**
 * @internal Exported for tests only; not part of the adapter's public API
 *   (`createHudAdapter`). Production code must not import this.
 */
export function formatLives(lives) {
  return '❤️'.repeat(Math.max(0, lives));
}

/**
 * @internal Exported for tests only; not part of the adapter's public API
 *   (`createHudAdapter`). Production code must not import this.
 */
export function formatScore(score) {
  return String(Math.max(0, score)).padStart(5, '0');
}

/**
 * @internal Exported for tests only; not part of the adapter's public API
 *   (`createHudAdapter`). Production code must not import this.
 */
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
  const valueNodes = {
    bombs: resolveValueNode(elements.bombs),
    fire: resolveValueNode(elements.fire),
    level: resolveValueNode(elements.level),
    lives: resolveValueNode(elements.lives),
    score: resolveValueNode(elements.score),
    timer: resolveValueNode(elements.timer),
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

    setTextContentIfChanged(valueNodes.lives, nextFormattedState.lives);
    setTextContentIfChanged(valueNodes.score, nextFormattedState.score);
    setTextContentIfChanged(valueNodes.timer, nextFormattedState.timer);
    setTextContentIfChanged(valueNodes.bombs, nextFormattedState.bombs);
    setTextContentIfChanged(valueNodes.fire, nextFormattedState.fire);
    setTextContentIfChanged(valueNodes.level, nextFormattedState.level);

    const statusMessage = buildStatusMessage(previousState, lives, score, timer, level);
    const now = getNow();
    // A null clock (no performance.now) means we cannot throttle reliably, so
    // announce every change rather than mixing in an unrelated time base.
    const throttleWindowElapsed = now === null || now - lastAnnouncedAt >= ARIA_LIVE_THROTTLE_MS;

    if (
      elements.status &&
      statusMessage &&
      statusMessage !== lastAnnouncement &&
      throttleWindowElapsed
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
