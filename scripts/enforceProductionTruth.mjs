import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const RUNTIME_ROOTS = [
  'App.tsx',
  'app',
  'components',
  'lib',
  'services',
  'store',
  'functions/src',
];

const ALLOWED_TEST_SEGMENTS = new Set([
  '__tests__',
  'test',
  'tests',
]);

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"][^'"]*data\/mocks(?:\.ts)?['"]/,
  /from\s+['"][^'"]*(?:dev|test|storybook)\/fixtures\//,
  /import\s*\(\s*['"][^'"]*data\/mocks(?:\.ts)?['"]\s*\)/,
  /import\s*\(\s*['"][^'"]*(?:dev|test|storybook)\/fixtures\//,
  /require\s*\(\s*['"][^'"]*data\/mocks(?:\.ts)?['"]\s*\)/,
  /require\s*\(\s*['"][^'"]*(?:dev|test|storybook)\/fixtures\//,
];

function shouldSkip(filePath) {
  const segments = filePath.split(path.sep);
  if (segments.some((segment) => ALLOWED_TEST_SEGMENTS.has(segment))) return true;
  if (filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')) return true;
  if (filePath.endsWith('.spec.ts') || filePath.endsWith('.spec.tsx')) return true;
  return false;
}

function collectFiles(targetPath, files = []) {
  const absolutePath = path.join(ROOT, targetPath);
  const stats = statSync(absolutePath, { throwIfNoEntry: false });
  if (!stats) return files;

  if (stats.isFile()) {
    if (SOURCE_EXTENSIONS.has(path.extname(absolutePath))) files.push(absolutePath);
    return files;
  }

  for (const entry of readdirSync(absolutePath)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'lib') continue;
    collectFiles(path.join(targetPath, entry), files);
  }

  return files;
}

const violations = [];

for (const runtimeRoot of RUNTIME_ROOTS) {
  for (const filePath of collectFiles(runtimeRoot)) {
    const relativePath = path.relative(ROOT, filePath);
    if (shouldSkip(relativePath)) continue;

    const source = readFileSync(filePath, 'utf8');
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(relativePath);
        break;
      }
    }
  }
}

if (violations.length > 0) {
  console.error('[production-truth] Runtime fixture imports are forbidden:');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('[production-truth] Runtime fixture import boundary passed.');
