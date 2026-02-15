import fs from "fs";
import path from "path";
import { apiContracts } from "../shared/apiContracts";

const indexPath = path.resolve(__dirname, "..", "..", "index.ts");
const indexSource = fs.readFileSync(indexPath, "utf8");

const KNOWN_UNIMPLEMENTED_ENDPOINTS = new Set([
  "logAttachmentEvents",
]);

const wrappedCallableKeys = Array.from(
  indexSource.matchAll(/wrapCallableV(?:1|2)\(\s*"([A-Za-z0-9_]+)"/g)
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

const hasWrappedRest = /wrapRestExport\(/.test(indexSource);

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
