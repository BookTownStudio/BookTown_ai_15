#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'public', 'fixtures', 'reader-corpus', 'manifest.json');

const REQUIRED_CASES = new Set([
  'small_clean_epub',
  'large_epub',
  'rtl_arabic_epub',
  'mixed_rtl_ltr_epub',
  'image_heavy_epub',
  'malformed_spine_epub',
  'broken_toc_epub',
  'footnote_dense_epub',
  'annotation_heavy_epub',
  'small_pdf',
  'large_pdf',
  'academic_pdf',
  'scanned_pdf',
  'arabic_pdf',
  'image_heavy_pdf',
  'corrupt_pdf',
  'huge_pagecount_pdf',
]);

const ALLOWED_STATUS = new Set(['generated', 'generated_scaled', 'generated_negative']);
const ALLOWED_FORMAT = new Set(['epub', 'pdf']);

function fail(message) {
  console.error(`[READER_STRESS_CORPUS][FAIL] ${message}`);
}

function pass(message) {
  console.log(`[READER_STRESS_CORPUS][PASS] ${message}`);
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Stress corpus manifest missing: ${path.relative(ROOT, MANIFEST_PATH)}`);
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function assertBudget(caseId, budgets, failures) {
  const required = ['openMs', 'firstPageMs', 'minFps', 'maxHeapMb'];
  for (const key of required) {
    if (typeof budgets?.[key] !== 'number' || !Number.isFinite(budgets[key])) {
      failures.push(`${caseId} must define numeric budget ${key}.`);
    }
  }
}

function main() {
  const failures = [];

  let manifest;
  try {
    manifest = readManifest();
  } catch (error) {
    fail(String(error instanceof Error ? error.message : error));
    process.exit(1);
  }

  if (manifest.version !== 1) {
    failures.push('Manifest version must be 1.');
  }
  if (!Array.isArray(manifest.cases)) {
    failures.push('Manifest cases must be an array.');
  }

  const cases = Array.isArray(manifest.cases) ? manifest.cases : [];
  const seen = new Set();

  for (const item of cases) {
    const caseId = typeof item?.id === 'string' ? item.id : null;
    if (!caseId) {
      failures.push('Every corpus case must define an id.');
      continue;
    }
    if (seen.has(caseId)) failures.push(`Duplicate corpus case id: ${caseId}.`);
    seen.add(caseId);

    if (!REQUIRED_CASES.has(caseId)) failures.push(`Unexpected corpus case id: ${caseId}.`);
    if (!ALLOWED_FORMAT.has(item.format)) failures.push(`${caseId} must use epub or pdf format.`);
    if (!ALLOWED_STATUS.has(item.status)) failures.push(`${caseId} has unsupported status ${item.status}.`);
    if (typeof item.assetPath !== 'string' || item.assetPath.trim().length === 0) {
      failures.push(`${caseId} must define assetPath.`);
    } else {
      const assetPath = path.join(ROOT, item.assetPath);
      if (!fs.existsSync(assetPath)) {
        failures.push(`${caseId} asset missing at ${item.assetPath}. Run npm run fixtures:reader-corpus.`);
      } else if (fs.statSync(assetPath).size <= 0) {
        failures.push(`${caseId} asset is empty at ${item.assetPath}.`);
      }
    }
    if (typeof item.runtimePressure !== 'string' || item.runtimePressure.trim().length === 0) {
      failures.push(`${caseId} must define runtimePressure.`);
    }
    if (typeof item.expectedBehavior !== 'string' || item.expectedBehavior.trim().length === 0) {
      failures.push(`${caseId} must define expectedBehavior.`);
    }
    assertBudget(caseId, item.budgets, failures);
  }

  for (const requiredCase of REQUIRED_CASES) {
    if (!seen.has(requiredCase)) failures.push(`Missing required corpus case: ${requiredCase}.`);
  }

  if (failures.length > 0) {
    for (const message of failures) fail(message);
    console.error(`[READER_STRESS_CORPUS] failed with ${failures.length} violation(s).`);
    process.exit(1);
  }

  pass(`Manifest covers ${cases.length} required reader stress cases.`);
  console.log('[READER_STRESS_CORPUS] corpus gate passed.');
}

main();
