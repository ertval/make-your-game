import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Custom build plugin to copy static assets to the dist output directory.
// Because Vite does not bundle dynamically fetched assets (like level JSONs
// and audio manifests), we copy them post-build so they are available in production.
function createCopyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    // Build-only: the copy step targets `dist/`, which is produced solely by
    // `vite build`. Restricting with `apply: 'build'` keeps the plugin out of
    // the dev server and `vite preview` runs (where there is no bundle to copy)
    // without altering the build output.
    apply: 'build',
    closeBundle() {
      const __dirname = path.dirname(fileURLToPath(import.meta.url));
      const srcDir = path.resolve(__dirname, 'assets');
      const destDir = path.resolve(__dirname, 'dist/assets');
      const foldersToCopy = ['maps', 'manifests', 'generated'];

      for (const folder of foldersToCopy) {
        const src = path.join(srcDir, folder);
        const dest = path.join(destDir, folder);

        if (fs.existsSync(src)) {
          // Recursive copy preserving directories and nested assets
          fs.cpSync(src, dest, { recursive: true });
        }
      }
    },
  };
}

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

// SEC-06: 'unsafe-eval' and 'unsafe-inline' are required by Vite's HMR runtime
// during development and are explicitly permitted by AGENTS.md ("During
// development with Vite, CSP enforcement MAY be relaxed to allow HMR inline
// scripts"). The production CSP above retains the strict policy.
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

function createSecurityHeaders(csp, { crossOriginIsolation = false } = {}) {
  const headers = {
    'Content-Security-Policy': csp,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  };
  if (crossOriginIsolation) {
    headers['Cross-Origin-Opener-Policy'] = 'same-origin';
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  }
  return headers;
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
    // `base: './'` keeps the *bundled* entry references (the hashed JS/CSS that
    // Vite injects into index.html) relative, so the built app can be opened
    // from a file path or a non-root mount without rewriting those tags.
    //
    // Deployment assumptions:
    //   1. Deployment target is ROOT-HOSTED — the build is served from the
    //      domain root `/` (the documented `npm run prod` → `vite preview` flow
    //      serves from `/`).
    //   2. Runtime asset fetches INTENTIONALLY use root-absolute `/assets/...`
    //      URLs — level maps and the audio/visual manifests, e.g.
    //      `/assets/maps/level-1.json` and `/assets/manifests/audio-manifest.json`
    //      (see src/main.ecs.js). The copy-static-assets plugin below lands those
    //      files at `dist/assets/...`, which resolves only under root hosting.
    //   3. Sub-path deployments are OUT OF SCOPE — hosting under a sub-path would
    //      break those root-absolute fetches; supporting it would require moving
    //      the fetches to `import.meta.env.BASE_URL`-relative URLs, deliberately
    //      not done here so runtime behavior is unchanged.
    base: './',
    plugins: [createCspMetaPlugin(csp), createCopyStaticAssetsPlugin()],
    server: {
      host: true,
      port: 5173,
      headers: createSecurityHeaders(DEVELOPMENT_CSP),
    },
    preview: {
      host: true,
      port: 4173,
      headers: createSecurityHeaders(PRODUCTION_CSP, { crossOriginIsolation: true }),
    },
  };
});
