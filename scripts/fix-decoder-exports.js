/**
 * Postinstall script — fix "exports" field order in decoder packages.
 *
 * Both polish-vehicle-registration-certificate-decoder and nrv2e-decompress
 * have {"default": ..., "typings": ...} which webpack rejects because
 * "default" must be the last condition. This script rewrites them to
 * {"types": ..., "default": ...}.
 */
const fs = require("fs");
const path = require("path");

const packages = [
  "polish-vehicle-registration-certificate-decoder",
  "nrv2e-decompress",
];

for (const pkg of packages) {
  const pkgPath = path.join(__dirname, "..", "node_modules", pkg, "package.json");
  if (!fs.existsSync(pkgPath)) continue;

  const json = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const dot = json.exports?.["."];
  if (!dot) continue;

  // Check if "default" comes before other keys (needs fixing)
  const keys = Object.keys(dot);
  if (keys[0] === "default" && keys.length > 1) {
    const defaultVal = dot.default;
    const typingsVal = dot.typings;
    json.exports["."] = {};
    if (typingsVal) json.exports["."].types = typingsVal;
    json.exports["."].default = defaultVal;
    fs.writeFileSync(pkgPath, JSON.stringify(json, null, 2) + "\n");
    console.log(`[fix-decoder-exports] Fixed ${pkg}`);
  }
}
