# GitHub Pages Deployment Guide

This guide covers how to publish Ms. Ghostman on GitHub Pages.

## What GitHub Pages can host

GitHub Pages serves static files only. That means the published site must end up as HTML, CSS, JavaScript, SVG, and related assets.

For this repository snapshot, the repo currently contains documentation, workflow files, and asset manifests, and includes a minimal development entry (`index.html`) and project manifest (`package.json`). It may not yet include a production build artifact; to publish the actual game, add a built static output or point Pages at the production build output.

If you want to publish the actual game, add a static entry point first. If you want to publish docs, you can host a documentation page from the repository source as well.

## Recommended hosting options

Use one of these approaches:

1. Project site from the repository root with a top-level `index.html`.
2. Project site from a dedicated `docs/` folder if you want the published site to be documentation-first.
3. GitHub Actions deployment to a `gh-pages` branch once the project has a build step.

For this project, option 1 is the cleanest if you later add the browser game shell at the repository root.

## Free account support

GitHub Pages is available on GitHub Free for public repositories. For private repositories, Pages requires a paid GitHub plan.

If you are using a free account, keep the repository public before enabling Pages.

## Static site requirements

Before publishing, make sure the site has:

- A top-level entry file such as `index.html`.
- Relative asset paths that work when the site is served from `/<repository-name>/`.
- No server-only dependencies.

If you later add a bundler, remember that a GitHub Pages project site is served from a subpath, so any asset URLs or router base paths must account for that.

## Branch-based deployment

Use this flow if you want to publish directly from a branch:

1. Add the static site files to the branch you want to publish.
2. Open the repository settings on GitHub.
3. Go to Pages.
4. Choose the publishing source, such as the root of `main` or a `docs/` folder.
5. Save the settings and wait for the site to build.

This approach is the simplest when the repository already contains a plain static site.

## GitHub Actions deployment

Use a workflow if you want a build step.

The workflow should:

1. Check out the repository.
2. Build or assemble the static site.
3. Upload the generated site as an artifact or publish it to the `gh-pages` branch.

If you use a build tool later, make sure the final artifact includes the entry file at its top level.

## Project-specific note

This repository is still documentation-first. Until the browser entry point exists, the best use of GitHub Pages is to publish the documentation site rather than the game itself.

When the runtime shell is added, revisit this guide and point Pages at the built output or the repository root.