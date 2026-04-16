/**
 * Test: csp-policy.test.js
 * Purpose: Verifies practical dev CSP and strict production CSP/Trusted Types policy generation.
 * Public API: N/A (test module).
 * Implementation Notes: Loads Vite config factory and inspects generated headers/meta policies.
 */

import { describe, expect, it } from 'vitest';

import createViteConfig from '../../../vite.config.js';

function resolveConfig(command) {
  if (typeof createViteConfig === 'function') {
    return createViteConfig({
      command,
      mode: command === 'build' ? 'production' : 'development',
    });
  }

  return createViteConfig;
}

function extractMetaCsp(config) {
  const plugin = (config.plugins || []).find((candidate) => candidate?.name === 'inject-csp-meta');
  expect(plugin).toBeTruthy();
  expect(typeof plugin.transformIndexHtml).toBe('function');

  const transformed = plugin.transformIndexHtml();
  const tags = Array.isArray(transformed) ? transformed : [transformed];
  const cspTag = tags.find(
    (tag) => tag?.tag === 'meta' && tag?.attrs?.['http-equiv'] === 'Content-Security-Policy',
  );

  expect(cspTag).toBeTruthy();
  return cspTag.attrs.content;
}

describe('vite CSP and Trusted Types policy', () => {
  it('uses strict Trusted Types CSP for production build/preview surfaces', () => {
    const buildConfig = resolveConfig('build');
    const previewCsp = String(buildConfig.preview?.headers?.['Content-Security-Policy'] || '');
    const metaCsp = extractMetaCsp(buildConfig);

    for (const policy of [previewCsp, metaCsp]) {
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("require-trusted-types-for 'script'");
      expect(policy).toContain('trusted-types default');
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toContain("'unsafe-inline'");
    }
  });

  it('keeps development server CSP practical for Vite HMR', () => {
    const serveConfig = resolveConfig('serve');
    const devCsp = String(serveConfig.server?.headers?.['Content-Security-Policy'] || '');
    const metaCsp = extractMetaCsp(serveConfig);

    for (const policy of [devCsp, metaCsp]) {
      expect(policy).toContain("script-src 'self' 'unsafe-eval'");
      expect(policy).toContain("style-src 'self' 'unsafe-inline'");
      expect(policy).toContain("connect-src 'self' ws: wss: http: https:");
      expect(policy).not.toContain("require-trusted-types-for 'script'");
      expect(policy).not.toContain('trusted-types default');
    }
  });
});
