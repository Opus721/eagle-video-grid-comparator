# Development

## Prerequisites

- Eagle desktop application
- Node.js 16+ (`16` is the Eagle runtime compatibility floor)
- Git
- PowerShell for the optional Windows sync helper

The plugin itself has no runtime or npm dependencies.

## Setup

```bash
npm ci
npm run check
```

In Eagle, open **Plugin → Developer Options → Import Local Project** and choose the repository root.

Eagle may need a restart when `manifest.json` inspector registration changes. Ordinary HTML, CSS, and JavaScript changes can be picked up by reloading the plugin project.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run validate` | Validate manifest, version parity, runtime files, paths, URLs, and JS syntax |
| `npm test` | Run zero-dependency Node tests |
| `npm run check` | Run validation and tests |
| `npm run package` | Build a reproducible `.eagleplugin` under `artifacts/` |
| `npm run sync:eagle` | Copy runtime files into a local Eagle plugin project (Windows, PowerShell) |

## Manual test matrix

Before releasing behavior changes, verify:

1. Select 2 MP4/H.264 videos and open from the inspector.
2. Repeat with 4 videos.
3. Play, pause, click a tile, and press Space.
4. Scrub repeatedly forward and backward while paused.
5. Scrub while playing and confirm playback resumes after release.
6. Change speed, loop state, and audio source.
7. Zoom around a recognizable detail and drag the view.
8. Press `0` and confirm every tile resets together.
9. Press Escape, reopen from the inspector, and confirm no stale window appears.
10. Restart Eagle and confirm the comparator does not open by itself.

## Performance rules

- Do not assign `currentTime` to every video for every raw `input` event.
- Do not run drift correction during an in-flight coordinated seek.
- Avoid new per-frame DOM allocation.
- Clean up media sources and pending timers when the window is hidden or the plugin exits.

## Syncing into a local Eagle project

`npm run sync:eagle` copies the runtime allowlist into `../dist/Video Grid Comparator` by default. Pass another folder with:

```powershell
powershell -NoProfile -File scripts/sync-eagle.ps1 -Destination "<folder>"
```

The helper never deletes files in the destination. Edit this repository first, run `npm run check`, then sync.

## Previewing outside Eagle

`index.html` and `inspector/index.html` also open in a plain Chromium browser. Without the Eagle API they read `window.__VIDEO_GRID_PREVIEW_ITEMS__`, an array of `{ name, ext, fileURL }` objects, which is useful for layout work and screenshots.
