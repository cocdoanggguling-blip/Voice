import type { BookMetadata, ReaderSettings } from '../types/reader';

export interface ChapterPageSpan {
  chapterIndex: number;
  startVirtualPage: number;
  endVirtualPage: number;
  pageCount: number;
  charLength: number;
}

export interface BookVirtualPageSummary {
  charsPerPage: number;
  totalVirtualPages: number;
  chapters: ChapterPageSpan[];
}

export function estimateCharsPerVirtualPage(
  settings: Pick<
    ReaderSettings,
    'fontSize' | 'lineHeightPercent' | 'margins' | 'twoPageSpread' | 'paragraphSpacingPx'
  >,
  viewportWidth = 390,
  viewportHeight = 844
): number {
  const horizMargin = (settings.margins?.left ?? 18) + (settings.margins?.right ?? 18);
  const vertMargin = (settings.margins?.top ?? 16) + (settings.margins?.bottom ?? 16) + 120;
  const usableW = Math.max(240, Math.min(820, viewportWidth - horizMargin));
  const usableH = Math.max(320, viewportHeight - vertMargin);

  const fontSize = Math.max(12, Math.min(40, settings.fontSize || 18));
  const lineH = fontSize * ((settings.lineHeightPercent || 170) / 100) + (settings.paragraphSpacingPx || 12) * 0.12;
  const charsPerLine = Math.max(24, Math.floor(usableW / (fontSize * 0.54)));
  const linesPerPage = Math.max(8, Math.floor(usableH / lineH));
  const spreadMultiplier = settings.twoPageSpread && viewportWidth >= 768 ? 1.85 : 1;

  return Math.max(280, Math.round(charsPerLine * linesPerPage * 0.85 * spreadMultiplier));
}

export function calculateBookVirtualPages(
  chapterCharLengths: number[],
  charsPerPage: number
): BookVirtualPageSummary {
  const safeCharsPerPage = Math.max(200, charsPerPage);
  const spans: ChapterPageSpan[] = [];
  let cursorPage = 1;

  for (let i = 0; i < chapterCharLengths.length; i++) {
    const len = Math.max(1, chapterCharLengths[i] || 1);
    const pageCount = Math.max(1, Math.ceil(len / safeCharsPerPage));
    const startVirtualPage = cursorPage;
    const endVirtualPage = startVirtualPage + pageCount - 1;
    spans.push({
      chapterIndex: i,
      startVirtualPage,
      endVirtualPage,
      pageCount,
      charLength: len,
    });
    cursorPage = endVirtualPage + 1;
  }

  return {
    charsPerPage: safeCharsPerPage,
    totalVirtualPages: Math.max(1, cursorPage - 1),
    chapters: spans,
  };
}

export function resolveVirtualPageLocation(
  summary: BookVirtualPageSummary,
  chapterIndex: number,
  charOffset: number
): {
  bookVirtualPage: number;
  totalVirtualPages: number;
  chapterLocalPage: number;
  chapterTotalPages: number;
} {
  const span = summary.chapters[chapterIndex];
  if (!span) {
    return {
      bookVirtualPage: 1,
      totalVirtualPages: summary.totalVirtualPages,
      chapterLocalPage: 1,
      chapterTotalPages: 1,
    };
  }
  const ratio = Math.max(0, Math.min(1, charOffset / Math.max(1, span.charLength)));
  const chapterLocalPage = Math.max(
    1,
    Math.min(span.pageCount, Math.floor(ratio * span.pageCount) + 1)
  );
  const bookVirtualPage = Math.min(
    summary.totalVirtualPages,
    span.startVirtualPage + chapterLocalPage - 1
  );
  return {
    bookVirtualPage,
    totalVirtualPages: summary.totalVirtualPages,
    chapterLocalPage,
    chapterTotalPages: span.pageCount,
  };
}

export function findTargetFromVirtualPage(
  summary: BookVirtualPageSummary,
  targetVirtualPage: number
): { chapterIndex: number; charOffset: number } {
  const clamped = Math.max(1, Math.min(summary.totalVirtualPages, Math.round(targetVirtualPage)));
  for (const span of summary.chapters) {
    if (clamped >= span.startVirtualPage && clamped <= span.endVirtualPage) {
      const localIdx = clamped - span.startVirtualPage;
      const ratio = span.pageCount <= 1 ? 0 : localIdx / span.pageCount;
      return {
        chapterIndex: span.chapterIndex,
        charOffset: Math.round(ratio * span.charLength),
      };
    }
  }
  return { chapterIndex: 0, charOffset: 0 };
}

/**
 * Extracts sortable segments for natural numeric ordering, handling formats like:
 * "{1} (1-200)", "{2} (201-400)", "{10} (1801-2000)", "Bab 2", "Vol. 12".
 */
const naturalCollator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' });

export function compareNaturalTitles(a: string, b: string): number {
  const normA = a.replace(/[{}\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  const normB = b.replace(/[{}\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  return naturalCollator.compare(normA, normB);
}

export function extractSeriesName(book: Pick<BookMetadata, 'title' | 'series'>): string {
  if (book.series && book.series.trim()) {
    return book.series.trim();
  }
  // Auto-detect series prefix before "{N}", "(1-200)", "Jilid N", "Vol. N", "#N"
  const cleaned = book.title
    .replace(/\{\d+\}.*$/i, '')
    .replace(/\(\d+\s*[-–]\s*\d+\).*$/i, '')
    .replace(/\b(?:vol(?:ume)?|jilid|bagian|buku|book|part)\.?\s*\d+.*$/i, '')
    .replace(/#\d+.*$/i, '')
    .trim();
  return cleaned || book.title.trim();
}

export function formatFileSizeId(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Ukuran tidak diketahui';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

export function formatIndoTimestamp(ts?: number): string {
  if (!ts) return 'Belum dibaca';
  const date = new Date(ts);
  const tanggal = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${tanggal} ${hh}.${mm}`;
}

export async function computeSha1Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
    const bytes = new Uint8Array(hashBuffer);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic FNV-based hex if crypto.subtle unavailable
  const view = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < view.length; i++) {
    h1 ^= view[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= view[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    view.length.toString(16).padStart(8, '0')
  );
}
