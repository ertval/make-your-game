import { describe, expect, it, vi } from 'vitest';

// Mock the ecs entrypoint before importing main.js
vi.mock('../../src/main.ecs.js', () => ({
  startBrowserApplication: vi.fn(),
}));

describe('main.js', () => {
  it('calls startBrowserApplication upon import', async () => {
    const { startBrowserApplication } = await import('../../src/main.ecs.js');

    // Importing the file should trigger the side effect
    await import('../../src/main.js');

    expect(startBrowserApplication).toHaveBeenCalled();
  });
});
