#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import {
  buildPageOffsetIndex,
  findPageForAnchor,
} from '../lib/reader/runtime/pageOffsetLocator.js';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'dist', 'assets');

const BUDGETS = {
  readerEntryRawBytes: 260 * 1024,
  readerEntryGzipBytes: 80 * 1024,
  pdfEngineRawBytes: 400 * 1024,
  pdfEngineGzipBytes: 120 * 1024,
  epubEngineRawBytes: 30 * 1024,
  epubEngineGzipBytes: 12 * 1024,
  pdfEngineCssRawBytes: 14 * 1024,
  pageTurnLookupP95Ms: 0.04,
  pageTurnLookupAvgMs: 0.02,
};

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function fail(message) {
  console.error(`[READER_PERF_GATE][FAIL] ${message}`);
}

function pass(message) {
  console.log(`[READER_PERF_GATE][PASS] ${message}`);
}

function listAssetFiles() {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(`Build artifacts not found: ${ASSETS_DIR}. Run "npm run build" first.`);
  }
  return fs.readdirSync(ASSETS_DIR).filter(name => name.endsWith('.js') || name.endsWith('.css'));
}

function pickSingle(files, regex, label) {
  const matches = files.filter(name => regex.test(name));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} asset, found ${matches.length}.`);
  }
  return path.join(ASSETS_DIR, matches[0]);
}

function gzipBytes(filePath) {
  const content = fs.readFileSync(filePath);
  return gzipSync(content, { level: 9 }).byteLength;
}

function validateReaderShellLazySplit() {
  const sourcePath = path.join(ROOT, 'components', 'reader', 'runtime', 'ReaderSurface.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const lazyLoadsEpub =
    source.includes("React.lazy(() => import('../EpubViewer.tsx'))") ||
    (
      source.includes("const loadEpubViewer = () => import('../EpubViewer.tsx')") &&
      source.includes('React.lazy(loadEpubViewer)')
    );
  const lazyLoadsPdf =
    source.includes("React.lazy(() => import('../PdfViewer.tsx'))") ||
    (
      source.includes("const loadPdfViewer = () => import('../PdfViewer.tsx')") &&
      source.includes('React.lazy(loadPdfViewer)')
    );

  if (!lazyLoadsEpub) {
    throw new Error('ReaderSurface must lazy-load EpubViewer.');
  }
  if (!lazyLoadsPdf) {
    throw new Error('ReaderSurface must lazy-load PdfViewer.');
  }
}

function validatePdfUsesIndexedLookup() {
  const sourcePath = path.join(ROOT, 'components', 'reader', 'PdfViewer.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (!source.includes('findPageForAnchor(') || !source.includes('buildPageOffsetIndex(')) {
    throw new Error('PdfViewer must use indexed page-offset lookup helpers.');
  }
}

function validateEpubLocationCacheTelemetry() {
  const sourcePath = path.join(ROOT, 'components', 'reader', 'EpubViewer.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const manifestSource = fs.readFileSync(
    path.join(ROOT, 'functions', 'src', 'reader', 'readerManifestService.ts'),
    'utf8'
  );
  const producerSource = fs.readFileSync(
    path.join(ROOT, 'functions', 'src', 'reader', 'canonicalEpubProducer.ts'),
    'utf8'
  );
  if (!source.includes('readCachedEpubLocations(') || !source.includes('writeCachedEpubLocations(')) {
    throw new Error('EpubViewer must use reusable EPUB location cache helpers.');
  }
  if (!source.includes('resolveCanonicalEpubLocationMap(')) {
    throw new Error('EpubViewer must prefer canonical EPUB location metadata when available.');
  }
  if (
    !source.includes("markReaderTelemetry('epub_locations_cache_hit'") ||
    !source.includes("markReaderTelemetry('epub_locations_generate_time'") ||
    !source.includes("markReaderTelemetry('epub_canonical_locations_loaded'") ||
    !source.includes("markReaderTelemetry('epub_canonical_locations_fallback'")
  ) {
    throw new Error('EpubViewer must emit EPUB canonical/cache/generation telemetry.');
  }
  if (
    !manifestSource.includes('spineMap') ||
    !manifestSource.includes('sectionGraph') ||
    !manifestSource.includes('stableAnchorMap') ||
    !manifestSource.includes('navigationIndex') ||
    !manifestSource.includes('paginationHints') ||
    !manifestSource.includes('literaryCoordinateMap') ||
    !manifestSource.includes('passageIndex') ||
    !manifestSource.includes('annotationIdentityIndex') ||
    !manifestSource.includes('literaryMemoryPrimitives')
  ) {
    throw new Error('Reader manifests must expose canonical EPUB structure and literary identity pointers.');
  }
  if (
    !manifestSource.includes('preprocessCanonicalEpub(') ||
    !manifestSource.includes('CANONICAL_EPUB_PREPROCESS_READY') ||
    !producerSource.includes('preprocessCanonicalEpub') ||
    !producerSource.includes('locationPayload') ||
    !producerSource.includes('sectionGraph') ||
    !producerSource.includes('stableAnchorMap') ||
    !producerSource.includes('failPreprocess') ||
    !producerSource.includes('cfiFidelity') ||
    !producerSource.includes('malformed_xhtml') ||
    !producerSource.includes('CANONICAL_LITERARY_COORDINATE_SCHEMA') ||
    !producerSource.includes('CANONICAL_PASSAGE_REFERENCE_SCHEMA') ||
    !producerSource.includes('CANONICAL_ANNOTATION_IDENTITY_SCHEMA') ||
    !producerSource.includes('CANONICAL_LITERARY_MEMORY_SCHEMA')
  ) {
    throw new Error('Reader backend must produce canonical EPUB metadata and literary coordinates before runtime consumption.');
  }
}

function runLocatorCorrectnessChecks() {
  const refs = [{ offsetTop: 0 }, { offsetTop: 1000 }, { offsetTop: 2000 }];
  const index = buildPageOffsetIndex(refs, 3);
  if (index.length !== 3) throw new Error('Offset index build failed.');
  if (findPageForAnchor(index, -10) !== 1) throw new Error('Anchor below range should map to page 1.');
  if (findPageForAnchor(index, 0) !== 1) throw new Error('Anchor at first page should map to page 1.');
  if (findPageForAnchor(index, 1500) !== 2) throw new Error('Mid anchor should map to page 2.');
  if (findPageForAnchor(index, 999999) !== 3) throw new Error('Anchor past end should map to last page.');
}

function runPageTurnProxyBenchmark() {
  const pageCount = 5000;
  const offsets = Array.from({ length: pageCount }, (_, i) => i * 1280);
  const maxAnchor = offsets[offsets.length - 1] + 1279;
  const samples = [];

  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };

  const warmupIters = 20000;
  for (let i = 0; i < warmupIters; i += 1) {
    findPageForAnchor(offsets, nextRand() % maxAnchor);
  }

  const batches = 120;
  const batchSize = 220;
  let checksum = 0;

  for (let batch = 0; batch < batches; batch += 1) {
    const startedAt = performance.now();
    for (let i = 0; i < batchSize; i += 1) {
      checksum += findPageForAnchor(offsets, nextRand() % maxAnchor);
    }
    const elapsedMs = performance.now() - startedAt;
    samples.push(elapsedMs / batchSize);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const p95Ms = sorted[p95Index];
  const avgMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;

  return {
    avgMs,
    p95Ms,
    checksum,
  };
}

function main() {
  const failures = [];
  const recordFailure = (message) => {
    failures.push(message);
    fail(message);
  };

  try {
    validateReaderShellLazySplit();
    pass('ReaderSurface lazy split is enforced.');
  } catch (error) {
    recordFailure(String(error instanceof Error ? error.message : error));
  }

  try {
    validatePdfUsesIndexedLookup();
    pass('PdfViewer indexed lookup is enforced.');
  } catch (error) {
    recordFailure(String(error instanceof Error ? error.message : error));
  }

  try {
    validateEpubLocationCacheTelemetry();
    pass('EpubViewer location cache telemetry is enforced.');
  } catch (error) {
    recordFailure(String(error instanceof Error ? error.message : error));
  }

  try {
    runLocatorCorrectnessChecks();
    pass('Page-offset locator correctness checks passed.');
  } catch (error) {
    recordFailure(String(error instanceof Error ? error.message : error));
  }

  try {
    const files = listAssetFiles();
    const readerJs = pickSingle(files, /^reader-.*\.js$/, 'reader js chunk');
    const pdfEngine = pickSingle(files, /^PdfViewer-.*\.js$/, 'PdfViewer engine chunk');
    const epubEngine = pickSingle(files, /^EpubViewer-.*\.js$/, 'EpubViewer engine chunk');
    const pdfEngineCss = pickSingle(files, /^PdfViewer-.*\.css$/, 'PdfViewer css chunk');

    const readerRawBytes = fs.statSync(readerJs).size;
    const readerGzip = gzipBytes(readerJs);
    const pdfEngineRawBytes = fs.statSync(pdfEngine).size;
    const pdfEngineGzipBytes = gzipBytes(pdfEngine);
    const epubEngineRawBytes = fs.statSync(epubEngine).size;
    const epubEngineGzipBytes = gzipBytes(epubEngine);
    const pdfEngineCssRawBytes = fs.statSync(pdfEngineCss).size;

    const chunkMetrics = {
      readerChunk: path.basename(readerJs),
      readerRawBytes,
      readerGzipBytes: readerGzip,
      pdfEngineChunk: path.basename(pdfEngine),
      pdfEngineRawBytes,
      pdfEngineGzipBytes,
      epubEngineChunk: path.basename(epubEngine),
      epubEngineRawBytes,
      epubEngineGzipBytes,
      pdfEngineCssChunk: path.basename(pdfEngineCss),
      pdfEngineCssRawBytes,
    };

    console.log(
      `[READER_PERF_GATE][METRIC] ${JSON.stringify({
        metric: 'reader_cold_open_proxy',
        ...chunkMetrics,
      })}`
    );

    if (readerRawBytes > BUDGETS.readerEntryRawBytes) {
      recordFailure(
        `Reader entry raw size exceeded: ${formatBytes(readerRawBytes)} > ${formatBytes(
          BUDGETS.readerEntryRawBytes
        )}.`
      );
    } else {
      pass(
        `Reader entry raw size within budget (${formatBytes(readerRawBytes)} <= ${formatBytes(
          BUDGETS.readerEntryRawBytes
        )}).`
      );
    }

    if (readerGzip > BUDGETS.readerEntryGzipBytes) {
      recordFailure(
        `Reader entry gzip size exceeded: ${formatBytes(readerGzip)} > ${formatBytes(
          BUDGETS.readerEntryGzipBytes
        )}.`
      );
    } else {
      pass(
        `Reader entry gzip size within budget (${formatBytes(readerGzip)} <= ${formatBytes(
          BUDGETS.readerEntryGzipBytes
        )}).`
      );
    }

    if (pdfEngineRawBytes > BUDGETS.pdfEngineRawBytes) {
      recordFailure(
        `PDF engine raw size exceeded: ${formatBytes(pdfEngineRawBytes)} > ${formatBytes(
          BUDGETS.pdfEngineRawBytes
        )}.`
      );
    } else {
      pass(
        `PDF engine raw size within budget (${formatBytes(pdfEngineRawBytes)} <= ${formatBytes(
          BUDGETS.pdfEngineRawBytes
        )}).`
      );
    }

    if (pdfEngineGzipBytes > BUDGETS.pdfEngineGzipBytes) {
      recordFailure(
        `PDF engine gzip size exceeded: ${formatBytes(pdfEngineGzipBytes)} > ${formatBytes(
          BUDGETS.pdfEngineGzipBytes
        )}.`
      );
    } else {
      pass(
        `PDF engine gzip size within budget (${formatBytes(pdfEngineGzipBytes)} <= ${formatBytes(
          BUDGETS.pdfEngineGzipBytes
        )}).`
      );
    }

    if (epubEngineRawBytes > BUDGETS.epubEngineRawBytes) {
      recordFailure(
        `EPUB engine raw size exceeded: ${formatBytes(epubEngineRawBytes)} > ${formatBytes(
          BUDGETS.epubEngineRawBytes
        )}.`
      );
    } else {
      pass(
        `EPUB engine raw size within budget (${formatBytes(epubEngineRawBytes)} <= ${formatBytes(
          BUDGETS.epubEngineRawBytes
        )}).`
      );
    }

    if (epubEngineGzipBytes > BUDGETS.epubEngineGzipBytes) {
      recordFailure(
        `EPUB engine gzip size exceeded: ${formatBytes(epubEngineGzipBytes)} > ${formatBytes(
          BUDGETS.epubEngineGzipBytes
        )}.`
      );
    } else {
      pass(
        `EPUB engine gzip size within budget (${formatBytes(epubEngineGzipBytes)} <= ${formatBytes(
          BUDGETS.epubEngineGzipBytes
        )}).`
      );
    }

    if (pdfEngineCssRawBytes > BUDGETS.pdfEngineCssRawBytes) {
      recordFailure(
        `PDF engine CSS size exceeded: ${formatBytes(pdfEngineCssRawBytes)} > ${formatBytes(
          BUDGETS.pdfEngineCssRawBytes
        )}.`
      );
    } else {
      pass(
        `PDF engine CSS size within budget (${formatBytes(pdfEngineCssRawBytes)} <= ${formatBytes(
          BUDGETS.pdfEngineCssRawBytes
        )}).`
      );
    }
  } catch (error) {
    recordFailure(String(error instanceof Error ? error.message : error));
  }

  try {
    const lookupBench = runPageTurnProxyBenchmark();
    console.log(
      `[READER_PERF_GATE][METRIC] ${JSON.stringify({
        metric: 'reader_page_turn_proxy',
        avgLookupMs: Number(lookupBench.avgMs.toFixed(6)),
        p95LookupMs: Number(lookupBench.p95Ms.toFixed(6)),
        checksum: lookupBench.checksum,
      })}`
    );

    if (lookupBench.p95Ms > BUDGETS.pageTurnLookupP95Ms) {
      recordFailure(
        `Page-turn lookup p95 exceeded: ${lookupBench.p95Ms.toFixed(6)}ms > ${BUDGETS.pageTurnLookupP95Ms.toFixed(6)}ms.`
      );
    } else {
      pass(
        `Page-turn lookup p95 within budget (${lookupBench.p95Ms.toFixed(6)}ms <= ${BUDGETS.pageTurnLookupP95Ms.toFixed(6)}ms).`
      );
    }

    if (lookupBench.avgMs > BUDGETS.pageTurnLookupAvgMs) {
      recordFailure(
        `Page-turn lookup avg exceeded: ${lookupBench.avgMs.toFixed(6)}ms > ${BUDGETS.pageTurnLookupAvgMs.toFixed(6)}ms.`
      );
    } else {
      pass(
        `Page-turn lookup avg within budget (${lookupBench.avgMs.toFixed(6)}ms <= ${BUDGETS.pageTurnLookupAvgMs.toFixed(6)}ms).`
      );
    }
  } catch (error) {
    recordFailure(String(error instanceof Error ? error.message : error));
  }

  if (failures.length > 0) {
    console.error(`[READER_PERF_GATE] failed with ${failures.length} violation(s).`);
    process.exit(1);
  }

  console.log('[READER_PERF_GATE] all budgets passed.');
}

main();
