import fs from "node:fs";

const meta = JSON.parse(fs.readFileSync("build-meta.json", "utf8"));
if (!meta.buildId) throw new Error("build-meta.json missing buildId");

const files = ["index.html", "service-worker.js", "manifest.json", "app.js"];
const bad = [];

for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  if (s.includes("2026-") && f !== "build-meta.json") {
    // Heuristic: forbid date-like build strings being hardcoded
    bad.push(`${f}: contains a hardcoded build-like string`);
  }
  if (f === "index.html" && /window\.BUILD_ID\s*=/.test(s)) bad.push("index.html: should not inline BUILD_ID");
  if (f === "service-worker.js" && /const\s+BUILD_ID\s*=/.test(s)) bad.push("service-worker.js: should not hardcode BUILD_ID");
  if (f === "manifest.json" && /\"start_url\"\s*:\s*\"\.\/\?v=/.test(s)) bad.push("manifest.json: start_url should not embed v");
}
if (bad.length) {
  console.error(bad.join("\n"));
  process.exit(1);
}
console.log("Version check OK:", meta.buildId);
