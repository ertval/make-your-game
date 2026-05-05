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
      exclude: ['tests/e2e/**', 'src/security/trusted-types.js'],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 90,
        statements: 90,
      },
    },
  },
});
