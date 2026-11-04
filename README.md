# Heartland

Offline-first geopolitical strategy game.

This initial React, TypeScript and Vite application displays the Heartland title
and “Geopolitical Strategy Game” subtitle in a responsive layout with iPhone
safe-area support. Game features are not implemented yet.

## Local development

Use Node.js 22.12+ (22.x) or 24+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).

## Production build

```sh
npm run build
npm run preview
```

The build checks TypeScript and writes the production files to `dist/`.
Preview serves that build locally (normally http://localhost:4173).
For repeatable installs from the committed lockfile, use `npm ci`.

## Structure

- `src/main.tsx`: React entry point and global styles.
- `src/app/App.tsx`: application composition; future application logic belongs here.
- `src/ui/`: presentational components and responsive styles.

There is no gameplay logic at this stage. UI is kept separate from application
composition so logic can be added without coupling it to presentation.
