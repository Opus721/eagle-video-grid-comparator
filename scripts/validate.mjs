import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { runtimeFiles } from "./runtime-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const expectedPluginId = "3c8cd4a3-b779-4c25-9436-6f29963fcd34";
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const manifest = JSON.parse(readText("manifest.json"));
const packageJson = JSON.parse(readText("package.json"));

if (manifest.id !== expectedPluginId) {
  throw new Error(`Unexpected plugin ID: ${manifest.id}`);
}

if (!semverPattern.test(manifest.version)) {
  throw new Error(`Manifest version is not valid SemVer: ${manifest.version}`);
}

if (manifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: manifest=${manifest.version}, package=${packageJson.version}`);
}

if (packageJson.license !== "MIT" || !/^MIT License\b/.test(readText("LICENSE"))) {
  throw new Error("package.json and LICENSE must both declare the MIT license.");
}

if (manifest.devTools !== false) {
  throw new Error("Production releases must keep devTools disabled.");
}

if (manifest.main?.serviceMode !== false || manifest.main?.show !== false || manifest.main?.runAfterInstall !== false) {
  throw new Error("The comparator must remain hidden and on-demand at Eagle startup.");
}

if (!Array.isArray(manifest.keywords) || manifest.keywords.length > 6 || manifest.keywords.some((keyword) => !/^[A-Za-z0-9-]+$/.test(keyword))) {
  throw new Error("Manifest keywords must contain at most six single-word values.");
}

const inspectors = Object.values(manifest.preview || {})
  .map((preview) => preview?.inspector)
  .filter(Boolean);
if (inspectors.length === 0 || inspectors.some((inspector) => inspector.multiSelect !== true)) {
  throw new Error("A multi-select Eagle inspector entry is required.");
}

if (new Set(runtimeFiles).size !== runtimeFiles.length) {
  throw new Error("The runtime allowlist contains duplicate entries.");
}

for (const relativePath of runtimeFiles) {
  if (path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    throw new Error(`Unsafe runtime path: ${relativePath}`);
  }
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing runtime file: ${relativePath}`);
  }
  const stats = fs.lstatSync(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Runtime entry must be a regular file: ${relativePath}`);
  }
}

const logoPath = String(manifest.logo || "").replace(/^[/\\]+/, "");
if (!/\.(?:png|jpe?g|webp)$/i.test(logoPath) || !runtimeFiles.includes(logoPath)) {
  throw new Error(`Manifest logo must be a packaged PNG, JPG, or WebP file: ${manifest.logo}`);
}

if (!runtimeFiles.includes(manifest.main?.url)) {
  throw new Error(`Main entry is not packaged: ${manifest.main?.url}`);
}
for (const inspector of inspectors) {
  if (!runtimeFiles.includes(inspector.path)) {
    throw new Error(`Inspector entry is not packaged: ${inspector.path}`);
  }
}

if (logoPath.toLowerCase().endsWith(".png")) {
  const logo = fs.readFileSync(path.join(root, logoPath));
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!logo.subarray(0, 8).equals(pngSignature)) {
    throw new Error("logo.png has an invalid PNG signature.");
  }
  if (logo.length < 24 || logo.readUInt32BE(16) !== 256 || logo.readUInt32BE(20) !== 256) {
    throw new Error("logo.png must be exactly 256x256 pixels.");
  }
}

for (const relativePath of ["js/plugin.js", "inspector/inspector.js"]) {
  const source = readText(relativePath);
  new vm.Script(source, { filename: relativePath });
  if (!source.includes(expectedPluginId)) {
    throw new Error(`Stable plugin ID is missing from ${relativePath}`);
  }
}

for (const relativePath of ["index.html", "inspector/index.html"]) {
  const html = readText(relativePath);
  const versions = Array.from(html.matchAll(/\?v=([^"']+)/g), (match) => match[1]);
  if (versions.length === 0 || versions.some((version) => version !== manifest.version)) {
    throw new Error(`Asset query versions in ${relativePath} must equal ${manifest.version}`);
  }
}

for (const relativePath of runtimeFiles.filter((file) => /\.(?:html|css|js|json)$/i.test(file))) {
  const source = readText(relativePath);
  if (/[A-Za-z]:\\(?:Users|Documents|Downloads|Desktop)\\/i.test(source)) {
    throw new Error(`Machine-specific Windows path found in ${relativePath}`);
  }
  const urls = source.match(/https?:\/\/[^\s"'`<>]+/gi) || [];
  for (const value of urls) {
    const url = new URL(value);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      throw new Error(`Unexpected remote URL in ${relativePath}: ${value}`);
    }
  }
}

console.log(`Video Grid Comparator ${manifest.version}: validation OK (${runtimeFiles.length} runtime files)`);
