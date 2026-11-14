import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBookVirtualPages,
  compareNaturalTitles,
  computeSha1Hex,
  extractSeriesName,
  findTargetFromVirtualPage,
  formatFileSizeId,
  resolveVirtualPageLocation,
} from './bookMetrics';
import { hyphenateIndonesianWord } from './hyphenationId';

test('natural sort orders numbered volumes like {1} (1-200), {2} (201-400), {10} (1801-2000)', () => {
  const titles = [
    'Kisah Nusantara {10} (1801-2000)',
    'Kisah Nusantara {2} (201-400)',
    'Kisah Nusantara {1} (1-200)',
    'Kisah Nusantara {3} (401-600)',
  ];
  const sorted = [...titles].sort(compareNaturalTitles);
  assert.deepEqual(sorted, [
    'Kisah Nusantara {1} (1-200)',
    'Kisah Nusantara {2} (201-400)',
    'Kisah Nusantara {3} (401-600)',
    'Kisah Nusantara {10} (1801-2000)',
  ]);
  assert.equal(extractSeriesName({ title: 'Kisah Nusantara {2} (201-400)' }), 'Kisah Nusantara');
});

test('virtual page calculation remains consistent across 200+ chapters and maps bidirectional offsets', () => {
  const lengths = Array.from({ length: 220 }, () => 5000);
  const summary = calculateBookVirtualPages(lengths, 1000);
  assert.equal(summary.totalVirtualPages, 1100);
  const loc = resolveVirtualPageLocation(summary, 35, 2100);
  assert.equal(loc.chapterLocalPage, 3);
  assert.equal(loc.bookVirtualPage, 35 * 5 + 3);
  const target = findTargetFromVirtualPage(summary, 178);
  assert.equal(target.chapterIndex, 35);
});

test('Indonesian hyphenation inserts soft hyphens cleanly inside multi-syllable words', () => {
  const out = hyphenateIndonesianWord('perjalanan');
  assert.equal(out.includes('\u00AD'), true);
  assert.equal(out.replace(/\u00AD/g, ''), 'perjalanan');
  assert.equal(hyphenateIndonesianWord('12345'), '12345');
});

test('SHA-1 and Indonesian file size formatting produce expected formats', async () => {
  const bytes = new TextEncoder().encode('novelvoice-epub-sample');
  const hex = await computeSha1Hex(bytes.buffer);
  assert.ok(hex.length >= 24);
  assert.equal(formatFileSizeId(1153433), '1,1 MB');
});
