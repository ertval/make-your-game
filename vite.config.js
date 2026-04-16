import { defineConfig } from 'vite';

const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "require-trusted-types-for 'script'",
  'trusted-types default',
  'upgrade-insecure-requests',
].join('; ');

const DEVELOPMENT_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: http: https:",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
].join('; ');

function createSecurityHeaders(csp) {
  return {
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function createCspMetaPlugin(csp) {
  return {
    name: 'inject-csp-meta',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: csp,
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig(({ command }) => {
  const isProductionBuild = command === 'build';
  const csp = isProductionBuild ? PRODUCTION_CSP : DEVELOPMENT_CSP;

  return {
    plugins: [createCspMetaPlugin(csp)],
    server: {
      host: true,
      port: 5173,
      headers: createSecurityHeaders(DEVELOPMENT_CSP),
    },
    preview: {
      host: true,
      port: 4173,
      headers: createSecurityHeaders(PRODUCTION_CSP),
    },
  };
});
