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

const authorityValidatorPath = path.join(
  ROOT,
  'functions/src/authority/authorityWriteValidator.ts'
);
const authorityValidator = readFileSync(authorityValidatorPath, 'utf8');
const requiredAuthorityTokens = [
  'PROTECTED_AUTHORITY_FIELDS',
  'AUTHORITY_WRITERS',
  'validateAuthorityMutation',
  'book_identity',
  'edition_identity',
  'attachment_ownership',
  'review_ownership',
  'quote_ownership',
  'shelf_membership',
  'reader_continuity',
  'throw new HttpsError("permission-denied"',
  'throw new HttpsError("invalid-argument"',
];

const missingAuthorityTokens = requiredAuthorityTokens.filter(
  (token) => !authorityValidator.includes(token)
);

if (missingAuthorityTokens.length > 0) {
  console.error('[production-truth] Authority write validator is incomplete:');
  for (const token of missingAuthorityTokens) {
    console.error(` - missing ${token}`);
  }
  process.exit(1);
}

console.log('[production-truth] Authority write validator boundary passed.');

const operationalMetricsPath = path.join(
  ROOT,
  'functions/src/operations/operationalMetrics.ts'
);
const operationalMetricsSource = readFileSync(operationalMetricsPath, 'utf8');
const requiredOperationalTokens = [
  'operational_metrics',
  'runtime_health_projection',
  'beta_observability_summary',
  'runtime_anomaly_projection',
  'runtime_anomaly_events',
  'reader_bootstrap_duration',
  'search_latency',
  'home_console_latency',
  'reader_startup_failure',
  'signed_url_failure',
  'continuity_migration_success',
  'continuity_migration_failure',
  'review_aggregate_retry',
  'quote_projection_failure',
  'notification_projection_failure',
  'shelf_membership_query_latency',
  'callable_error_rate',
  'firestore_read_amplification',
  'cache_hit_ratio',
  'reader_bootstrap_latency_spike',
  'search_latency_spike',
  'callable_error_rate_spike',
  'signed_url_failure_spike',
  'continuity_migration_failures',
  'review_aggregate_retry_spike',
  'notification_projection_failures',
  'shelf_membership_latency_spike',
  'cache_miss_spike',
  'detectRuntimeAnomaly',
];
const missingOperationalTokens = requiredOperationalTokens.filter(
  (token) => !operationalMetricsSource.includes(token)
);

if (missingOperationalTokens.length > 0) {
  console.error('[production-truth] Operational telemetry projection contract is incomplete:');
  for (const token of missingOperationalTokens) {
    console.error(` - missing ${token}`);
  }
  process.exit(1);
}

console.log('[production-truth] Operational telemetry projection boundary passed.');
