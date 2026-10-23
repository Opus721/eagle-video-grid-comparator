# Architecture

## Runtime shape

Video Grid Comparator combines two Eagle plugin surfaces:

1. An inspector extension that validates the current multi-selection and exposes **Compare**.
2. A normal window plugin that creates the synchronized video grid and transport.

The plugin is deliberately framework-free. Eagle loads the repository's HTML, CSS, and JavaScript directly.

## Open flow

```text
Eagle selection (2–4 videos)
        │
        ▼
Inspector extension ── validates type/count
        │
        ├─ primary: ask Eagle's local plugin manager to open this plugin ID
        └─ fallback: write a short-lived request in the OS temp directory
        │
        ▼
Main window ── reads the live selection through Eagle's item API
        │
        ▼
One <video> element per selected item
```

The main window is not a background service. Eagle creates or reveals it only after a user action. Closing first asks Eagle to destroy the renderer. If the host only hides the window, every video source, decoder, pending media load, seek listener, and playback timer is still released; only the lightweight inspector launch bridge remains alive.

## Synchronization model

- A shared clock represents the desired playback position.
- Every video uses the same playback rate and target time.
- A bounded drift correction runs during normal playback.
- Drift correction is disabled while scrubbing or while a coordinated seek is settling.
- Rapid timeline input is coalesced; release performs a final exact seek.
- If playback was active before scrubbing, it resumes after the final seek.

This avoids overlapping decoder work, which is particularly important for long-GOP H.264 clips in three- and four-video layouts.

## Zoom and pan

Zoom and pan are view transforms only. One normalized transform is applied to every video so the same region can be compared across clips. Media files are never rewritten.

## Data and privacy

The plugin is stateless across sessions except for Eagle's own plugin registration. It stores no project database and makes no network requests; its only HTTP call is the inspector's loopback request to the local Eagle app (`127.0.0.1:41595`).

The only file bridge is a short-lived JSON request under the operating system temp directory. It contains launch coordination data, not media content.

## Compatibility-sensitive surfaces

- Eagle plugin lifecycle events: `onPluginCreate`, `onPluginRun`, `onPluginShow`, `onPluginHide`, `onPluginBeforeExit`.
- Inspector multi-selection behavior.
- The local Eagle plugin-manager opening path used by the inspector.
- Chromium codec support.

Treat the inspector launch bridge as compatibility-sensitive. Keep the documented fallback until the primary opening path has been verified across supported Eagle versions.

## Runtime allowlist

Only files listed in `scripts/runtime-files.mjs` are packaged. Repository documentation, tests, SVG design sources, and GitHub metadata never enter the `.eagleplugin` archive.
