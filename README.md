# Cipher Sentry

This repository contains two Vite-based React apps:

- `cipher-landing` — landing page app
- `cipher-sentry` — main Solana sentry dashboard

## GitHub Pages deployment

A GitHub Actions workflow is configured at `.github/workflows/deploy-github-pages.yml`.

It builds both apps and publishes them to the `gh-pages` branch under separate subpaths:

- `/cipher-landing/`
- `/cipher-sentry/`

A simple root landing page is also generated at `index.html` to link both apps.

> Important: GitHub Pages must be configured to publish from the `gh-pages` branch, folder `/`.

A second workflow is available at `.github/workflows/deploy-github-pages-docs.yml`.
It builds the same apps and publishes the outputs to `main/docs/`.
If your repository is configured to publish GitHub Pages from `main /docs`, this workflow provides an alternate deployment path.

This workflow runs manually via Actions (`workflow_dispatch`) so it does not commit `docs/` on every `main` push.

## Local development

Each app can be run independently:

- `cd cipher-landing && npm install && npm run dev`
- `cd cipher-sentry && npm install && npm run dev`

## Notes

- Both apps use `BASE_PATH` when building for GitHub Pages.
- `tsconfig.base.json` is present at the repository root for shared TypeScript config.
- The workflow currently deploys to the `gh-pages` branch using `peaceiris/actions-gh-pages@v4`.
