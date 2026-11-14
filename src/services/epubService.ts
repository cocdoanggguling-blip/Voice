import ePub, { type Book } from 'epubjs';
import type {
  BookMetadata,
  ChapterMeta,
  ParsedParagraph,
  SentenceSegment,
  TocItem,
} from '../types/reader';
import { segmentParagraphs } from '../utils/textSegmentation';

export interface OpenedEpubBook {
  book: Book;
  chapters: ChapterMeta[];
  toc: TocItem[];
}

async function blobUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function normalizeHref(href: string): string {
  return href.split('#')[0].replace(/^\/+/, '');
}

/**
 * Parses an EPUB ArrayBuffer via epub.js to extract metadata, embedded cover,
 * spine chapters, and flattened table of contents.
 */
export async function parseEpubMetadata(
  buffer: ArrayBuffer,
  fileNameFallback: string,
  idOverride?: string,
  isSample = false
): Promise<BookMetadata> {
  const book = ePub(buffer.slice(0));
  try {
    await book.ready;
    const meta = await book.loaded.metadata;
    const spine = await book.loaded.spine;

    let coverDataUrl: string | null = null;
    try {
      const coverUrl = await book.coverUrl();
      if (coverUrl) {
        coverDataUrl = await blobUrlToDataUrl(coverUrl);
      }
    } catch {
      coverDataUrl = null;
    }

    const spineItems = (spine as unknown as { spineItems?: Array<unknown> }).spineItems ?? [];
    const cleanFallback = fileNameFallback.replace(/\.epub$/i, '').trim() || 'Buku Tanpa Judul';

    return {
      id: idOverride ?? `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: meta.title?.trim() || cleanFallback,
      author: meta.creator?.trim() || 'Penulis Tidak Diketahui',
      language: meta.language?.trim() || 'id',
      coverDataUrl,
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      totalChapters: Math.max(1, spineItems.length),
      currentChapterIndex: 0,
      progressPercent: 0,
      isSample,
    };
  } finally {
    book.destroy();
  }
}

/**
 * Opens an EPUB ArrayBuffer for active reading, returning the epubjs Book
 * instance alongside indexed spine chapters and mapped TOC items.
 */
export async function openEpubForReading(buffer: ArrayBuffer): Promise<OpenedEpubBook> {
  const book = ePub(buffer.slice(0));
  await book.ready;

  const spine = await book.loaded.spine;
  const nav = await book.loaded.navigation;

  const spineItems = (
    (spine as unknown as {
      spineItems?: Array<{ index: number; idref: string; href: string }>;
    }).spineItems ?? []
  );

  // Build href -> spine index map
  const hrefToIndex = new Map<string, number>();
  spineItems.forEach((item, idx) => {
    hrefToIndex.set(normalizeHref(item.href), idx);
  });

  // Flatten navigation TOC
  const toc: TocItem[] = [];
  const labelByIndex = new Map<number, string>();

  function walkToc(
    items: Array<{ id?: string; label?: string; href?: string; subitems?: unknown[] }>,
    level: number
  ) {
    for (const item of items) {
      const cleanHref = normalizeHref(item.href || '');
      let matchedIndex = hrefToIndex.get(cleanHref);
      if (matchedIndex === undefined && cleanHref) {
        for (const [spineHref, idx] of hrefToIndex.entries()) {
          if (spineHref.endsWith(cleanHref) || cleanHref.endsWith(spineHref)) {
            matchedIndex = idx;
            break;
          }
        }
      }
      const chapterIndex = matchedIndex ?? 0;
      const label = (item.label || `Bagian ${toc.length + 1}`).trim();
      if (!labelByIndex.has(chapterIndex) && matchedIndex !== undefined) {
        labelByIndex.set(chapterIndex, label);
      }
      toc.push({
        id: item.id || `toc-${toc.length}`,
        label,
        href: item.href || '',
        chapterIndex,
        level,
      });
      if (Array.isArray(item.subitems) && item.subitems.length > 0) {
        walkToc(item.subitems as typeof items, level + 1);
      }
    }
  }

  walkToc((nav?.toc ?? []) as Array<{ id?: string; label?: string; href?: string; subitems?: unknown[] }>, 0);

  const chapters: ChapterMeta[] = spineItems.map((item, idx) => ({
    index: idx,
    idref: item.idref || `chap-${idx}`,
    href: item.href,
    title: labelByIndex.get(idx) || `Bab ${idx + 1}`,
  }));

  if (toc.length === 0) {
    chapters.forEach((ch) => {
      toc.push({
        id: `auto-toc-${ch.index}`,
        label: ch.title,
        href: ch.href,
        chapterIndex: ch.index,
        level: 0,
      });
    });
  }

  return { book, chapters, toc };
}

/**
 * Loads a spine section via epubjs and extracts clean readable paragraphs
 * tokenized into sentences and words for synced TTS & instant translation.
 */
export async function loadChapterSegments(
  book: Book,
  chapterIndex: number
): Promise<{ paragraphs: ParsedParagraph[]; allSentences: SentenceSegment[]; chapterTitle?: string }> {
  const section = book.spine.get(chapterIndex);
  if (!section) {
    return { paragraphs: [], allSentences: [] };
  }

  const loaded = await section.load(book.load.bind(book));
  let doc: Document | null = null;

  if (loaded instanceof Document) {
    doc = loaded;
  } else if (typeof loaded === 'string') {
    doc = new DOMParser().parseFromString(loaded, 'application/xhtml+xml');
  } else if (loaded && typeof loaded === 'object' && 'body' in loaded) {
    doc = (loaded as unknown as { ownerDocument?: Document }).ownerDocument ?? null;
  }

  const rootElement = doc?.body || (loaded instanceof Element ? loaded : null);
  if (!rootElement) {
    return { paragraphs: [], allSentences: [] };
  }

  const entries: Array<{ tag: ParsedParagraph['tag']; text: string }> = [];
  let detectedHeading: string | undefined;

  const blocks = rootElement.querySelectorAll('h1, h2, h3, h4, p, blockquote, li');
  if (blocks.length > 0) {
    blocks.forEach((el) => {
      // Avoid double counting nested p inside blockquote/li
      if (el.tagName.toLowerCase() === 'p' && el.closest('blockquote, li')) {
        return;
      }
      const rawText = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!rawText) return;

      const tagName = el.tagName.toLowerCase();
      let mappedTag: ParsedParagraph['tag'] = 'p';
      if (tagName === 'h1') mappedTag = 'h1';
      else if (tagName === 'h2') mappedTag = 'h2';
      else if (tagName === 'h3' || tagName === 'h4') mappedTag = 'h3';
      else if (tagName === 'blockquote') mappedTag = 'blockquote';

      if (!detectedHeading && (tagName === 'h1' || tagName === 'h2')) {
        detectedHeading = rawText;
      }

      entries.push({ tag: mappedTag, text: rawText });
    });
  } else {
    const fallbackText = (rootElement.textContent || '').trim();
    fallbackText.split(/\n{2,}/).forEach((chunk) => {
      const clean = chunk.replace(/\s+/g, ' ').trim();
      if (clean) entries.push({ tag: 'p', text: clean });
    });
  }

  const segmented = segmentParagraphs(entries);
  section.unload();

  return {
    ...segmented,
    chapterTitle: detectedHeading,
  };
}
