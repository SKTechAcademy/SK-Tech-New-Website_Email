import fs from "node:fs/promises";
import path from "node:path";

const sourceDir = path.resolve("apps-script");
const outputDir = path.resolve("artifacts", "apps-script-deploy");
const order = [
  "Config.gs",
  "Core.gs",
  "Schema.gs",
  "Data.gs",
  "Validation.gs",
  "Security.gs",
  "Uploads.gs",
  "Candidates.gs",
  "Availability.gs",
  "Dashboard.gs",
  "Bookings.gs",
  "EmailQueue.gs",
  "Admin.gs",
  "Setup.gs",
  "SelfTest.gs",
  "Code.gs",
];

await fs.mkdir(outputDir, { recursive: true });
const sections = [];
for (const file of order) {
  const source = await fs.readFile(path.join(sourceDir, file), "utf8");
  sections.push(`// ---- ${file} ----\n${source.trim()}\n`);
}
const backendBundle = `${sections.join("\n")}\n`;
// Parse the exact concatenated deployment artifact, not only the individual
// source files. This catches missing separators or cross-file syntax errors
// before anyone pastes the bundle into Apps Script.
new Function(backendBundle);
await fs.writeFile(path.join(outputDir, "Backend.txt"), backendBundle, "utf8");
for (const file of ["AdminSidebar.html", "UploadWidget.html", "appsscript.json"]) {
  await fs.copyFile(path.join(sourceDir, file), path.join(outputDir, `${file}.txt`));
}
console.log(`Apps Script deployment bundle written to ${outputDir}`);
