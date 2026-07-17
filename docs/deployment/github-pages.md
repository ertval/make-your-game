# GitHub Pages Deployment Guide

Ms. Ghostman is deployed automatically to GitHub Pages using a secure, automated CI/CD pipeline.

## Automated Deployment Flow

Pushes to the `main` branch trigger the deployment workflow located in [.github/workflows/deploy.yml](/make-your-game/.github/workflows/deploy.yml).

The workflow performs the following steps:
1. **Checkout**: Checks out the codebase using `actions/checkout`.
2. **Environment Setup**: Configures Node.js using `actions/setup-node`.
3. **npm Version Pin**: Installs a specific npm version to ensure reproducible install behavior.
4. **Dependency Installation**: Runs `npm ci` (or `npm install` if a lockfile is missing).
5. **Linting and Validation**: Runs `npm run check` (Biome checks) and `npm run test:unit`.
6. **Vite Build**: Compiles the production artifacts into the `dist/` directory via `npm run build`.
7. **Dynamic Asset Prep**: Copies runtime assets (`assets/maps`, `assets/manifests`, `assets/generated`) into the `dist/assets` directory.
8. **Deploy**: Configures Pages and uploads/deploys the `dist` folder to GitHub Pages via `actions/deploy-pages`.

All workflow steps use SHA-pinned GitHub Actions to prevent supply chain attacks.

## Sub-path Configuration

GitHub Pages project sites are served from a sub-path (e.g., `/make-your-game/`). To ensure assets resolve correctly:

### 1. Vite Base URL
In [vite.config.js](/make-your-game/vite.config.js), the `base` configuration dynamically sets the base path:
```javascript
base: command === 'build' && process.env.GITHUB_ACTIONS ? '/make-your-game/' : '/'
```

### 2. Runtime Asset Loading
Dynamic fetches (such as loading map configurations and audio clip manifests) prepends the Vite-injected base path via `import.meta.env.BASE_URL`:
- **Maps**: Fetched from `${import.meta.env.BASE_URL}assets/maps/level-${levelNumber}.json`
- **Audio Clips**: Resolved relative to `${import.meta.env.BASE_URL}assets/generated/sfx/...` or `music/...`

## Local Development vs. Production Build

- **Local Run**: Serves from `/` (e.g., `http://localhost:5173/`).
- **Production Build**: Relies on `import.meta.env.BASE_URL` dynamically set at build-time.
- **Local Preview**: You can preview the production bundle locally with `npm run preview`.

## Security Posture & Clickjacking Defense

Because static hosting targets like GitHub Pages do not support custom server headers, certain Content Security Policy (CSP) directives like `frame-ancestors 'none'` (which are ignored when specified in `<meta http-equiv>` tags) cannot be enforced at the server layer.

To prevent clickjacking on static deployments:
1. **Frame-Busting Script**: A lightweight JavaScript frame-buster at [frame-busting.js](/make-your-game/public/frame-busting.js) is loaded at the very top of `<head>` in [index.html](file:///home/ertval/code/zone-modules/make-your-game/index.html). If the page is loaded in an iframe (`window.self !== window.top`), it redirects the parent window to the game's URL (`window.top.location = window.self.location.href`).
2. **Static Headers Fallback**: Platforms like Netlify or Cloudflare Pages that *do* support custom headers are provided with a `public/_headers` configuration file that sets full clickjacking and CSP security headers.