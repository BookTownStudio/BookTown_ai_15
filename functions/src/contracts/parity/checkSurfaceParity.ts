import fs from "fs";
import path from "path";
import { apiContracts } from "../shared/apiContracts";

const indexPath = path.resolve(__dirname, "..", "..", "index.ts");

function readRoutedSources(entryPath: string, visited = new Set<string>()): string[] {
  const normalizedPath = path.normalize(entryPath);
  if (visited.has(normalizedPath)) return [];
  visited.add(normalizedPath);

  const source = fs.readFileSync(normalizedPath, "utf8");
  const sources = [source];
  const baseDir = path.dirname(normalizedPath);
  const reexports = Array.from(source.matchAll(/export\s+\*\s+from\s+["'](.+)["']/g));

  for (const match of reexports) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const resolved = path.resolve(baseDir, specifier);
    const candidates = [
      `${resolved}.ts`,
      path.join(resolved, "index.ts"),
    ];
    const target = candidates.find((candidate) => fs.existsSync(candidate));
    if (target) {
      sources.push(...readRoutedSources(target, visited));
    }
  }

  return sources;
}

const routedSource = readRoutedSources(indexPath).join("\n");

const KNOWN_UNIMPLEMENTED_ENDPOINTS = new Set<string>([
  "adminRepairCanonicalSeedMetadata",
]);

const wrappedCallableKeys = Array.from(
  routedSource.matchAll(/wrapCallableV(?:1|2)\(\s*"([A-Za-z0-9_]+)"/g)
).map((m) => m[1]);

const contractCallableKeys = Object.keys(apiContracts.callable).filter(
  (k) => !KNOWN_UNIMPLEMENTED_ENDPOINTS.has(k)
);

const missingWrapped = contractCallableKeys.filter(
  (k) => !wrappedCallableKeys.includes(k)
);
const missingContracts = wrappedCallableKeys.filter(
  (k) => !contractCallableKeys.includes(k)
);

const hasWrappedRest = /wrapRestExport\(/.test(routedSource);

const errors: string[] = [];

if (missingWrapped.length > 0) {
  errors.push(
    `Missing wrapped callable exports for contract keys: ${missingWrapped.join(", ")}`
  );
}

if (missingContracts.length > 0) {
  errors.push(
    `Wrapped callable exports missing contract entries: ${missingContracts.join(", ")}`
  );
}

if (!hasWrappedRest) {
  errors.push("REST export is not routed through wrapRestExport.");
}

if (errors.length > 0) {
  console.error("[parity] FAILED");
  for (const err of errors) {
    console.error(` - ${err}`);
  }
  process.exit(1);
}

console.log("[parity] OK");
