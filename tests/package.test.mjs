import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPluginArchive } from "../scripts/package.mjs";
import { runtimeFiles } from "../scripts/runtime-files.mjs";
import { readZipEntries } from "../scripts/zip.mjs";

const sourceManifest = JSON.parse(
  fs.readFileSync(new URL("../manifest.json", import.meta.url), "utf8"),
);

assert.equal(new Set(runtimeFiles).size, runtimeFiles.length);
for (const relativePath of runtimeFiles) {
  assert.equal(path.isAbsolute(relativePath), false);
  assert.equal(relativePath.includes("\\"), false);
  assert.equal(relativePath.split("/").includes(".."), false);
}

const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "video-grid-package-"));
try {
  const firstPath = buildPluginArchive(path.join(fixtureDirectory, "first.eagleplugin"));
  const secondPath = buildPluginArchive(path.join(fixtureDirectory, "second.eagleplugin"));
  const first = fs.readFileSync(firstPath);
  const second = fs.readFileSync(secondPath);
  const entries = readZipEntries(first);

  assert.deepEqual([...entries.keys()], runtimeFiles);
  assert.equal(entries.has("README.md"), false);
  assert.equal(entries.has("logo.svg"), false);

  const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  assert.equal(manifest.id, "3c8cd4a3-b779-4c25-9436-6f29963fcd34");
  assert.equal(manifest.version, sourceManifest.version);
  assert.equal(manifest.logo, "/logo.png");

  const firstHash = crypto.createHash("sha256").update(first).digest("hex");
  const secondHash = crypto.createHash("sha256").update(second).digest("hex");
  assert.equal(firstHash, secondHash, "Archive output must be deterministic");
  assert.ok(first.length > 1000, "Archive is unexpectedly small");
  console.log("package.test.mjs: OK");
} finally {
  fs.rmSync(fixtureDirectory, { recursive: true, force: true });
}
