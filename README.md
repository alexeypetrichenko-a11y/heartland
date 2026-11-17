# Heartland

Mobile-first geopolitical strategy prototype.

Heartland opens directly on an interactive, north-up 3D Earth. Geographic assets
load progressively. Tap a country on the globe or flat map to inspect its name,
identifier and geographic subregion. Real-country playability is undecided.
[Country inspection and iPhone checks](docs/geography/COUNTRY_SELECTION.md).
Choose **Fictional game** to open the existing three-country scenario, explicitly
select a country and start playing. **Return to globe** and **Resume game** retain
the game, drafts and map state in the current page. Reloading opens the globe and
resets the in-memory fictional game; the Terrain display preference is retained
when browser storage is available.

Built with React, TypeScript and Vite, with iPhone safe-area support. Offline/PWA
installation and real-world country selection are future features. See
[globe entry and iPhone checks](docs/geography/HOME.md) and [implementation status](STATUS.md).

## Local development

Use Node.js 22.12+ (22.x) or 24+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173/heartland/).

## Production build

```sh
npm run build
npm run preview
```

The build checks TypeScript and writes the production files to `dist/`.
Preview serves that build locally (normally http://localhost:4173/heartland/).
For repeatable installs from the committed lockfile, use `npm ci`.

## GitHub Pages deployment

The application is hosted at https://alexeypetrichenko-a11y.github.io/heartland/.
Vite uses `/heartland/` as its base path so built assets load from this repository's
GitHub Pages URL.

One-time repository setup:

1. Open **Settings → Pages → Build and deployment** and set **Source** to
   **GitHub Actions**.
2. Ensure GitHub Actions is enabled under **Settings → Actions → General** and
   repository policy allows the official `actions/*` actions used by the workflow.
3. If the `github-pages` environment has deployment protection rules, allow `main`
   and approve deployments when required.

After the deployment workflow is merged, every push to `main` runs
`.github/workflows/deploy.yml`. It uses Node.js 24, installs the locked dependencies
with `npm ci`, runs `npm run build`, uploads `dist/` with
`actions/upload-pages-artifact`, and publishes it with `actions/deploy-pages`.
No personal access token or custom deployment secret is needed; the workflow uses
`GITHUB_TOKEN` with `contents: read`, `pages: write`, and `id-token: write` permissions.

Check the **Actions** tab for the deployment result and published URL. The workflow
can also be started manually with **Run workflow** on `main`. Pull request branches
do not deploy. To verify the build locally before pushing:

```sh
npm ci
npm run build
npm run preview
```

Open http://localhost:4173/heartland/ to check the production build locally.

## Structure

- `src/main.tsx`: React entry point and global styles.
- `src/app/App.tsx`: globe-first entry and retained fictional-game UI state.
- `src/ui/`: presentational components and responsive styles.
- `src/game/`: existing deterministic fictional simulation, unchanged by globe entry.
- `src/geography/`: independent geographic data and camera/rendering helpers.

The globe and fictional game share navigation, while geographic presentation and
simulation rules remain separate. Pull-request previews can differ from production
GitHub Pages until the owner approves a merge.
