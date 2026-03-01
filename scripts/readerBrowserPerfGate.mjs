#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 4173;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const BENCH_URL = `${BASE_URL}/?readerBenchmark=1`;

const BUDGETS = {
  coldOpenP95Ms: 1500,
  firstPageRenderP95Ms: 2200,
};

const RUNS = 7;
const WARMUP_RUNS = 1;
const WAIT_TIMEOUT_MS = 15000;
const SERVER_BOOT_TIMEOUT_MS = 30000;

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
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
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

function percentile(values, p) {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
}

async function run() {
  const preview = spawn(
    'npm',
    ['run', 'preview', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
    {
      stdio: 'pipe',
      env: process.env,
    }
  );

  preview.stdout.on('data', chunk => {
    process.stdout.write(`[reader-browser-gate][preview] ${chunk}`);
  });
  preview.stderr.on('data', chunk => {
    process.stderr.write(`[reader-browser-gate][preview] ${chunk}`);
  });

  let chromium;
  try {
    await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS);

    const { chromium: chromiumLib } = await import('playwright');
    chromium = chromiumLib;

    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });

    const coldOpenSamples = [];
    const firstPageSamples = [];

    for (let runIndex = 0; runIndex < WARMUP_RUNS + RUNS; runIndex += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      page.on('console', msg => {
        console.log(`[READER_BROWSER_GATE][CONSOLE][${msg.type()}] ${msg.text()}`);
      });
      page.on('pageerror', error => {
        console.error(
          `[READER_BROWSER_GATE][PAGEERROR] ${error.message}\n${error.stack || '(no stack)'}`
        );
      });
      await page.goto(BENCH_URL, {
        waitUntil: 'domcontentloaded',
      });

      await page.waitForFunction(
        () => {
          const metrics = window.__readerPerfMetrics;
          return Boolean(metrics && (metrics.done || metrics.error));
        },
        { timeout: WAIT_TIMEOUT_MS }
      );

      const metrics = await page.evaluate(() => window.__readerPerfMetrics);
      if (!metrics) {
        throw new Error('Missing reader benchmark metrics.');
      }
      if (metrics.error) {
        await page.screenshot({ path: `reader-browser-gate-error-run-${runIndex}.png`, fullPage: true });
        throw new Error(`Reader benchmark error: ${metrics.error}`);
      }
      if (!metrics.done) {
        throw new Error('Reader benchmark did not complete.');
      }
      if (
        typeof metrics.coldOpenMs !== 'number' ||
        !Number.isFinite(metrics.coldOpenMs) ||
        typeof metrics.firstPageRenderMs !== 'number' ||
        !Number.isFinite(metrics.firstPageRenderMs)
      ) {
        throw new Error(`Invalid benchmark metrics payload: ${JSON.stringify(metrics)}`);
      }

      if (runIndex >= WARMUP_RUNS) {
        coldOpenSamples.push(metrics.coldOpenMs);
        firstPageSamples.push(metrics.firstPageRenderMs);
        console.log(
          `[READER_BROWSER_GATE][SAMPLE] ${JSON.stringify({
            run: runIndex - WARMUP_RUNS + 1,
            coldOpenMs: Number(metrics.coldOpenMs.toFixed(2)),
            firstPageRenderMs: Number(metrics.firstPageRenderMs.toFixed(2)),
          })}`
        );
      } else {
        console.log(
          `[READER_BROWSER_GATE][WARMUP] ${JSON.stringify({
            coldOpenMs: Number(metrics.coldOpenMs.toFixed(2)),
            firstPageRenderMs: Number(metrics.firstPageRenderMs.toFixed(2)),
          })}`
        );
      }

      await context.close();
    }

    await browser.close();

    const coldOpenP95 = percentile(coldOpenSamples, 0.95);
    const firstPageP95 = percentile(firstPageSamples, 0.95);
    const coldOpenAvg = coldOpenSamples.reduce((sum, value) => sum + value, 0) / coldOpenSamples.length;
    const firstPageAvg =
      firstPageSamples.reduce((sum, value) => sum + value, 0) / firstPageSamples.length;

    console.log(
      `[READER_BROWSER_GATE][METRIC] ${JSON.stringify({
        metric: 'reader_browser_timing',
        runs: RUNS,
        coldOpenAvgMs: Number(coldOpenAvg.toFixed(2)),
        coldOpenP95Ms: Number(coldOpenP95.toFixed(2)),
        firstPageRenderAvgMs: Number(firstPageAvg.toFixed(2)),
        firstPageRenderP95Ms: Number(firstPageP95.toFixed(2)),
      })}`
    );

    const failures = [];
    if (coldOpenP95 > BUDGETS.coldOpenP95Ms) {
      failures.push(
        `cold-open p95 ${coldOpenP95.toFixed(2)}ms exceeds budget ${BUDGETS.coldOpenP95Ms.toFixed(2)}ms`
      );
    }
    if (firstPageP95 > BUDGETS.firstPageRenderP95Ms) {
      failures.push(
        `first-page-render p95 ${firstPageP95.toFixed(2)}ms exceeds budget ${BUDGETS.firstPageRenderP95Ms.toFixed(2)}ms`
      );
    }

    if (failures.length > 0) {
      for (const failure of failures) {
        console.error(`[READER_BROWSER_GATE][FAIL] ${failure}`);
      }
      process.exit(1);
    }

    console.log('[READER_BROWSER_GATE] all browser timing budgets passed.');
  } finally {
    preview.kill('SIGTERM');
  }
}

run().catch(error => {
  console.error('[READER_BROWSER_GATE][ERROR]', error);
  process.exit(1);
});
