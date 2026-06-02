import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const SCAN_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx"]);
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "functions/node_modules",
  "dist",
  "build",
  "coverage",
  "functions/lib",
  ".vite",
]);

const APPROVED_SAFETY_WRAPPER_PATHS = new Set([
  "functions/src/core/firestoreSafety/FirestoreScan.ts",
]);

const LEGACY_BASELINE_PATHS = new Set([
  "app/drawer/admin.tsx",
  "functions/scripts",
  "scripts",
  "functions/src/admin/backfillStats.ts",
  "functions/src/admin/literaryAuthority.ts",
  "functions/src/library/admin/backfillCanonicalKeys.ts",
  "functions/promoteSuperadmin.cjs",
  "functions/src/deleteWriteProject.ts",
  "functions/src/publishing/loadChunkedProjectManuscript.ts",
]);

const DIRECT_ADMIN_INIT_PATTERN =
  /(?:require\(["']firebase-admin["']\)|from ["']firebase-admin["'])[\s\S]{0,400}(?:initializeApp|admin\.initializeApp)\s*\(/g;

function toRepoPath(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function isIgnored(repoPath) {
  return [...IGNORED_DIRS].some((dir) => repoPath === dir || repoPath.startsWith(`${dir}/`));
}

function isBaseline(repoPath) {
  return [...LEGACY_BASELINE_PATHS].some((entry) => repoPath === entry || repoPath.startsWith(`${entry}/`));
}

function isApprovedWrapper(repoPath) {
  return APPROVED_SAFETY_WRAPPER_PATHS.has(repoPath);
}

function walk(dir, output = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const repoPath = toRepoPath(fullPath);
    if (isIgnored(repoPath)) continue;

    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, output);
      continue;
    }

    if (SCAN_EXTENSIONS.has(path.extname(entry))) {
      output.push(fullPath);
    }
  }
  return output;
}

function lineForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

function findViolations(filePath) {
  const repoPath = toRepoPath(filePath);
  if (isApprovedWrapper(repoPath)) return [];

  const source = readFileSync(filePath, "utf8");
  const violations = [];

  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const isAdminQueryRead =
      line.includes(".get()") &&
      (line.includes(".collection(") || line.includes(".collectionGroup(")) &&
      !line.includes(".doc(") &&
      !line.includes(".limit(") &&
      !line.includes(".count()");

    if (isAdminQueryRead) {
      violations.push({
        id: line.includes(".collectionGroup(")
          ? "admin-collectiongroup-get-without-limit"
          : "admin-collection-get-without-limit",
        repoPath,
        line: index + 1,
        message: line.includes(".collectionGroup(")
          ? "Admin SDK collectionGroup().get() must use FirestoreSafety or an explicit bounded page."
          : "Admin SDK collection().get() must use FirestoreSafety or an explicit bounded page.",
        baseline: isBaseline(repoPath),
      });
    }

    const isClientCollectionQuery =
      line.includes("getDocs(") &&
      line.includes("query(") &&
      line.includes("collection(") &&
      !line.includes("limit(");

    if (isClientCollectionQuery) {
      violations.push({
        id: "web-getdocs-query-without-limit",
        repoPath,
        line: index + 1,
        message: "Client getDocs(query(collection())) must include limit().",
        baseline: isBaseline(repoPath),
      });
    }
  });

  DIRECT_ADMIN_INIT_PATTERN.lastIndex = 0;
  let match;
  while ((match = DIRECT_ADMIN_INIT_PATTERN.exec(source)) !== null) {
    violations.push({
      id: "direct-firebase-admin-script-init",
      repoPath,
      line: lineForIndex(source, match.index),
      message: "Direct firebase-admin script initialization requires production safeguards.",
      baseline: isBaseline(repoPath) || repoPath === "functions/src/firebaseAdmin.ts",
    });
  }

  return violations;
}

const violations = walk(ROOT).flatMap(findViolations);
const newViolations = violations.filter((violation) => !violation.baseline);
const baselineViolations = violations.filter((violation) => violation.baseline);

if (baselineViolations.length > 0) {
  console.log(`Firestore safety baseline contains ${baselineViolations.length} legacy finding(s).`);
  for (const violation of baselineViolations.slice(0, 50)) {
    console.log(`BASELINE ${violation.id} ${violation.repoPath}:${violation.line} - ${violation.message}`);
  }
  if (baselineViolations.length > 50) {
    console.log(`BASELINE output truncated: ${baselineViolations.length - 50} additional finding(s).`);
  }
}

if (newViolations.length > 0) {
  console.error(`Firestore safety check failed with ${newViolations.length} new unsafe finding(s).`);
  for (const violation of newViolations) {
    console.error(`${violation.id} ${violation.repoPath}:${violation.line} - ${violation.message}`);
  }
  process.exit(1);
}

console.log("Firestore safety check passed: no new unsafe Firestore reads outside the approved baseline.");
