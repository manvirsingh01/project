# Repository Guidelines

## Project Structure

`core/index.js` is the shared estimator used by both interfaces; `core/deviceCatalog.js` builds matrix and PDF data. Benchmark data and its source index live in `benchmark-data/`. The browser app is under `web/`; its States dashboard and combined Method & sources page are in `web/index.html` and `web/app.js`. The Node CLI is `cli/pqc-iot-sim.js`. Numbered Markdown files define feature behavior. Keep algorithm values in the data module rather than duplicating them in either interface.

## Development Commands

- `npm run start` serves the static app at `http://localhost:8001/` using Python 3; the root page redirects to `web/`.
- `node cli/pqc-iot-sim.js help` lists CLI commands.
- `npm run cli -- simulate --device rp2040 --algo ml-kem-512` runs a projection.
- `node cli/pqc-iot-sim.js states --algo ml-kem --device-type catalog` prints a filtered matrix; add `--json` or `--export pdf --out states.pdf` for exports.
- `node cli/pqc-iot-sim.js export --out pqc-iot-data.csv` writes the flat operation dataset (CSV by default); use `--format json` or `--format pdf --numbers-only` for other formats.
- `npm run check` checks JavaScript syntax in the shared core, CLI, and browser code.
- `npm test` runs the data, engine, CLI, and browser-surface test suites.
- `npm run test:data`, `npm run test:core`, and `npm run test:cli` run focused suites.

The project uses native ES modules and has no npm runtime dependencies. Run the web app from a local HTTP server so module imports work in browsers.

## Style & Data Conventions

Use two spaces for JavaScript indentation, semicolons, descriptive camelCase names, and small pure functions in the shared core. Keep browser DOM and CLI formatting out of core calculations. Use kebab-case IDs such as `ml-kem-512`. Preserve `null` for values missing from the supplied notes; do not silently invent benchmark measurements. Keep assumptions and provenance visible in the data and results.

## Testing & Validation

Tests use Node's built-in `node:test` and assertions. Keep core calculations pure so both front ends share the same tested functions. Browser integration coverage runs when Playwright is installed; otherwise that test is reported as skipped. Before submitting a change, run `npm test` and `npm run check`.

## Commits & Pull Requests

Use short imperative commit subjects, such as `Add network loss projection`. Pull requests should summarize the user-visible behavior, explain changes to benchmark assumptions, list validation performed, and include a screenshot for significant browser UI changes.

## Security & Configuration

The simulator does not perform cryptographic operations and stores browser custom profiles in local storage. CLI custom profiles are written to `~/.pqc-iot-sim/custom-devices.json`. Do not add secrets or treat modeled figures as measured hardware results.
