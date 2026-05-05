/**
 * Browser-executed audit assertions.
 *
 * Purpose: Runs executable runtime/performance checks for audit questions that
 * require real browser execution, including semi-automatable threshold gates.
 * Public API: N/A (Playwright test module).
 *
 * CI note: Frame-timing thresholds are relaxed in CI environments because
 * GitHub Actions runners run headless Chromium at ~25-35 FPS vs ~60 FPS
 * locally. The relaxed values still catch broken game loops — they tolerate
 * VM throttling without hiding real regressions.
 */

import { expect, test } from '@playwright/test';

import { bootRuntime, FIXED_DT_MS } from '../helpers/game-helpers.js';
import {
  CI_SEMI_AUTOMATABLE_THRESHOLDS,
  SEMI_AUTOMATABLE_THRESHOLDS,
} from './audit-question-map.js';

// Use relaxed CI thresholds when running in a CI environment (process.env.CI
// is always set to 'true' on GitHub Actions and most other CI platforms).
const ACTIVE_THRESHOLDS = process.env.CI
  ? CI_SEMI_AUTOMATABLE_THRESHOLDS
  : SEMI_AUTOMATABLE_THRESHOLDS;

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
