#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

const ROOT = process.cwd();
const CORPUS_DIR = path.join(ROOT, 'public', 'fixtures', 'reader-corpus');
const EPUB_DIR = path.join(CORPUS_DIR, 'epub');
const PDF_DIR = path.join(CORPUS_DIR, 'pdf');

function ensureDirs() {
  fs.mkdirSync(EPUB_DIR, { recursive: true });
  fs.mkdirSync(PDF_DIR, { recursive: true });
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraph(seed, index) {
  return `BookTown reader benchmark ${seed} paragraph ${index}. This synthetic public-domain-style passage exists to exercise EPUB layout, location generation, selection, and navigation without commercial text.`;
}

function arabicParagraph(index) {
  return `فقرة اختبار القارئ رقم ${index}. هذا نص عربي اصطناعي لاختبار اتجاه القراءة واستقرار العرض واختيار النص داخل كتاب إلكتروني.`;
}

function chapterXhtml({ title, body, lang = 'en', dir = 'ltr' }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}" dir="${dir}">
<head><title>${escapeXml(title)}</title><meta charset="utf-8"/></head>
<body>
<h1>${escapeXml(title)}</h1>
${body}
</body>
</html>`;
}

function buildParagraphBody(seed, count) {
  return Array.from({ length: count }, (_, index) => `<p>${escapeXml(paragraph(seed, index + 1))}</p>`).join('\n');
}

async function writeEpub({
  filename,
  title,
  chapters,
  includeNav = true,
  malformedSpine = false,
  invalidNavTree = false,
  corruptMetadata = false,
}) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const manifestItems = [];
  const spineItems = [];
  chapters.forEach((chapter, index) => {
    const id = `chapter-${index + 1}`;
    const href = `chapter-${index + 1}.xhtml`;
    zip.file(`OEBPS/${href}`, chapter.content);
    manifestItems.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${malformedSpine && index === chapters.length - 1 ? 'missing-chapter' : id}"/>`);
  });

  if (includeNav) {
    const links = chapters
      .map((chapter, index) => `<li><a href="chapter-${index + 1}.xhtml">${escapeXml(chapter.title)}</a></li>`)
      .join('');
    zip.file(
      'OEBPS/nav.xhtml',
      chapterXhtml({
        title: 'Contents',
        body: invalidNavTree
          ? `<nav epub:type="toc" id="toc"><ol><li><a href="missing.xhtml">Missing</a><ol><li><a href="chapter-1.xhtml">Nested without close</a></li></ol></nav>`
          : `<nav epub:type="toc" id="toc"><ol>${links}</ol></nav>`,
      })
    );
    manifestItems.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>');
  }

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">booktown-${escapeXml(filename)}</dc:identifier>
    <dc:title>${corruptMetadata ? '' : escapeXml(title)}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>${manifestItems.join('\n')}</manifest>
  <spine>${spineItems.join('\n')}</spine>
</package>`
  );

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  fs.writeFileSync(path.join(EPUB_DIR, filename), buffer);
}

function writeCorpusManifest() {
  const cases = [
    ['small_clean_epub', 'epub', 'epub/small-clean.epub', 'generated', 'small clean EPUB baseline', 'opens through canonical or runtime EPUB path'],
    ['large_epub', 'epub', 'epub/large.epub', 'generated_scaled', 'large multi-chapter EPUB location generation pressure', 'canonical path avoids repeated runtime generation where available'],
    ['rtl_arabic_epub', 'epub', 'epub/rtl-arabic.epub', 'generated', 'RTL Arabic EPUB rendering and anchors', 'opens without layout instability'],
    ['mixed_rtl_ltr_epub', 'epub', 'epub/mixed-rtl-ltr.epub', 'generated', 'mixed script direction anchors', 'anchors remain deterministic'],
    ['image_heavy_epub', 'epub', 'epub/image-heavy.epub', 'generated_scaled', 'image-heavy EPUB layout pressure', 'reader remains responsive'],
    ['malformed_spine_epub', 'epub', 'epub/malformed-spine.epub', 'generated_negative', 'spine references missing manifest items', 'canonical producer fails closed or partially recovers safely'],
    ['broken_toc_epub', 'epub', 'epub/broken-toc.epub', 'generated_negative', 'missing navigation document', 'canonical producer degrades without poisoning manifest'],
    ['invalid_nav_tree_epub', 'epub', 'epub/invalid-nav-tree.epub', 'generated_negative', 'invalid navigation tree references missing assets', 'navigation index degrades safely'],
    ['malformed_xhtml_epub', 'epub', 'epub/malformed-xhtml.epub', 'generated_negative', 'dangerously malformed XHTML body', 'canonical producer blocks ready manifest promotion'],
    ['corrupt_metadata_epub', 'epub', 'epub/corrupt-metadata.epub', 'generated_negative', 'corrupted or missing metadata fields', 'structure generation does not trust metadata blindly'],
    ['deep_structure_epub', 'epub', 'epub/deep-structure.epub', 'generated_scaled', 'deep EPUB spine and section structure', 'canonical producer remains bounded'],
    ['massive_epub', 'epub', 'epub/massive.epub', 'generated_scaled', 'massive EPUB preprocessing pressure', 'producer and runtime remain operationally credible'],
    ['footnote_dense_epub', 'epub', 'epub/footnote-dense.epub', 'generated_scaled', 'footnote dense anchors', 'anchors remain deterministic'],
    ['annotation_heavy_epub', 'epub', 'epub/annotation-heavy.epub', 'generated_scaled', 'annotation-heavy reading session', 'highlight continuity remains stable'],
    ['small_pdf', 'pdf', 'pdf/small.pdf', 'generated', 'small PDF baseline', 'opens quickly'],
    ['large_pdf', 'pdf', 'pdf/large.pdf', 'generated_scaled', 'large PDF scrolling', 'virtualization remains bounded'],
    ['academic_pdf', 'pdf', 'pdf/academic.pdf', 'generated', 'academic dense PDF', 'navigation remains responsive'],
    ['scanned_pdf', 'pdf', 'pdf/scanned.pdf', 'generated_scaled', 'scanned image PDF', 'memory remains bounded'],
    ['arabic_pdf', 'pdf', 'pdf/arabic.pdf', 'generated', 'Arabic PDF', 'opens without crash'],
    ['image_heavy_pdf', 'pdf', 'pdf/image-heavy.pdf', 'generated_scaled', 'image-heavy PDF', 'survives weak-device proxy'],
    ['corrupt_pdf', 'pdf', 'pdf/corrupt.pdf', 'generated_negative', 'corrupt PDF negative case', 'fails gracefully'],
    ['huge_pagecount_pdf', 'pdf', 'pdf/huge-pagecount.pdf', 'generated_scaled', 'huge page-count PDF', 'survival fallback reaches interaction'],
  ].map(([id, format, assetPath, status, runtimePressure, expectedBehavior]) => ({
    id,
    format,
    assetPath: `public/fixtures/reader-corpus/${assetPath}`,
    status,
    runtimePressure,
    expectedBehavior,
    budgets: {
      openMs: id === 'huge_pagecount_pdf' ? 10000 : 3000,
      firstPageMs: id === 'huge_pagecount_pdf' ? 10000 : 2400,
      minFps: 45,
      maxHeapMb: 96,
    },
  }));

  fs.writeFileSync(
    path.join(CORPUS_DIR, 'manifest.json'),
    `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), cases }, null, 2)}\n`
  );
}

function addPdfPages(filename, title, pageCount, variant) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  for (let page = 1; page <= pageCount; page += 1) {
    if (page > 1) doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`${title} ${page}/${pageCount}`, 48, 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    if (variant === 'image') {
      for (let box = 0; box < 8; box += 1) {
        doc.setFillColor((box * 37) % 255, (box * 61) % 255, (box * 19) % 255);
        doc.rect(48 + (box % 2) * 245, 90 + Math.floor(box / 2) * 145, 220, 112, 'F');
      }
      continue;
    }

    if (variant === 'arabic') {
      for (let line = 0; line < 34; line += 1) {
        doc.text(arabicParagraph(line + page), 48, 92 + line * 14);
      }
      continue;
    }

    const linesPerPage = variant === 'academic' ? 42 : 30;
    for (let line = 0; line < linesPerPage; line += 1) {
      const text =
        variant === 'academic'
          ? `Section ${page}.${line + 1}: citation-dense synthetic paragraph with inline references [${line + 1}] and tabular values ${page * line}.`
          : paragraph(title, line + page);
      doc.text(text, 48, 92 + line * 14, { maxWidth: 500 });
    }
  }
  fs.writeFileSync(path.join(PDF_DIR, filename), Buffer.from(doc.output('arraybuffer')));
}

async function main() {
  ensureDirs();

  await writeEpub({
    filename: 'small-clean.epub',
    title: 'Small Clean EPUB',
    chapters: [{ title: 'Opening', content: chapterXhtml({ title: 'Opening', body: buildParagraphBody('small', 24) }) }],
  });

  await writeEpub({
    filename: 'large.epub',
    title: 'Large Scaled EPUB',
    chapters: Array.from({ length: 24 }, (_, index) => ({
      title: `Chapter ${index + 1}`,
      content: chapterXhtml({ title: `Chapter ${index + 1}`, body: buildParagraphBody(`large-${index + 1}`, 90) }),
    })),
  });

  await writeEpub({
    filename: 'rtl-arabic.epub',
    title: 'RTL Arabic EPUB',
    chapters: [
      {
        title: 'اختبار عربي',
        content: chapterXhtml({
          title: 'اختبار عربي',
          lang: 'ar',
          dir: 'rtl',
          body: Array.from({ length: 80 }, (_, index) => `<p>${arabicParagraph(index + 1)}</p>`).join('\n'),
        }),
      },
    ],
  });

  await writeEpub({
    filename: 'mixed-rtl-ltr.epub',
    title: 'Mixed RTL LTR EPUB',
    chapters: [
      {
        title: 'Mixed Direction',
        content: chapterXhtml({
          title: 'Mixed Direction',
          body: Array.from({ length: 70 }, (_, index) =>
            index % 2 === 0
              ? `<p dir="rtl">${arabicParagraph(index + 1)}</p>`
              : `<p dir="ltr">${escapeXml(paragraph('mixed', index + 1))}</p>`
          ).join('\n'),
        }),
      },
    ],
  });

  await writeEpub({
    filename: 'image-heavy.epub',
    title: 'Image Heavy EPUB',
    chapters: [
      {
        title: 'Images',
        content: chapterXhtml({
          title: 'Images',
          body: Array.from({ length: 28 }, (_, index) =>
            `<figure><svg xmlns="http://www.w3.org/2000/svg" width="900" height="420"><rect width="900" height="420" fill="#${((index + 3) * 92821).toString(16).slice(0, 6).padEnd(6, '0')}"/><text x="36" y="80" font-size="42" fill="white">Synthetic figure ${index + 1}</text></svg><figcaption>Figure ${index + 1}</figcaption></figure>`
          ).join('\n'),
        }),
      },
    ],
  });

  await writeEpub({
    filename: 'malformed-spine.epub',
    title: 'Malformed Spine EPUB',
    malformedSpine: true,
    chapters: [{ title: 'Broken Spine', content: chapterXhtml({ title: 'Broken Spine', body: buildParagraphBody('broken', 16) }) }],
  });

  await writeEpub({
    filename: 'broken-toc.epub',
    title: 'Broken TOC EPUB',
    includeNav: false,
    chapters: [{ title: 'No Navigation', content: chapterXhtml({ title: 'No Navigation', body: buildParagraphBody('no-toc', 40) }) }],
  });

  await writeEpub({
    filename: 'invalid-nav-tree.epub',
    title: 'Invalid Navigation Tree EPUB',
    invalidNavTree: true,
    chapters: [{ title: 'Invalid Nav', content: chapterXhtml({ title: 'Invalid Nav', body: buildParagraphBody('invalid-nav', 36) }) }],
  });

  await writeEpub({
    filename: 'malformed-xhtml.epub',
    title: 'Malformed XHTML EPUB',
    chapters: [{ title: 'Malformed XHTML', content: '<html><body><p>Broken paragraph<p>Nested break<p>Still missing closures' }],
  });

  await writeEpub({
    filename: 'corrupt-metadata.epub',
    title: 'Corrupt Metadata EPUB',
    corruptMetadata: true,
    chapters: [{ title: 'Readable Despite Metadata', content: chapterXhtml({ title: 'Readable Despite Metadata', body: buildParagraphBody('corrupt-meta', 48) }) }],
  });

  await writeEpub({
    filename: 'deep-structure.epub',
    title: 'Deep Structure EPUB',
    chapters: Array.from({ length: 64 }, (_, index) => ({
      title: `Deep Section ${index + 1}`,
      content: chapterXhtml({ title: `Deep Section ${index + 1}`, body: buildParagraphBody(`deep-${index + 1}`, 18) }),
    })),
  });

  await writeEpub({
    filename: 'massive.epub',
    title: 'Massive EPUB',
    chapters: Array.from({ length: 40 }, (_, index) => ({
      title: `Massive Chapter ${index + 1}`,
      content: chapterXhtml({ title: `Massive Chapter ${index + 1}`, body: buildParagraphBody(`massive-${index + 1}`, 160) }),
    })),
  });

  await writeEpub({
    filename: 'footnote-dense.epub',
    title: 'Footnote Dense EPUB',
    chapters: [
      {
        title: 'Notes',
        content: chapterXhtml({
          title: 'Notes',
          body: Array.from({ length: 120 }, (_, index) => `<p>${escapeXml(paragraph('footnote', index + 1))} <a href="#note-${index + 1}">note</a></p><aside id="note-${index + 1}">Synthetic note ${index + 1}</aside>`).join('\n'),
        }),
      },
    ],
  });

  await writeEpub({
    filename: 'annotation-heavy.epub',
    title: 'Annotation Heavy EPUB',
    chapters: Array.from({ length: 8 }, (_, index) => ({
      title: `Annotation Chapter ${index + 1}`,
      content: chapterXhtml({ title: `Annotation Chapter ${index + 1}`, body: buildParagraphBody(`annotation-${index + 1}`, 140) }),
    })),
  });

  addPdfPages('small.pdf', 'Small PDF', 4, 'text');
  addPdfPages('large.pdf', 'Large PDF', 120, 'text');
  addPdfPages('academic.pdf', 'Academic PDF', 24, 'academic');
  addPdfPages('scanned.pdf', 'Scanned PDF', 32, 'image');
  addPdfPages('arabic.pdf', 'Arabic PDF', 18, 'arabic');
  addPdfPages('image-heavy.pdf', 'Image Heavy PDF', 48, 'image');
  addPdfPages('huge-pagecount.pdf', 'Huge Pagecount PDF', 220, 'text');
  fs.writeFileSync(path.join(PDF_DIR, 'corrupt.pdf'), 'not a valid pdf\n');
  writeCorpusManifest();

  console.log(`[READER_STRESS_CORPUS] generated fixtures under ${path.relative(ROOT, CORPUS_DIR)}`);
}

main().catch((error) => {
  console.error('[READER_STRESS_CORPUS][FAIL]', error);
  process.exit(1);
});
