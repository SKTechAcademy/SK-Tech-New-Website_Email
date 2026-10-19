import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["index.html", "src", "public"];
const blocked = [
  /docs\.google\.com\/forms/i,
  /forms\.gle\//i,
];
const checkedExtensions = new Set([".html", ".ts", ".js", ".css", ".json", ".md"]);
const failures = [];

async function inspect(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (entries) {
    await Promise.all(entries.map((entry) => inspect(join(path, entry.name))));
    return;
  }

  if (!checkedExtensions.has(extname(path))) return;
  const content = await readFile(path, "utf8");
  for (const rule of blocked) {
    if (rule.test(content)) failures.push(`${path}: ${rule}`);
  }
}

await Promise.all(roots.map(inspect));

if (failures.length) {
  console.error("External Google Form URLs are not allowed:\n" + failures.join("\n"));
  process.exit(1);
}

console.log("External form scan passed.");
