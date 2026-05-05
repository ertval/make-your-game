/*
 * Vitest configuration.
 * Purpose: Defines test discovery, environment, and coverage thresholds.
 * Public API: N/A (config module).
 * Implementation Notes: Coverage tracks all src recursive .js files for threshold enforcement.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      all: true,
      include: ['src/**/*.js'],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 90,
        statements: 90,
      },
    },
  },
});
