import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./runtime-files.mjs";
import { createZip } from "./zip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildPluginArchive(outputPath) {
  const entries = runtimeFiles.map((relativePath) => ({
    name: relativePath,
    data: fs.readFileSync(path.join(root, relativePath))
  }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, createZip(entries));
  return outputPath;
}

function defaultOutputPath() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  return path.join(root, "artifacts", `${manifest.name} ${manifest.version}.eagleplugin`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const outputPath = buildPluginArchive(process.argv[2] ? path.resolve(process.argv[2]) : defaultOutputPath());
  console.log(outputPath);
}
