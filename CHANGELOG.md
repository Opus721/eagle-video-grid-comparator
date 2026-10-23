# Changelog

All notable changes to this plugin are recorded here. Versions follow Semantic Versioning.

## [1.4.0] - 2026-10-23

First public release, prepared for the Eagle Plugin Center.

### Changed

- Licensed under MIT; the package now includes the license text.
- Stylesheets consolidated into a single layer with no visual change.
- Removed development-only hooks and leftover background-service code paths.
- README rewritten for users, with a privacy section and the full control list.

## [1.3.1] - 2026-08-09

### Fixed

- Closing the comparator now destroys its renderer when Eagle allows it and otherwise detaches every video source before hiding.
- Pending media loads, seek listeners, and playback timers are cancelled immediately on close or hide.

## [1.3.0] - 2026-08-09

### Added

- Flat purple visual system shared by the main window and inspector.
- New comparator icon and consistent transport glyphs.
- Continuous integration and reproducible release packaging.

### Changed

- The plugin now runs strictly on demand instead of as a background service.
- Timeline scrubbing pauses playback, coalesces preview seeks, and performs one exact synchronized seek on release.

### Fixed

- Inspector launches now use Eagle's plugin manager with a local bridge fallback.
- Escape close and subsequent reopen no longer leave a stale visible or background window.
- Three- and four-video backward scrubbing no longer floods every decoder with overlapping seeks.

[1.4.0]: https://github.com/Opus721/eagle-video-grid-comparator/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/Opus721/eagle-video-grid-comparator/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/Opus721/eagle-video-grid-comparator/releases/tag/v1.3.0
