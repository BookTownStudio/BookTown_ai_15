#!/usr/bin/env node

import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 4174;
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const E2E_URL = `${BASE_URL}/?readerHighlightE2E=1`;
const TARGET_TEXT = 'Highlight lifecycle regression target text.';
const WAIT_TIMEOUT_MS = 20000;
const SERVER_BOOT_TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
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

async function selectPdfText(page, targetText) {
  await page.waitForSelector('.react-pdf__Page__textContent', {
    timeout: WAIT_TIMEOUT_MS,
  });

  const selectionResult = await page.evaluate((text) => {
    function findTextNode(root, query) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = node.textContent || '';
        const index = value.indexOf(query);
        if (index >= 0) {
          return {
            node,
            start: index,
            end: index + query.length,
          };
        }
        node = walker.nextNode();
      }
      return null;
    }

    const textLayer = document.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) {
      throw new Error('Missing PDF text layer.');
    }

    const match = findTextNode(textLayer, text);
    if (!match) {
      throw new Error(`Target text not found: ${text}`);
    }

    const range = document.createRange();
    range.setStart(match.node, match.start);
    range.setEnd(match.node, match.end);

    const selection = window.getSelection();
    if (!selection) {
      throw new Error('Selection API unavailable.');
    }
    selection.removeAllRanges();
    selection.addRange(range);

    const eventTarget =
      match.node.parentElement?.closest('.react-pdf__Page__textContent') ||
      match.node.parentElement?.closest('[data-reader-pdf-page]');
    if (!(eventTarget instanceof HTMLElement)) {
      throw new Error('Missing PDF event target for selection.');
    }
    eventTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    return {
      selectedText: selection.toString(),
    };
  }, targetText);

  if (selectionResult.selectedText !== targetText) {
    throw new Error(
      `Unexpected selected text. Expected "${targetText}", got "${selectionResult.selectedText}".`
    );
  }
}

async function waitForHarnessState(page, predicate, label) {
  await page.waitForFunction(
    (expectedLabel) => {
      const state = window.__readerHighlightHarness;
      if (!state) return false;
      if (expectedLabel === 'saved') return state.highlights.length === 1;
      if (expectedLabel === 'reopened') return state.reopenCount === 1;
      if (expectedLabel === 'removed') return state.highlights.length === 0;
      return false;
    },
    label,
    { timeout: WAIT_TIMEOUT_MS }
  );
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

  preview.stdout.on('data', (chunk) => {
    process.stdout.write(`[reader-highlight-e2e][preview] ${chunk}`);
  });
  preview.stderr.on('data', (chunk) => {
    process.stderr.write(`[reader-highlight-e2e][preview] ${chunk}`);
  });

  let browser;
  try {
    await waitForServer(BASE_URL, SERVER_BOOT_TIMEOUT_MS);

    const { chromium } = await import('playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('console', (msg) => {
      console.log(`[READER_HIGHLIGHT_E2E][CONSOLE][${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', (error) => {
      console.error(
        `[READER_HIGHLIGHT_E2E][PAGEERROR] ${error.message}\n${error.stack || '(no stack)'}`
      );
    });

    await page.goto(E2E_URL, {
      waitUntil: 'domcontentloaded',
    });

    await selectPdfText(page, TARGET_TEXT);
    await page.getByRole('button', { name: 'Highlight' }).click();
    await waitForHarnessState(page, 'saved', 'saved');
    await page.waitForSelector('mark[data-reader-pdf-highlight="true"]', {
      timeout: WAIT_TIMEOUT_MS,
    });

    await page.getByTestId('reader-highlight-reopen').click();
    await waitForHarnessState(page, 'reopened', 'reopened');
    await page.waitForSelector('mark[data-reader-pdf-highlight="true"]', {
      timeout: WAIT_TIMEOUT_MS,
    });

    const highlightedText = await page.locator('mark[data-reader-pdf-highlight="true"]').first().textContent();
    if (!highlightedText || !highlightedText.includes('Highlight lifecycle')) {
      throw new Error(`Unexpected highlighted text after reopen: ${highlightedText}`);
    }

    await selectPdfText(page, TARGET_TEXT);
    await page.getByRole('button', { name: 'Remove Highlight' }).click();
    await waitForHarnessState(page, 'removed', 'removed');

    await page.waitForFunction(
      () => document.querySelectorAll('mark[data-reader-pdf-highlight="true"]').length === 0,
      { timeout: WAIT_TIMEOUT_MS }
    );

    const finalState = await page.evaluate(() => window.__readerHighlightHarness);
    console.log(`[READER_HIGHLIGHT_E2E][PASS] ${JSON.stringify(finalState)}`);

    await context.close();
    await browser.close();
  } finally {
    preview.kill('SIGTERM');
  }
}

run().catch((error) => {
  console.error('[READER_HIGHLIGHT_E2E][ERROR]', error);
  process.exit(1);
});
