import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(repoRoot, "manifest.json"), "utf8"),
);
const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
const expected = `v${manifest.version}`;

if (tag !== expected) {
  process.stderr.write(`Release tag ${tag || "<missing>"} must equal ${expected}.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Release tag verified: ${tag}.\n`);
}
