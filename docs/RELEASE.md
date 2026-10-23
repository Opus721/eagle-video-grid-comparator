# Release process

`manifest.json` is the release source of truth. Tags use the same version with a `v` prefix.

## Prepare

1. Choose the SemVer bump.
2. Update `manifest.json` and `package.json`.
3. Update every runtime asset query string (`?v=<version>`).
4. Add the release entry to `CHANGELOG.md`.
5. Run:

   ```bash
   npm ci
   npm run check
   npm run package
   ```

6. Install or sync the candidate into Eagle and complete the manual matrix in `docs/DEVELOPMENT.md`.

## Publish

Merge the release change to `main`, then create and push the matching tag:

```bash
git tag v1.3.0
git push origin v1.3.0
```

The release workflow validates the tag against the manifest, rebuilds the archive from the runtime allowlist, and creates a GitHub Release with the `.eagleplugin` attached.

If the workflow cannot run, create the release by hand from the same tag on GitHub and attach the archive that `npm run package` built from that tagged commit.

## Invariants

- Never change the permanent plugin ID.
- Never build a release from a synced Eagle copy; build from the repository.
- Never attach an archive that contains repository-only files.
- Keep `artifacts/` untracked.
- A release is incomplete until the GitHub workflow and attached archive are verified.

## Eagle Plugin Center

The listing copy, covers, and submission notes live in [`store/`](../store/listing.md).

1. Build the release archive with `npm run package` (or download it from the GitHub Release).
2. Install that `.eagleplugin` in Eagle, then run the manual matrix from `docs/DEVELOPMENT.md` against the installed copy, without the repository folder imported.
3. In the Eagle Plugin Center choose **Submit → Submit Plugin**, upload the archive, and fill in the form from `store/listing.md`: name, short description, introduction, changelog, icon, one cover per locale, and a support contact.
4. Wait for the automated scan and the human review. If changes are required, fix them, bump the version, rebuild, and submit the new archive; never edit an existing archive.

If the scan rejects the archive format, pack the installed copy with Eagle itself (**Plugin panel → right-click → Pack Plugin**) and submit that file. Never pack the repository folder, which also contains development files.
