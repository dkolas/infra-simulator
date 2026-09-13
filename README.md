# Infra Simulator

A visual, interactive simulator for a queue-and-workers backend of the kind used to run an agent harness. See `docs/concept.md` for the model and `docs/plans/` for the implementation plan.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests
npm run build      # static output in dist/
```

Add `?autostart` to the URL to start the simulation on load.

## Scripts

- `npx vite-node scripts/scenario.ts` runs the default scenario headlessly and prints a table. Set `SEED` or `OVERRIDE` (JSON for the workers section) to vary it.
- `node scripts/shot.mjs <url> <out.png> [waitMs] [js ...]` drives headless Chrome for screenshots and checks.

## Deploy

Vercel detects the Vite preset automatically: build command `npm run build`, output `dist`. Node is pinned in `.nvmrc` and `package.json`. There is no backend and no routing, so no rewrites are needed.
