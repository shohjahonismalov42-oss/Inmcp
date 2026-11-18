import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyContentType,
  extractFilename,
  sanitizeFilename,
} from './fileDownload';

test('extractFilename reads Content-Disposition and falls back to URL/MIME', () => {
  assert.equal(
    extractFilename('https://example.com/dl?id=1', 'attachment; filename="report-2026.pdf"'),
    'report-2026.pdf'
  );
  assert.equal(
    extractFilename(
      'https://example.com/dl',
      "attachment; filename*=UTF-8''o%CA%BBzbekcha%20fayl.csv"
    ),
    'oʻzbekcha_fayl.csv'
  );
  assert.equal(
    extractFilename('https://api.github.com/repos/a/b', null, 'application/json'),
    'b.json'
  );
});

test('classifyContentType separates text, raster images, and binaries', () => {
  assert.equal(classifyContentType('application/json; charset=utf-8'), 'text');
  assert.equal(classifyContentType('text/csv'), 'text');
  assert.equal(classifyContentType('image/png'), 'image');
  assert.equal(classifyContentType('image/jpeg'), 'image');
  assert.equal(classifyContentType('application/pdf'), 'binary');
  assert.equal(classifyContentType('application/zip'), 'binary');
});

test('sanitizeFilename removes unsafe path characters', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), '.._.._etc_passwd');
});
