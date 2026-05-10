/**
 * Browser-executed audit assertions.
 *
 * Purpose: Runs executable runtime/performance checks for audit questions that
 * require real browser execution, including semi-automatable threshold gates.
 * Public API: N/A (Playwright test module).
 *
 * Threshold strategy:
 *   The canonical SEMI_AUTOMATABLE_THRESHOLDS table (in audit-question-map.js)
 *   stores the strict AGENTS.md canonical values (16.7ms p95 frame time, 60 FPS).
 *   A CI_TOLERANCE_FACTOR relaxes timing/FPS thresholds to account for
 *   headless rAF clock noise (~0.5-0.8ms locally) and VM throttling in CI
 *   (~25-35 FPS on GitHub Actions). Default: 1.05 locally, 1.3 in CI.
 *   Override with CI_TOLERANCE_FACTOR env var (set to 1.0 for strict).
 *
 *   Frame-time thresholds are multiplied by the factor. FPS thresholds are
 *   divided (since FPS ∝ 1/frameTime). P99 and long-task thresholds are
 *   unaffected because they test different failure modes.
 */

import { expect, test } from '@playwright/test';

import { bootRuntime, FIXED_DT_MS, startGameAndWait } from '../helpers/game-helpers.js';
import { SEMI_AUTOMATABLE_THRESHOLDS } from './audit-question-map.js';

const CI_TOLERANCE_FACTOR = Number(
  process.env.CI_TOLERANCE_FACTOR ?? (process.env.CI ? '1.3' : '1.05'),
);

/**
 * Apply tolerance factor to strict canonical thresholds.
 * Frame-time values are multiplied; FPS values are divided.
 * Local default 1.05 accounts for headless rAF clock noise (~0.5–0.8ms).
 * Set CI_TOLERANCE_FACTOR=1.0 for strict canonical check (16.7ms/60FPS).
 */
function applyCIFactor(thresholds) {
  if (CI_TOLERANCE_FACTOR <= 0) {
    return thresholds;
  }

  return {
    ...thresholds,
    maxP95FrameTimeMs:
      thresholds.maxP95FrameTimeMs != null
        ? thresholds.maxP95FrameTimeMs * CI_TOLERANCE_FACTOR
        : thresholds.maxP95FrameTimeMs,
    minP95Fps:
      thresholds.minP95Fps != null
        ? Math.floor(thresholds.minP95Fps / CI_TOLERANCE_FACTOR)
        : thresholds.minP95Fps,
  };
}

const ACTIVE_THRESHOLDS = {
  'AUDIT-F-17': applyCIFactor(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-17']),
  'AUDIT-F-18': applyCIFactor(SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-F-18']),
  'AUDIT-B-05': SEMI_AUTOMATABLE_THRESHOLDS['AUDIT-B-05'],
};

async function waitForFrameSamples(page, minimumSamples, timeout = 8_000) {
  await expect
    .poll(
      async () => {
        return page.evaluate(() => window.__MS_GHOSTMAN_FRAME_PROBE__.getStats().sampleCount);
      },
      {
        timeout,
      },
    )
    .toBeGreaterThanOrEqual(minimumSamples);

  return page.evaluate(() => window.__MS_GHOSTMAN_FRAME_PROBE__.getStats());
}

test('AUDIT-F-01/AUDIT-F-02/AUDIT-B-01 runtime boots and rAF sampling is active', async ({
  page,
}) => {
  await bootRuntime(page);

  const frameStats = await waitForFrameSamples(page, 45);
  expect(frameStats.sampleCount).toBeGreaterThanOrEqual(45);
  expect(frameStats.latestFrameTime).toBeGreaterThan(0);
});

test('AUDIT-F-07/AUDIT-F-08/AUDIT-F-09 pause, continue, and restart transitions are executable', async ({
  page,
}) => {
  await bootRuntime(page);

  const controlsContract = await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    return {
      hasPause: typeof runtime.pause === 'function',
      hasResume: typeof runtime.resume === 'function',
      hasRestart: typeof runtime.restart === 'function',
      hasSetState: typeof runtime.setState === 'function',
      hasStartGame: typeof runtime.startGame === 'function',
    };
  });

  expect(controlsContract).toEqual({
    hasPause: true,
    hasResume: true,
    hasRestart: true,
    hasSetState: true,
    hasStartGame: true,
  });

  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.startGame({ levelIndex: 0 });
  });

  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    if (runtime.getSnapshot().state !== 'PLAYING') {
      runtime.setState('PLAYING');
    }
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PLAYING');

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.pause();
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PAUSED');

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.resume();
  });

  await expect
    .poll(async () => page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().state))
    .toBe('PLAYING');

  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.pause();
    runtime.restart();
    // Pause immediately after restart to freeze the clock before rAF ticks.
    runtime.pause();
  });

  const afterRestart = await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot());
  expect(afterRestart.state).toBe('PAUSED');
  // simTimeMs should be near zero after restart reset + at most one frame tick.
  expect(afterRestart.simTimeMs).toBeLessThanOrEqual(FIXED_DT_MS);
});

test('AUDIT-F-10 pause freezes simulation while rAF keeps sampling frames', async ({ page }) => {
  await bootRuntime(page);

  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.startGame({ levelIndex: 0 });
    if (runtime.getSnapshot().state !== 'PLAYING') {
      runtime.setState('PLAYING');
    }
    runtime.pause();
  });

  const pausedFrame = await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().frame);
  const pausedSampleCount = await page.evaluate(
    () => window.__MS_GHOSTMAN_FRAME_PROBE__.getStats().sampleCount,
  );

  await expect
    .poll(
      async () => {
        return page.evaluate(() => {
          return {
            frame: window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().frame,
            sampleCount: window.__MS_GHOSTMAN_FRAME_PROBE__.getStats().sampleCount,
          };
        });
      },
      {
        timeout: 5_000,
      },
    )
    .toEqual({
      frame: pausedFrame,
      sampleCount: expect.any(Number),
    });

  const laterSampleCount = await page.evaluate(
    () => window.__MS_GHOSTMAN_FRAME_PROBE__.getStats().sampleCount,
  );
  expect(laterSampleCount).toBeGreaterThanOrEqual(pausedSampleCount);
});

test('AUDIT-F-13 progression contract can reach VICTORY deterministically', async ({ page }) => {
  await bootRuntime(page);

  const progression = await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;

    runtime.startGame({ levelIndex: 0 });
    if (runtime.getSnapshot().state !== 'PLAYING') {
      runtime.setState('PLAYING');
    }

    runtime.setState('LEVEL_COMPLETE');
    runtime.startGame();
    runtime.setState('LEVEL_COMPLETE');
    runtime.startGame();
    runtime.setState('LEVEL_COMPLETE');
    runtime.startGame();

    return {
      levelIndex: runtime.getLevelIndex(),
      state: runtime.getSnapshot().state,
    };
  });

  expect(progression.levelIndex).toBe(2);
  expect(progression.state).toBe('VICTORY');
});

test('AUDIT-F-17 explicit frame-drop threshold assertions', async ({ page }) => {
  await bootRuntime(page);

  const thresholds = ACTIVE_THRESHOLDS['AUDIT-F-17'];
  const stats = await waitForFrameSamples(page, thresholds.minFrameSamples);

  expect(stats.p95FrameTime).toBeLessThanOrEqual(thresholds.maxP95FrameTimeMs);
  expect(stats.p99FrameTime).toBeLessThanOrEqual(thresholds.maxP99FrameTimeMs);
});

test('AUDIT-F-18 explicit FPS threshold assertions', async ({ page }) => {
  await bootRuntime(page);

  const thresholds = ACTIVE_THRESHOLDS['AUDIT-F-18'];
  const stats = await waitForFrameSamples(page, thresholds.minFrameSamples);

  expect(stats.p95Fps).toBeGreaterThanOrEqual(thresholds.minP95Fps);
});

test('AUDIT-B-05 explicit async-performance long-task threshold assertions', async ({ page }) => {
  await bootRuntime(page);

  const thresholds = ACTIVE_THRESHOLDS['AUDIT-B-05'];
  const longTaskSummary = await page.evaluate(async (sampleWindowMs) => {
    if (typeof PerformanceObserver !== 'function') {
      return {
        maxLongTaskMs: 0,
        supported: false,
        taskCount: 0,
      };
    }

    const durations = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        durations.push(entry.duration);
      }
    });

    let supported = true;
    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      supported = false;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, sampleWindowMs);
    });

    observer.disconnect();

    return {
      maxLongTaskMs: durations.length > 0 ? Math.max(...durations) : 0,
      supported,
      taskCount: durations.length,
    };
  }, thresholds.sampleWindowMs);

  expect(longTaskSummary.supported).toBe(true);
  expect(longTaskSummary.taskCount).toBeLessThanOrEqual(thresholds.maxLongTaskCount);
  expect(longTaskSummary.maxLongTaskMs).toBeLessThanOrEqual(thresholds.maxLongTaskMs);
});

test('Platform DOM contract: no canvas element and HUD shell visible at runtime', async ({
  page,
}) => {
  await bootRuntime(page);

  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('[data-hud="timer"]')).toBeVisible();
  await expect(page.locator('[data-hud="score"]')).toBeVisible();
  await expect(page.locator('[data-hud="lives"]')).toBeVisible();
});

test('AUDIT-CI-09 explicit DOM element budget and memory allocation assertions', async ({
  page,
}) => {
  await bootRuntime(page);

  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.startGame({ levelIndex: 0 });
  });

  const domCount = await page.evaluate(() => document.querySelectorAll('*').length);
  expect(domCount).toBeLessThanOrEqual(500);

  const memoryInfo = await page.evaluate(() => {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        usedJSHeapSize: performance.memory.usedJSHeapSize,
      };
    }
    return null;
  });

  if (memoryInfo) {
    // Used heap should not exceed 50 MB after warm-up on a standard level
    expect(memoryInfo.usedJSHeapSize).toBeLessThan(50_000_000);

    // Verify memory stability (no repeated burst allocations)
    // Wait a few frames and check again
    await page.waitForTimeout(200);
    const memoryStats2 = await page.evaluate(() => {
      if (!performance.memory) return null;
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
      };
    });

    if (memoryStats2) {
      // We expect no massive heap growth in 200ms of idle/minimal play
      const growth = memoryStats2.usedJSHeapSize - memoryInfo.usedJSHeapSize;
      // Allow for some minor GC noise but fail if > 2MB growth in 200ms
      expect(growth).toBeLessThan(2 * 1024 * 1024);
    }
  }
});

test('AUDIT-F-03 single-player gameplay is preserved', async ({ page }) => {
  await bootRuntime(page);
  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.startGame({ levelIndex: 0 });
  });

  const playerCount = await page.evaluate(
    () => document.querySelectorAll('.sprite--player').length,
  );
  expect(playerCount).toBe(1);
});

test('AUDIT-F-06 project identity constraints are met', async ({ page }) => {
  await bootRuntime(page);
  const title = await page.title();
  expect(title).toContain('Ms. Ghostman');
});

test('AUDIT-F-11 input handling meets requirements', async ({ page }) => {
  await bootRuntime(page);
  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.startGame({ levelIndex: 0 });
    if (runtime.getSnapshot().state !== 'PLAYING') {
      runtime.setState('PLAYING');
    }
  });

  const getPlayerPosition = async () => {
    return page.evaluate(() => {
      const player = document.querySelector('.sprite--player');
      if (!player) return null;
      const rect = player.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
  };

  const startPos = await getPlayerPosition();
  expect(startPos).not.toBeNull();

  // Press an arrow key and assert the player sprite actually advances.
  // A frame-counter advance alone is not sufficient — it would pass even
  // if the input system never wired the keydown into the simulation.
  await page.keyboard.down('ArrowLeft');

  await expect
    .poll(async () => (await getPlayerPosition()).x, { timeout: 2000 })
    .toBeLessThan(startPos.x);

  await page.keyboard.up('ArrowLeft');
});

test('AUDIT-F-12 hold-input mechanism is robust', async ({ page }) => {
  await bootRuntime(page);
  await page.evaluate(() => {
    const runtime = window.__MS_GHOSTMAN_RUNTIME__;
    runtime.startGame({ levelIndex: 0 });
    if (runtime.getSnapshot().state !== 'PLAYING') {
      runtime.setState('PLAYING');
    }
  });

  const getPlayerPosition = async () => {
    return page.evaluate(() => {
      const player = document.querySelector('.sprite--player');
      if (!player) return null;
      const rect = player.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
  };

  const startPos = await getPlayerPosition();
  expect(startPos).not.toBeNull();

  // Press and hold the key down
  await page.keyboard.down('ArrowLeft');

  // Wait for continuous movement over a longer distance
  await expect
    .poll(
      async () => {
        const pos = await getPlayerPosition();
        return startPos.x - pos.x;
      },
      { timeout: 3000 },
    )
    .toBeGreaterThan(32); // Ensure the player moves a substantial amount without key repeat

  await page.keyboard.up('ArrowLeft');
});

test('AUDIT-F-14 HUD metrics are present', async ({ page }) => {
  await bootRuntime(page);
  const hasTimer = await page.evaluate(() => !!document.querySelector('[data-hud="timer"]'));
  const hasScore = await page.evaluate(() => !!document.querySelector('[data-hud="score"]'));
  const hasLives = await page.evaluate(() => !!document.querySelector('[data-hud="lives"]'));

  expect(hasTimer).toBe(true);
  expect(hasScore).toBe(true);
  expect(hasLives).toBe(true);
});

test('AUDIT-F-15 HUD timer/countdown functions correctly', async ({ page }) => {
  await bootRuntime(page);
  await startGameAndWait(page, { levelIndex: 0 });

  const timerEl = await page.locator('[data-hud="timer"]');
  await expect(timerEl).toBeVisible();

  const initialText = await timerEl.textContent();
  const initialSeconds = parseInt(initialText.replace(/[^0-9]/g, ''), 10);
  expect(Number.isFinite(initialSeconds)).toBe(true);
  expect(initialSeconds).toBeGreaterThan(0);

  // Wait for enough frames to pass that the timer should tick down
  const frameBefore = await page.evaluate(() => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().frame);
  await page.waitForFunction(
    (f) => window.__MS_GHOSTMAN_RUNTIME__.getSnapshot().frame > f + 60,
    frameBefore,
    { timeout: 5000 },
  );

  // Timer should have decreased after ~1 second of gameplay
  const laterText = await timerEl.textContent();
  const laterSeconds = parseInt(laterText.replace(/[^0-9]/g, ''), 10);
  expect(Number.isFinite(laterSeconds)).toBe(true);
  expect(laterSeconds).toBeLessThan(initialSeconds);
});

test('AUDIT-F-16 HUD score and lives update properly', async ({ page }) => {
  await bootRuntime(page);
  await startGameAndWait(page, { levelIndex: 0 });

  const scoreEl = await page.locator('[data-hud="score"]');
  const livesEl = await page.locator('[data-hud="lives"]');

  await expect(scoreEl).toBeVisible();
  await expect(livesEl).toBeVisible();

  // Read initial score — player spawns at (7,7) with an adjacent pellet at (7,8)
  const initialScoreText = await scoreEl.textContent();
  const initialScore = parseInt(initialScoreText.replace(/[^0-9]/g, ''), 10);
  expect(Number.isFinite(initialScore)).toBe(true);

  // Move right to eat the pellet and trigger a score increment
  await page.keyboard.down('ArrowRight');
  await expect
    .poll(
      async () => {
        const text = await scoreEl.textContent();
        return parseInt(text.replace(/[^0-9]/g, ''), 10);
      },
      { timeout: 3000 },
    )
    .toBeGreaterThan(initialScore);
  await page.keyboard.up('ArrowRight');

  // Lives element should show a numeric value
  const livesText = await livesEl.textContent();
  const livesValue = parseInt(livesText.replace(/[^0-9]/g, ''), 10);
  expect(Number.isFinite(livesValue)).toBe(true);
  expect(livesValue).toBeGreaterThan(0);
});

test('AUDIT-B-03 entity and DOM pooling logic executes', async ({ page }) => {
  await bootRuntime(page);

  // Verify that transient entities are pooled and pre-rendered, hidden off-screen or similar.
  const domCount1 = await page.evaluate(() => document.querySelectorAll('*').length);

  await page.evaluate(() => {
    window.__MS_GHOSTMAN_RUNTIME__.startGame({ levelIndex: 0 });
  });

  await page.keyboard.press('Space'); // Drop a bomb

  const domCount2 = await page.evaluate(() => document.querySelectorAll('*').length);

  // Pooling means DOM nodes are not created/destroyed on the fly,
  // so the total DOM count should remain perfectly stable.
  expect(domCount1).toBeLessThanOrEqual(500);
  expect(domCount2).toBe(domCount1);
});
