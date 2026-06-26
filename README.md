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

## Local development

Each app can be run independently:

- `cd cipher-landing && npm install && npm run dev`
- `cd cipher-sentry && npm install && npm run dev`

## Notes

- Both apps use `BASE_PATH` when building for GitHub Pages.
- `tsconfig.base.json` is present at the repository root for shared TypeScript config.
- The workflow currently deploys to the `gh-pages` branch using `peaceiris/actions-gh-pages@v4`.
