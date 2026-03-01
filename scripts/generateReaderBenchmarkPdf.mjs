#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'fixtures', 'reader-benchmark.pdf');

function createPdf() {
  const contentStream = [
    'BT',
    '/F1 28 Tf',
    '72 740 Td',
    '(BookTown Reader Benchmark Fixture) Tj',
    '0 -34 Td',
    '/F1 16 Tf',
    '(Deterministic PDF for CI timing gates.) Tj',
    'ET',
    '',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}endstream`,
  ];

  let body = '%PDF-1.4\n';
  body += '%\xE2\xE3\xCF\xD3\n';

  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  body += 'trailer\n';
  body += `<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += 'startxref\n';
  body += `${xrefOffset}\n`;
  body += '%%EOF\n';

  return Buffer.from(body, 'binary');
}

function main() {
  const pdf = createPdf();
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, pdf);
  console.log(`[READER_BENCH_FIXTURE] wrote ${OUTPUT_PATH} (${pdf.byteLength} bytes)`);
}

main();
