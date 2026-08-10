import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["app", "build", "db", "worker", "scripts", "public"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".sh"]);
const ignoredDirectories = new Set(["node_modules", "dist", ".next", ".sites-runtime", "tesseract"]);
const maximumLines = 500;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = (await Promise.all(sourceRoots.map(async (directory) => {
  try { return await collect(join(root, directory)); }
  catch { return []; }
}))).flat();

const oversized = [];
for (const file of files) {
  const lines = (await readFile(file, "utf8")).split(/\r?\n/).length;
  if (lines > maximumLines) oversized.push({ file: relative(root, file), lines });
}

if (oversized.length) {
  for (const item of oversized) console.error(`${item.file}: ${item.lines} lines (maximum ${maximumLines})`);
  process.exitCode = 1;
} else {
  console.log(`Source-size check passed: ${files.length} files are at or below ${maximumLines} lines.`);
}
