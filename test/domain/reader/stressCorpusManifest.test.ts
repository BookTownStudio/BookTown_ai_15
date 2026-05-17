import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = path.join(process.cwd(), 'public', 'fixtures', 'reader-corpus', 'manifest.json');

const requiredCaseIds = [
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
];

type CorpusCase = {
  id: string;
  format: 'epub' | 'pdf';
  assetPath: string;
  status: string;
  runtimePressure: string;
  expectedBehavior: string;
  budgets: Record<string, number>;
};

describe('reader stress corpus manifest', () => {
  it('covers every required A5 reader runtime stress case', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      version: number;
      cases: CorpusCase[];
    };
    const ids = new Set(manifest.cases.map((item) => item.id));

    expect(manifest.version).toBe(1);
    for (const requiredCaseId of requiredCaseIds) {
      expect(ids.has(requiredCaseId), requiredCaseId).toBe(true);
    }
  });

  it('defines runtime pressure, expected behavior, budgets, and repo-local assets', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      cases: CorpusCase[];
    };

    for (const item of manifest.cases) {
      expect(['epub', 'pdf']).toContain(item.format);
      expect(item.runtimePressure.length, item.id).toBeGreaterThan(0);
      expect(item.expectedBehavior.length, item.id).toBeGreaterThan(0);
      expect(item.assetPath.startsWith('public/fixtures/reader-corpus/'), item.id).toBe(true);
      for (const key of ['openMs', 'firstPageMs', 'minFps', 'maxHeapMb']) {
        expect(Number.isFinite(item.budgets[key]), `${item.id}:${key}`).toBe(true);
      }
    }
  });
});
