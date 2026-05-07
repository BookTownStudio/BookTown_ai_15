import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');

if (!existsSync(DIST_DIR)) {
  console.error('[production-truth] dist directory does not exist. Run the production build first.');
  process.exit(1);
}

const forbiddenFileNamePattern = /(?:^|[-_.])(mock|mocks|fixture|fixtures)(?:[-_.]|$)/i;
const forbiddenContentPattern = /(?:data\/mocks|dev\/fixtures|test\/fixtures|storybook\/fixtures|mockBookFlowData|mockForYouFlowData|mockFallbackBookIds|mockAgents)/;
const checkedExtensions = new Set(['.js', '.mjs', '.html']);

function collectFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      collectFiles(absolutePath, files);
    } else {
      files.push(absolutePath);
    }
  }
  return files;
}

const violations = [];

for (const filePath of collectFiles(DIST_DIR)) {
  const relativePath = path.relative(ROOT, filePath);
  if (forbiddenFileNamePattern.test(path.basename(filePath))) {
    violations.push(`${relativePath} (forbidden bundle name)`);
    continue;
  }

  if (!checkedExtensions.has(path.extname(filePath))) continue;
  const source = readFileSync(filePath, 'utf8');
  if (forbiddenContentPattern.test(source)) {
    violations.push(`${relativePath} (forbidden fixture symbol or import)`);
  }
}

if (violations.length > 0) {
  console.error('[production-truth] Production bundle fixture contamination detected:');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('[production-truth] Production bundle mock/fixture contamination check passed.');
