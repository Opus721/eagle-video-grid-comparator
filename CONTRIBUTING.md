# Contributing

Thanks for helping improve Video Grid Comparator. Bug reports, small fixes, and focused improvements are all welcome.

## Reporting a problem

Open an [issue](https://github.com/Opus721/eagle-video-grid-comparator/issues/new/choose) and include:

- Eagle version and operating system;
- plugin version (shown in Eagle's plugin list);
- how many videos were selected, their format and codec;
- the steps that lead to the problem.

Please do not attach private media unless it is needed to reproduce the issue. Security problems go through the [security policy](SECURITY.md), not public issues.

## Proposing a change

For anything larger than a small fix, open an issue first so the idea can be discussed before you spend time on it. The plugin deliberately does one thing: compare 2–4 local videos in sync.

1. Fork the repository and create a focused branch from `main`.
2. Read [architecture](docs/ARCHITECTURE.md) and [development](docs/DEVELOPMENT.md) notes.
3. Make the smallest coherent change.
4. Run `npm run check`.
5. Test the affected behavior in Eagle with 2 and 4 videos (see the manual test matrix in the development notes).
6. Update `CHANGELOG.md` under a new version heading when behavior changes.
7. Open a pull request and fill in the template, stating what you did not test.

## Ground rules

- No runtime dependencies, frameworks, or build step: Eagle loads the repository files directly.
- Keep the code compatible with Eagle's Chromium 107 / Node.js 16 runtime.
- No network access, telemetry, or uploads, and no writes inside an Eagle library.
- Never change the plugin ID in `manifest.json`.
- Keep the plugin on demand: no visible window and no active video decoders while Eagle starts.
- Only files listed in `scripts/runtime-files.mjs` go into the package.
- Do not commit generated archives (`artifacts/`), media, or machine-specific paths.

## Versioning

The project follows [Semantic Versioning](https://semver.org). `manifest.json` holds the version; `package.json` and the `?v=` asset queries in both HTML files must match it, and `npm run check` enforces that.

- Patch: fixes and small compatibility changes.
- Minor: new user-visible behavior or a substantial UI change.
- Major: deliberate breaking behavior.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
