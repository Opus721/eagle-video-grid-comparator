# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please report security problems privately through [GitHub's private vulnerability reporting](https://github.com/Opus721/eagle-video-grid-comparator/security/advisories/new), not in a public issue. Include the plugin and Eagle versions and steps to reproduce. Do not include private media, library data, or file paths you would not want shared.

You should get a first response within a week.

## Scope

Video Grid Comparator runs locally. It reads file URLs supplied by Eagle, makes no internet connections, and sends no analytics. Its only HTTP request goes to the local Eagle app on `127.0.0.1` to open the plugin window from the inspector.

Changes must preserve these boundaries:

- no direct edits inside an Eagle library;
- no remote upload or telemetry;
- no secrets in source or logs;
- no execution of content derived from media file names;
- loopback calls limited to the local Eagle application.
