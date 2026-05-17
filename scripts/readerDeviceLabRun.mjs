#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = 4173;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const REPORT_DIR = path.join(ROOT, 'reports', 'reader-device-lab');
const WAIT_TIMEOUT_MS = 20000;
const SERVER_BOOT_TIMEOUT_MS = 30000;

const SCENARIOS = [
  {
    id: 'weak_device_large_pdf',
    fixture: '/fixtures/reader-corpus/pdf/large.pdf',
    mode: 'page',
    format: 'pdf',
    cpuThrottle: 4,
    durationMs: 4000,
    interaction: 'rapid_navigation',
  },
  {
    id: 'weak_device_huge_pagecount_pdf',
    fixture: '/fixtures/reader-corpus/pdf/huge-pagecount.pdf',
    mode: 'scroll',
    format: 'pdf',
    cpuThrottle: 4,
    durationMs: 4000,
    interaction: 'scroll_endurance',
    budgets: {
      coldOpenMs: 10000,
      firstPageRenderMs: 10000,
    },
  },
  {
    id: 'weak_network_large_pdf',
    fixture: '/fixtures/reader-corpus/pdf/large.pdf',
    mode: 'page',
    format: 'pdf',
    cpuThrottle: 2,
    routeDelayMs: 900,
    durationMs: 3000,
    interaction: 'rapid_navigation',
  },
  {
    id: 'large_epub_location_cache',
    fixture: '/fixtures/reader-corpus/epub/large.epub',
    mode: 'page',
    format: 'epub',
    cpuThrottle: 4,
    durationMs: 4000,
    interaction: 'rapid_navigation',
    useCanonicalManifest: true,
  },
  {
    id: 'rtl_arabic_epub',
    fixture: '/fixtures/reader-corpus/epub/rtl-arabic.epub',
    mode: 'page',
    format: 'epub',
    cpuThrottle: 3,
    durationMs: 3000,
    interaction: 'scroll_endurance',
  },
  {
    id: 'mixed_rtl_ltr_epub',
    fixture: '/fixtures/reader-corpus/epub/mixed-rtl-ltr.epub',
    mode: 'scroll',
    format: 'epub',
    cpuThrottle: 3,
    durationMs: 3000,
    interaction: 'scroll_endurance',
  },
  {
    id: 'annotation_heavy_epub',
    fixture: '/fixtures/reader-corpus/epub/annotation-heavy.epub',
    mode: 'page',
    format: 'epub',
    cpuThrottle: 4,
    durationMs: 4000,
    interaction: 'rapid_navigation',
  },
];

const BUDGETS = {
  coldOpenMs: 3000,
  firstPageRenderMs: 2400,
  longTaskCount: 12,
  heapGrowthMb: 96,
  layoutShiftScore: 0.1,
  hydrationDelayMs: 1200,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, res => {
          res.resume();
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
      });
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error(`Preview server did not boot within ${timeoutMs}ms.`);
}

async function terminateChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 2000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function buildBenchUrl(scenario) {
  const params = new URLSearchParams({
    readerBenchmark: '1',
    fixture: scenario.fixture,
    mode: scenario.mode,
  });
  if (scenario.useCanonicalManifest) {
    params.set('canonicalManifest', '1');
  }
  return `${BASE_URL}/?${params.toString()}`;
}

async function sampleHeap(page) {
  return page.evaluate(() => {
    const memory = performance.memory;
    return memory?.usedJSHeapSize ?? null;
  });
}

async function runInteraction(page, scenario) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < scenario.durationMs) {
    if (scenario.interaction === 'scroll_endurance') {
      await page.mouse.wheel(0, 900);
      await sleep(160);
      continue;
    }
    await page.keyboard.press('ArrowRight');
    await page.mouse.wheel(0, 550);
    await sleep(220);
  }
}

function failedScenarioResult(scenario, message, partialMetrics = null) {
  return {
    id: scenario.id,
    format: scenario.format,
    fixture: scenario.fixture,
    cpuThrottle: scenario.cpuThrottle,
    routeDelayMs: scenario.routeDelayMs ?? 0,
    coldOpenMs:
      typeof partialMetrics?.coldOpenMs === 'number' ? Number(partialMetrics.coldOpenMs.toFixed(2)) : null,
    firstPageRenderMs:
      typeof partialMetrics?.firstPageRenderMs === 'number'
        ? Number(partialMetrics.firstPageRenderMs.toFixed(2))
        : null,
    longTaskCount: partialMetrics?.longTaskCount ?? 0,
    longTaskTotalMs: Number((partialMetrics?.longTaskTotalMs ?? 0).toFixed(2)),
    layoutShiftScore: Number((partialMetrics?.layoutShiftScore ?? 0).toFixed(4)),
    layoutShiftEvents: Array.isArray(partialMetrics?.events)
      ? partialMetrics.events.filter(event => event.name === 'layout_shift').length
      : 0,
    hydrationCompletedCount: Array.isArray(partialMetrics?.events)
      ? partialMetrics.events.filter(event => event.name === 'hydration_completed').length
      : 0,
    maxHydrationDelayMs: 0,
    prewarmEventCount: Array.isArray(partialMetrics?.events)
      ? partialMetrics.events.filter(event => event.name === 'reader_runtime_prewarm').length
      : 0,
    droppedFrameEvents: 0,
    minScrollFps: null,
    memorySampleCount: 0,
    heapBeforeBytes: null,
    heapAfterBytes: null,
    heapGrowthBytes: null,
    epubLocationGenerateMs: null,
    epubLocationCacheHit: false,
    epubCanonicalLocationLoaded: false,
    canonicalManifestRequested: Boolean(scenario.useCanonicalManifest),
    pdfSurvivalFallback: false,
    eventCount: Array.isArray(partialMetrics?.events) ? partialMetrics.events.length : 0,
    findings: [{ severity: 'P1', finding: message }],
  };
}

function summarizeMetrics(metrics, heapBefore, heapAfter, scenario) {
  const events = Array.isArray(metrics?.events) ? metrics.events : [];
  const longTasks = events.filter(event => event.name === 'long_task');
  const layoutShifts = events.filter(event => event.name === 'layout_shift');
  const droppedFrames = events.filter(event => event.name === 'dropped_frames');
  const hydrationCompleted = events.filter(event => event.name === 'hydration_completed');
  const prewarmEvents = events.filter(event => event.name === 'reader_runtime_prewarm');
  const scrollFpsEvents = events.filter(event => event.name === 'scroll_fps');
  const memoryEvents = events.filter(event => event.name === 'memory_usage');
  const epubGenerate = events.find(event => event.name === 'epub_locations_generate_time');
  const epubCacheHit = events.find(event => event.name === 'epub_locations_cache_hit');
  const epubCanonicalLoaded = events.find(event => event.name === 'epub_canonical_locations_loaded');
  const pdfSurvivalFallback = events.find(event => event.name === 'pdf_survival_fallback');
  const coldOpenBudget = scenario.budgets?.coldOpenMs ?? BUDGETS.coldOpenMs;
  const firstPageBudget = scenario.budgets?.firstPageRenderMs ?? BUDGETS.firstPageRenderMs;
  const heapGrowthBytes =
    typeof heapBefore === 'number' && typeof heapAfter === 'number' ? heapAfter - heapBefore : null;

  const findings = [];
  if ((metrics?.coldOpenMs ?? Number.POSITIVE_INFINITY) > coldOpenBudget) {
    findings.push({
      severity: 'P1',
      finding: `Cold open exceeded local weak-device budget (${Math.round(metrics.coldOpenMs)}ms).`,
    });
  }
  if ((metrics?.firstPageRenderMs ?? Number.POSITIVE_INFINITY) > firstPageBudget) {
    findings.push({
      severity: 'P1',
      finding: `First page render exceeded budget (${Math.round(metrics.firstPageRenderMs)}ms).`,
    });
  }
  if (longTasks.length > BUDGETS.longTaskCount) {
    findings.push({
      severity: 'P2',
      finding: `Long-task count is high under interaction load (${longTasks.length}).`,
    });
  }
  if ((metrics?.layoutShiftScore ?? 0) > BUDGETS.layoutShiftScore) {
    findings.push({
      severity: 'P2',
      finding: `Layout shift score exceeded calmness budget (${metrics.layoutShiftScore.toFixed(4)}).`,
    });
  }
  if (heapGrowthBytes !== null && heapGrowthBytes > BUDGETS.heapGrowthMb * 1024 * 1024) {
    findings.push({
      severity: 'P1',
      finding: `Heap growth exceeded local proxy budget (${Math.round(heapGrowthBytes / 1024 / 1024)}MB).`,
    });
  }
  const maxHydrationDelayMs = Math.max(
    0,
    ...hydrationCompleted.map(event =>
      typeof event.payload?.delayMs === 'number' ? event.payload.delayMs : 0
    )
  );
  if (maxHydrationDelayMs > BUDGETS.hydrationDelayMs) {
    findings.push({
      severity: 'P2',
      finding: `Deferred hydration delay exceeded perceived-latency budget (${maxHydrationDelayMs.toFixed(2)}ms).`,
    });
  }
  if (scenario.format === 'epub' && !epubGenerate && !epubCacheHit && !epubCanonicalLoaded) {
    findings.push({
      severity: 'P2',
      finding: 'EPUB scenario did not publish canonical, cache, or generation location telemetry.',
    });
  }
  if (scenario.useCanonicalManifest && !epubCanonicalLoaded) {
    findings.push({
      severity: 'P1',
      finding: 'Canonical EPUB scenario did not consume manifest-backed location metadata.',
    });
  }
  if (scenario.useCanonicalManifest && epubGenerate) {
    findings.push({
      severity: 'P1',
      finding: 'Canonical EPUB scenario regressed to runtime location generation.',
    });
  }

  return {
    id: scenario.id,
    format: scenario.format,
    fixture: scenario.fixture,
    cpuThrottle: scenario.cpuThrottle,
    routeDelayMs: scenario.routeDelayMs ?? 0,
    coldOpenMs: typeof metrics?.coldOpenMs === 'number' ? Number(metrics.coldOpenMs.toFixed(2)) : null,
    firstPageRenderMs:
      typeof metrics?.firstPageRenderMs === 'number' ? Number(metrics.firstPageRenderMs.toFixed(2)) : null,
    longTaskCount: longTasks.length,
    longTaskTotalMs: Number((metrics?.longTaskTotalMs ?? 0).toFixed(2)),
    layoutShiftScore: Number((metrics?.layoutShiftScore ?? 0).toFixed(4)),
    layoutShiftEvents: layoutShifts.length,
    hydrationCompletedCount: hydrationCompleted.length,
    maxHydrationDelayMs: Number(maxHydrationDelayMs.toFixed(2)),
    prewarmEventCount: prewarmEvents.length,
    droppedFrameEvents: droppedFrames.length,
    minScrollFps:
      scrollFpsEvents.length > 0
        ? Math.min(...scrollFpsEvents.map(event => Number(event.payload?.fps ?? Number.POSITIVE_INFINITY)))
        : null,
    memorySampleCount: memoryEvents.length,
    heapBeforeBytes: heapBefore,
    heapAfterBytes: heapAfter,
    heapGrowthBytes,
    epubLocationGenerateMs:
      typeof epubGenerate?.payload?.durationMs === 'number' ? epubGenerate.payload.durationMs : null,
    epubLocationCacheHit: Boolean(epubCacheHit),
    epubCanonicalLocationLoaded: Boolean(epubCanonicalLoaded),
    canonicalManifestRequested: Boolean(scenario.useCanonicalManifest),
    pdfSurvivalFallback: Boolean(pdfSurvivalFallback),
    eventCount: events.length,
    findings,
  };
}

function writeReport(results) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const payload = {
    generatedAt,
    environment: {
      runner: 'Playwright Chromium local proxy',
      physicalDeviceLab: false,
      thermalSensors: false,
      batterySensors: false,
    },
    budgets: BUDGETS,
    scenarios: results,
  };
  const jsonPath = path.join(REPORT_DIR, 'latest.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  const totalFindings = results.flatMap(result => result.findings);
  const markdown = [
    '# Reader Device-Lab Proxy Report',
    '',
    `Generated: ${generatedAt}`,
    '',
    '## Evidence Boundary',
    '',
    'This is a local Playwright Chromium proxy with CPU throttling, route delay, corpus fixtures, interaction loops, heap samples, and reader telemetry. It is not a physical low-end-device, battery, or thermal lab.',
    '',
    '## Scenario Summary',
    '',
    '| Scenario | Format | Cold open | First page | Long tasks | Layout shift | Hydration delay | Prewarm | Heap growth | Findings |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...results.map(result => {
      const heapGrowthMb =
        typeof result.heapGrowthBytes === 'number'
          ? `${(result.heapGrowthBytes / 1024 / 1024).toFixed(2)}MB`
          : 'n/a';
      return `| ${result.id} | ${result.format} | ${result.coldOpenMs ?? 'n/a'}ms | ${result.firstPageRenderMs ?? 'n/a'}ms | ${result.longTaskCount} | ${result.layoutShiftScore ?? 0} | ${result.maxHydrationDelayMs ?? 0}ms | ${result.prewarmEventCount ?? 0} | ${heapGrowthMb} | ${result.findings.length} |`;
    }),
    '',
    '## Findings',
    '',
    totalFindings.length === 0
      ? 'No P1/P2 findings in the local proxy run.'
      : totalFindings.map(item => `- ${item.severity}: ${item.finding}`).join('\n'),
    '',
    '## Remaining Physical-Lab Gaps',
    '',
    '- Battery pressure and thermal slowdown were not measured in this environment.',
    '- Mobile OS background eviction and tab sleep behavior require physical or cloud-device validation.',
    '- Four-hour endurance is represented here only by accelerated interaction loops, not wall-clock evidence.',
  ].join('\n');

  const mdPath = path.join(REPORT_DIR, 'latest.md');
  fs.writeFileSync(mdPath, `${markdown}\n`);
  return { jsonPath, mdPath };
}

async function runScenario(browser, scenario) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpuThrottle });

  if (scenario.routeDelayMs) {
    await page.route(`**${scenario.fixture}`, async route => {
      await sleep(scenario.routeDelayMs);
      await route.continue();
    });
  }

  page.on('pageerror', error => {
    console.error(`[READER_DEVICE_LAB][PAGEERROR][${scenario.id}] ${error.message}`);
  });

  try {
    await page.goto(buildBenchUrl(scenario), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const metrics = window.__readerPerfMetrics;
        return Boolean(metrics && (metrics.done || metrics.error));
      },
      { timeout: WAIT_TIMEOUT_MS }
    );
  } catch (error) {
    const metrics = await page.evaluate(() => window.__readerPerfMetrics ?? null).catch(() => null);
    await context.close();
    return failedScenarioResult(
      scenario,
      `Scenario did not reach first interaction before timeout: ${
        error instanceof Error ? error.message : String(error)
      }`,
      metrics
    );
  }

  const initialMetrics = await page.evaluate(() => window.__readerPerfMetrics);
  if (initialMetrics?.error) {
    await context.close();
    return failedScenarioResult(
      scenario,
      `Scenario failed to open: ${initialMetrics.error}`,
      initialMetrics
    );
  }

  const heapBefore = await sampleHeap(page);
  try {
    await runInteraction(page, scenario);
  } catch (error) {
    const metrics = await page.evaluate(() => window.__readerPerfMetrics ?? null).catch(() => null);
    await context.close().catch(() => undefined);
    return failedScenarioResult(
      scenario,
      `Scenario interaction loop failed: ${error instanceof Error ? error.message : String(error)}`,
      metrics
    );
  }
  await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  await sleep(500);
  const heapAfter = await sampleHeap(page);
  const metrics = await page.evaluate(() => window.__readerPerfMetrics);
  await context.close();

  return summarizeMetrics(metrics, heapBefore, heapAfter, scenario);
}

async function main() {
  const preview = spawn(
    'npm',
    ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
    { stdio: 'pipe', env: process.env }
  );
  preview.stdout.on('data', chunk => process.stdout.write(`[reader-device-lab][preview] ${chunk}`));
  preview.stderr.on('data', chunk => process.stderr.write(`[reader-device-lab][preview] ${chunk}`));

  try {
    await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS);
    const { chromium } = await import('playwright');

    const results = [];
    for (const scenario of SCENARIOS) {
      console.log(`[READER_DEVICE_LAB][SCENARIO] ${scenario.id}`);
      const browser = await chromium.launch({
        headless: true,
        args: ['--disable-dev-shm-usage', '--js-flags=--expose-gc'],
      });
      try {
        const scenarioTimeoutMs = WAIT_TIMEOUT_MS + scenario.durationMs + 10000;
        results.push(
          await Promise.race([
            runScenario(browser, scenario),
            sleep(scenarioTimeoutMs).then(() =>
              failedScenarioResult(
                scenario,
                `Scenario exceeded runner timeout of ${scenarioTimeoutMs}ms.`
              )
            ),
          ])
        );
      } catch (error) {
        results.push(
          failedScenarioResult(
            scenario,
            `Scenario runner failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      } finally {
        await browser.close().catch(() => undefined);
      }
    }

    const reportPaths = writeReport(results);
    console.log(`[READER_DEVICE_LAB][REPORT] ${path.relative(ROOT, reportPaths.jsonPath)}`);
    console.log(`[READER_DEVICE_LAB][REPORT] ${path.relative(ROOT, reportPaths.mdPath)}`);
  } finally {
    await terminateChild(preview);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('[READER_DEVICE_LAB][ERROR]', error);
    process.exit(1);
  });
