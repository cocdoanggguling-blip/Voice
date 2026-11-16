import ePub, { type Book } from 'epubjs';
import JSZip from 'jszip';
import type {
  BookMetadata,
  BookSearchMatch,
  ChapterMeta,
  InlineFormatSpan,
  ParsedParagraph,
  SentenceSegment,
  TextReplaceRule,
  TocItem,
} from '../types/reader';
import { computeSha1Hex } from '../utils/bookMetrics';
import {
  applyNonTtsRulesToPlainText,
  applyTextReplaceRulesToParagraph,
  type BookReplaceContext,
  type ChapterParagraphInput,
} from '../utils/textReplace';
import {
  normalizeBookLocale,
  segmentParagraphs,
  type ParagraphInputEntry,
} from '../utils/textSegmentation';

export interface EpubReplaceOptions {
  rules: TextReplaceRule[];
  bookCtx: BookReplaceContext;
}

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
 * Walks an HTML block node to extract collapsed-whitespace text alongside
 * exact UTF-16 character spans for italic (em/i) and bold (strong/b).
 */
function extractTextAndFormats(root: Element): {
  text: string;
  inlineFormats: InlineFormatSpan[];
} {
  let raw = '';
  const spans: InlineFormatSpan[] = [];
  let prevWasSpace = true;

  function walk(node: Node, italic: boolean, bold: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue || '';
      for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        const isSpace = /\s/.test(ch);
        if (isSpace) {
          if (!prevWasSpace) {
            raw += ' ';
            prevWasSpace = true;
          }
        } else {
          const idx = raw.length;
          raw += ch;
          prevWasSpace = false;
          if (italic || bold) {
            const last = spans[spans.length - 1];
            if (
              last &&
              last.end === idx &&
              Boolean(last.italic) === italic &&
              Boolean(last.bold) === bold
            ) {
              last.end = idx + 1;
            } else {
              spans.push({
                start: idx,
                end: idx + 1,
                ...(italic ? { italic: true } : {}),
                ...(bold ? { bold: true } : {}),
              });
            }
          }
        }
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    if (tag === 'br') {
      if (!prevWasSpace) {
        raw += ' ';
        prevWasSpace = true;
      }
      return;
    }

    const nextItalic = italic || tag === 'em' || tag === 'i';
    const nextBold = bold || tag === 'strong' || tag === 'b';
    for (let c = 0; c < el.childNodes.length; c++) {
      walk(el.childNodes[c], nextItalic, nextBold);
    }
  }

  walk(root, false, false);
  const trimmed = raw.trimEnd();
  const maxLen = trimmed.length;
  const clampedSpans = spans
    .filter((s) => s.start < maxLen)
    .map((s) => ({ ...s, end: Math.min(maxLen, s.end) }));

  return { text: trimmed, inlineFormats: clampedSpans };
}

/**
 * Parses an EPUB ArrayBuffer via epub.js to extract metadata, embedded cover,
 * SHA-1 hash, zip file count, spine chapters, and file size.
 */
export async function parseEpubMetadata(
  buffer: ArrayBuffer,
  fileNameFallback: string,
  idOverride?: string,
  isSample = false,
  filePath?: string
): Promise<BookMetadata> {
  const [sha1, fileCount] = await Promise.all([
    computeSha1Hex(buffer),
    JSZip.loadAsync(buffer.slice(0))
      .then((zip) => Object.values(zip.files).filter((f) => !f.dir).length)
      .catch(() => undefined),
  ]);

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
    const metaDesc = (meta as unknown as { description?: string }).description;

    const rawLang = typeof meta.language === 'string' ? meta.language : String(meta.language ?? '');
    return {
      id: idOverride ?? `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: meta.title?.trim() || cleanFallback,
      author: meta.creator?.trim() || 'Penulis Tidak Diketahui',
      language: normalizeBookLocale(rawLang),
      coverDataUrl,
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      totalChapters: Math.max(1, spineItems.length),
      currentChapterIndex: 0,
      progressPercent: 0,
      isSample,
      fileSizeBytes: buffer.byteLength,
      fileName: fileNameFallback,
      sha1,
      filePath: filePath || fileNameFallback,
      fileCount: fileCount ?? Math.max(1, spineItems.length),
      annotation: metaDesc?.trim() || '',
      isFavorite: false,
      isFinished: false,
      collections: [],
    };
  } finally {
    try {
      await Promise.race([
        book.opened.catch(() => undefined),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      book.destroy();
    } catch {
      // Ignore teardown errors
    }
  }
}

/**
 * Opens an EPUB ArrayBuffer for active reading, returning the epubjs Book
 * instance alongside indexed spine chapters and mapped TOC items.
 */
export async function openEpubForReading(buffer: ArrayBuffer): Promise<OpenedEpubBook> {
  const book = ePub(buffer.slice(0));
  await book.ready;
  await Promise.race([
    book.opened.catch(() => undefined),
    new Promise((r) => setTimeout(r, 1500)),
  ]);

  const spine = await book.loaded.spine;
  const nav = await book.loaded.navigation;

  const spineItems = (
    (spine as unknown as {
      spineItems?: Array<{ index: number; idref: string; href: string }>;
    }).spineItems ?? []
  );

  const hrefToIndex = new Map<string, number>();
  spineItems.forEach((item, idx) => {
    hrefToIndex.set(normalizeHref(item.href), idx);
  });

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

  walkToc(
    (nav?.toc ?? []) as Array<{ id?: string; label?: string; href?: string; subitems?: unknown[] }>,
    0
  );

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

function detectElementRole(el: Element, text: string): { isFootnote: boolean; isHeaderLike: boolean } {
  const cls = (el.getAttribute('class') || '').toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();
  const epubType = (el.getAttribute('epub:type') || '').toLowerCase();

  const inFootnoteParent = Boolean(
    el.closest('aside, .footnote, .footnotes, [role="doc-footnote"], [role="doc-endnotes"]')
  );
  const isFootnote =
    inFootnoteParent ||
    cls.includes('footnote') ||
    cls.includes('endnote') ||
    role.includes('footnote') ||
    epubType.includes('footnote') ||
    /^\[\d+\]\s+/.test(text);

  const inHeader = Boolean(el.closest('header, .running-header, [role="doc-pageheader"]'));
  const isHeaderLike =
    inHeader ||
    cls.includes('running-header') ||
    cls.includes('pageheader') ||
    role.includes('doc-pageheader');

  return { isFootnote, isHeaderLike };
}

async function loadChapterDocument(book: Book, chapterIndex: number): Promise<{
  rootElement: Element | null;
  unload: () => void;
}> {
  const section = book.spine.get(chapterIndex);
  if (!section) {
    return { rootElement: null, unload: () => undefined };
  }
  try {
    const loaded = await section.load(book.load.bind(book));
    let doc: Document | null = null;
    if (loaded instanceof Document) {
      doc = loaded;
    } else if (typeof loaded === 'string') {
      const parser = new DOMParser();
      doc = parser.parseFromString(loaded, 'application/xhtml+xml');
      if (doc.querySelector('parsererror')) {
        doc = parser.parseFromString(loaded, 'text/html');
      }
    } else if (loaded && typeof loaded === 'object' && 'body' in loaded) {
      doc = (loaded as unknown as { ownerDocument?: Document }).ownerDocument ?? null;
    }
    const rootElement = doc?.body || (loaded instanceof Element ? loaded : null);
    return {
      rootElement,
      unload: () => {
        try {
          section.unload();
        } catch {
          // Ignore unload errors
        }
      },
    };
  } catch {
    return {
      rootElement: null,
      unload: () => {
        try {
          section.unload();
        } catch {
          // Ignore unload errors
        }
      },
    };
  }
}

function extractChapterEntriesFromRoot(rootElement: Element): {
  entries: ParagraphInputEntry[];
  detectedHeading?: string;
} {
  const entries: ParagraphInputEntry[] = [];
  let detectedHeading: string | undefined;

  const blocks = rootElement.querySelectorAll('h1, h2, h3, h4, p, blockquote, li, aside');
  if (blocks.length > 0) {
    blocks.forEach((el) => {
      const tagName = el.tagName.toLowerCase();
      if (tagName === 'p' && el.closest('blockquote, li, aside')) return;
      if (tagName === 'aside' && el.querySelector('p')) return;

      const { text, inlineFormats } = extractTextAndFormats(el);
      if (!text) return;

      let mappedTag: ParsedParagraph['tag'] = 'p';
      if (tagName === 'h1') mappedTag = 'h1';
      else if (tagName === 'h2') mappedTag = 'h2';
      else if (tagName === 'h3' || tagName === 'h4') mappedTag = 'h3';
      else if (tagName === 'blockquote') mappedTag = 'blockquote';

      if (!detectedHeading && (tagName === 'h1' || tagName === 'h2')) {
        detectedHeading = text;
      }

      const flags = detectElementRole(el, text);
      entries.push({
        tag: mappedTag,
        text,
        inlineFormats,
        isFootnote: flags.isFootnote,
        isHeaderLike: flags.isHeaderLike,
      });
    });
  } else {
    const fallbackText = (rootElement.textContent || '').trim();
    fallbackText.split(/\n{2,}/).forEach((chunk) => {
      const clean = chunk.replace(/\s+/g, ' ').trim();
      if (clean) entries.push({ tag: 'p', text: clean });
    });
  }

  return { entries, detectedHeading };
}

function applyReplaceOptionsToEntries(
  entries: ParagraphInputEntry[],
  chapterIndex: number,
  replaceOptions?: EpubReplaceOptions
): {
  entries: ParagraphInputEntry[];
  appliedCount: number;
  skippedCount: number;
} {
  if (!replaceOptions || replaceOptions.rules.length === 0) {
    return { entries, appliedCount: 0, skippedCount: 0 };
  }

  let cursor = 0;
  let totalApplied = 0;
  let totalSkipped = 0;
  const transformed: ParagraphInputEntry[] = [];

  for (let pIdx = 0; pIdx < entries.length; pIdx++) {
    const entry = entries[pIdx];
    const cleanOrig = entry.text.replace(/\s+/g, ' ').trim();
    if (!cleanOrig) continue;

    const res = applyTextReplaceRulesToParagraph({
      text: cleanOrig,
      inlineFormats: entry.inlineFormats,
      chapterIndex,
      paragraphIndex: pIdx,
      paragraphChapterStartChar: cursor,
      rules: replaceOptions.rules,
      bookCtx: replaceOptions.bookCtx,
      ttsOnly: false,
    });

    totalApplied += res.appliedCount;
    totalSkipped += res.skippedCount;
    cursor += cleanOrig.length + 2;

    if (res.text.trim()) {
      transformed.push({
        ...entry,
        text: res.text,
        inlineFormats: res.inlineFormats,
      });
    }
  }

  return { entries: transformed, appliedCount: totalApplied, skippedCount: totalSkipped };
}

/**
 * Loads a spine section via epubjs and extracts clean readable paragraphs
 * with inline formatting, non-destructive Find & Replace rules, footnote/header
 * tags, and tokenized sentences/words.
 */
export async function loadChapterSegments(
  book: Book,
  chapterIndex: number,
  locale = 'id',
  replaceOptions?: EpubReplaceOptions
): Promise<{
  paragraphs: ParsedParagraph[];
  allSentences: SentenceSegment[];
  chapterTitle?: string;
  totalChars: number;
  appliedReplaceCount: number;
  skippedReplaceCount: number;
}> {
  const { rootElement, unload } = await loadChapterDocument(book, chapterIndex);
  if (!rootElement) {
    unload();
    return {
      paragraphs: [],
      allSentences: [],
      totalChars: 0,
      appliedReplaceCount: 0,
      skippedReplaceCount: 0,
    };
  }

  const { entries: rawEntries, detectedHeading } = extractChapterEntriesFromRoot(rootElement);
  unload();

  const safeLocale = normalizeBookLocale(locale);
  const replaced = applyReplaceOptionsToEntries(rawEntries, chapterIndex, replaceOptions);
  const segmented = segmentParagraphs(replaced.entries, safeLocale);

  const chapterTitle =
    detectedHeading && replaceOptions && replaceOptions.rules.length > 0
      ? applyNonTtsRulesToPlainText(
          detectedHeading,
          replaceOptions.rules,
          replaceOptions.bookCtx,
          chapterIndex
        )
      : detectedHeading;

  return {
    paragraphs: segmented.paragraphs,
    allSentences: segmented.allSentences,
    totalChars: segmented.totalChars,
    chapterTitle,
    appliedReplaceCount: replaced.appliedCount,
    skippedReplaceCount: replaced.skippedCount,
  };
}

/**
 * Extracts raw normalized paragraphs across chapters (for live Find & Replace counts & preview).
 */
export async function extractAllChaptersForPreview(
  book: Book,
  chapters: ChapterMeta[],
  isCancelled: () => boolean,
  existingRules?: EpubReplaceOptions
): Promise<ChapterParagraphInput[]> {
  const result: ChapterParagraphInput[] = [];
  for (let i = 0; i < chapters.length; i++) {
    if (isCancelled()) return result;
    const { rootElement, unload } = await loadChapterDocument(book, i);
    const paraList: ChapterParagraphInput['paragraphs'] = [];
    if (rootElement) {
      const { entries } = extractChapterEntriesFromRoot(rootElement);
      const effective = existingRules
        ? applyReplaceOptionsToEntries(entries, i, existingRules).entries
        : entries;
      let cursor = 0;
      effective.forEach((e, pIdx) => {
        const clean = e.text.replace(/\s+/g, ' ').trim();
        if (!clean) return;
        paraList.push({
          paragraphIndex: pIdx,
          text: clean,
          chapterStartChar: cursor,
        });
        cursor += clean.length + 2;
      });
    }
    unload();
    result.push({
      chapterIndex: i,
      chapterTitle: chapters[i]?.title || `Bab ${i + 1}`,
      paragraphs: paraList,
    });
    if (i % 10 === 9) {
      await new Promise((r) => setTimeout(r, 4));
    }
  }
  return result;
}

/**
 * Lazily scans all chapter character lengths in batched micro-yields so
 * virtual page computation remains smooth even for 200+ chapter books.
 */
export async function computeAllChapterCharLengths(
  book: Book,
  totalChapters: number,
  isCancelled: () => boolean,
  replaceOptions?: EpubReplaceOptions
): Promise<number[]> {
  const lengths: number[] = new Array(totalChapters).fill(1500);
  const BATCH_SIZE = 8;

  for (let i = 0; i < totalChapters; i += BATCH_SIZE) {
    if (isCancelled()) return lengths;
    const end = Math.min(totalChapters, i + BATCH_SIZE);
    for (let j = i; j < end; j++) {
      if (isCancelled()) return lengths;
      const { rootElement, unload } = await loadChapterDocument(book, j);
      if (rootElement) {
        if (replaceOptions && replaceOptions.rules.length > 0) {
          const { entries } = extractChapterEntriesFromRoot(rootElement);
          const replaced = applyReplaceOptionsToEntries(entries, j, replaceOptions);
          const totalLen = replaced.entries.reduce((acc, e) => acc + e.text.length + 2, 0);
          lengths[j] = Math.max(1, totalLen - 2);
        } else {
          const len = (rootElement.textContent || '').replace(/\s+/g, ' ').trim().length;
          lengths[j] = Math.max(1, len);
        }
      }
      unload();
    }
    await new Promise((r) => setTimeout(r, 8));
  }
  return lengths;
}

/**
 * Searches full text across all spine chapters of the opened EPUB (with active rules applied).
 */
export async function searchInBook(
  book: Book,
  chapters: ChapterMeta[],
  query: string,
  isCancelled: () => boolean,
  maxResults = 60,
  replaceOptions?: EpubReplaceOptions
): Promise<BookSearchMatch[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const matches: BookSearchMatch[] = [];
  for (let i = 0; i < chapters.length; i++) {
    if (isCancelled() || matches.length >= maxResults) break;
    const { rootElement, unload } = await loadChapterDocument(book, i);
    if (rootElement) {
      let text: string;
      if (replaceOptions && replaceOptions.rules.length > 0) {
        const { entries } = extractChapterEntriesFromRoot(rootElement);
        const replaced = applyReplaceOptionsToEntries(entries, i, replaceOptions);
        text = replaced.entries.map((e) => e.text).join('\n\n');
      } else {
        text = (rootElement.textContent || '').replace(/\s+/g, ' ').trim();
      }
      const lower = text.toLowerCase();
      let pos = 0;
      let perChap = 0;
      while (perChap < 6 && matches.length < maxResults) {
        const hit = lower.indexOf(q, pos);
        if (hit === -1) break;
        const snippetStart = Math.max(0, hit - 45);
        const snippetEnd = Math.min(text.length, hit + q.length + 75);
        const prefix = snippetStart > 0 ? '…' : '';
        const suffix = snippetEnd < text.length ? '…' : '';
        matches.push({
          chapterIndex: i,
          chapterTitle: chapters[i]?.title || `Bab ${i + 1}`,
          charOffset: hit,
          snippet: `${prefix}${text.slice(snippetStart, snippetEnd)}${suffix}`,
        });
        pos = hit + q.length;
        perChap++;
      }
    }
    unload();
    if (i % 10 === 9) {
      await new Promise((r) => setTimeout(r, 4));
    }
  }
  return matches;
}

function resolveZipRelativePath(baseDir: string, relHref: string): string {
  const decoded = decodeURIComponent(relHref.split('#')[0]).replace(/^\/+/, '');
  if (!baseDir) return decoded;
  const parts = `${baseDir}/${decoded}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

/**
 * Creates a modified EPUB copy (leaving original IndexedDB buffer untouched)
 * with active non-TTS TextReplaceRules baked into XHTML spine files and optional TOC.
 */
export async function exportEditedEpubBlob(
  originalBuffer: ArrayBuffer,
  rules: TextReplaceRule[],
  bookCtx: BookReplaceContext,
  applyToToc: boolean
): Promise<{ blob: Blob; appliedCount: number; skippedCount: number }> {
  const zip = await JSZip.loadAsync(originalBuffer.slice(0));
  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  const activeVisualRules = rules.filter((r) => r.enabled && !r.ttsOnly);
  if (activeVisualRules.length === 0) {
    const outBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
    return { blob: outBlob, appliedCount: 0, skippedCount: 0 };
  }

  let appliedCount = 0;
  let skippedCount = 0;

  // Locate OPF file via META-INF/container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  let opfPath = '';
  if (containerXml) {
    const cDoc = parser.parseFromString(containerXml, 'application/xml');
    opfPath = cDoc.querySelector('rootfile')?.getAttribute('full-path') || '';
  }

  const spineChapterPaths: Array<{ zipPath: string; chapterIndex: number }> = [];
  const tocPaths: string[] = [];

  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath)!.async('string');
    const opfDoc = parser.parseFromString(opfXml, 'application/xml');
    const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';

    const manifestMap = new Map<string, { href: string; mediaType: string; properties: string }>();
    opfDoc.querySelectorAll('manifest > item').forEach((item) => {
      const id = item.getAttribute('id') || '';
      const href = item.getAttribute('href') || '';
      const mediaType = item.getAttribute('media-type') || '';
      const properties = item.getAttribute('properties') || '';
      if (id && href) {
        manifestMap.set(id, { href, mediaType, properties });
      }
      if (
        mediaType.includes('ncx') ||
        properties.split(/\s+/).includes('nav')
      ) {
        tocPaths.push(resolveZipRelativePath(opfDir, href));
      }
    });

    const itemrefs = Array.from(opfDoc.querySelectorAll('spine > itemref'));
    itemrefs.forEach((ref, idx) => {
      const idref = ref.getAttribute('idref') || '';
      const item = manifestMap.get(idref);
      if (item) {
        spineChapterPaths.push({
          zipPath: resolveZipRelativePath(opfDir, item.href),
          chapterIndex: idx,
        });
      }
    });
  }

  // Fallback if OPF parsing didn't populate spine
  if (spineChapterPaths.length === 0) {
    const htmlKeys = Object.keys(zip.files)
      .filter((k) => /\.(xhtml|html|htm)$/i.test(k) && !zip.files[k].dir)
      .sort();
    htmlKeys.forEach((k, idx) => spineChapterPaths.push({ zipPath: k, chapterIndex: idx }));
  }

  const tocPathSet = new Set(tocPaths);

  for (const { zipPath, chapterIndex } of spineChapterPaths) {
    const file = zip.file(zipPath);
    if (!file) continue;
    const rawXml = await file.async('string');
    const isXhtml = /\.xhtml$/i.test(zipPath) || rawXml.includes('xmlns="http://www.w3.org/1999/xhtml"');
    const doc = parser.parseFromString(rawXml, isXhtml ? 'application/xhtml+xml' : 'text/html');
    const body = doc.body || doc.documentElement;
    if (!body) continue;

    const blocks = Array.from(body.querySelectorAll('h1, h2, h3, h4, p, blockquote, li, aside'));
    let charCursor = 0;

    const processTextNodesSafe = (
      el: Element,
      pIdx: number,
      pStart: number
    ) => {
      // Collect leaf text nodes inside this block, skipping script/style
      const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      let n = walker.nextNode();
      while (n) {
        const parentTag = n.parentElement?.tagName.toLowerCase();
        if (parentTag !== 'script' && parentTag !== 'style' && n.nodeValue?.trim()) {
          textNodes.push(n as Text);
        }
        n = walker.nextNode();
      }

      if (textNodes.length === 1) {
        const tn = textNodes[0];
        const orig = tn.nodeValue || '';
        const res = applyTextReplaceRulesToParagraph({
          text: orig,
          chapterIndex,
          paragraphIndex: pIdx,
          paragraphChapterStartChar: pStart,
          rules: activeVisualRules,
          bookCtx,
          ttsOnly: false,
        });
        if (res.text !== orig) {
          tn.nodeValue = res.text;
          appliedCount += res.appliedCount;
        }
        skippedCount += res.skippedCount;
      } else if (textNodes.length > 1) {
        // Multi-node block: apply safely per text node; detect if whole block matches more than node sum
        const fullBlockText = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const blockRes = applyTextReplaceRulesToParagraph({
          text: fullBlockText,
          chapterIndex,
          paragraphIndex: pIdx,
          paragraphChapterStartChar: pStart,
          rules: activeVisualRules,
          bookCtx,
          ttsOnly: false,
        });

        let localApplied = 0;
        for (const tn of textNodes) {
          const orig = tn.nodeValue || '';
          const nodeRes = applyTextReplaceRulesToParagraph({
            text: orig,
            chapterIndex,
            paragraphIndex: pIdx,
            paragraphChapterStartChar: pStart,
            rules: activeVisualRules,
            bookCtx,
            ttsOnly: false,
          });
          if (nodeRes.text !== orig) {
            tn.nodeValue = nodeRes.text;
            localApplied += nodeRes.appliedCount;
          }
        }
        appliedCount += localApplied;
        if (blockRes.appliedCount > localApplied) {
          // Cross-element-tag occurrence could not be modified inside a single node safely -> skipped
          skippedCount += blockRes.appliedCount - localApplied;
        }
      }
    };

    blocks.forEach((el, idx) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'p' && el.closest('blockquote, li, aside')) return;
      if (tag === 'aside' && el.querySelector('p')) return;
      const len = (el.textContent || '').replace(/\s+/g, ' ').trim().length;
      if (!len) return;
      if (!(tocPathSet.has(zipPath) && !applyToToc)) {
        processTextNodesSafe(el, idx, charCursor);
      }
      charCursor += len + 2;
    });

    const serialized = serializer.serializeToString(doc);
    zip.file(zipPath, serialized);
  }

  if (applyToToc) {
    for (const tocPath of tocPaths) {
      const file = zip.file(tocPath);
      if (!file) continue;
      const raw = await file.async('string');
      if (tocPath.toLowerCase().endsWith('.ncx')) {
        const doc = parser.parseFromString(raw, 'application/xml');
        doc.querySelectorAll('navLabel > text').forEach((el) => {
          const orig = el.textContent || '';
          const next = applyNonTtsRulesToPlainText(orig, activeVisualRules, bookCtx, 0);
          if (next !== orig) el.textContent = next;
        });
        zip.file(tocPath, serializer.serializeToString(doc));
      } else if (!spineChapterPaths.some((s) => s.zipPath === tocPath)) {
        const doc = parser.parseFromString(raw, 'application/xhtml+xml');
        doc.querySelectorAll('nav a, nav span').forEach((el) => {
          if (el.childElementCount === 0 && el.textContent) {
            const orig = el.textContent;
            const next = applyNonTtsRulesToPlainText(orig, activeVisualRules, bookCtx, 0);
            if (next !== orig) el.textContent = next;
          }
        });
        zip.file(tocPath, serializer.serializeToString(doc));
      }
    }
  }

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  return { blob, appliedCount, skippedCount };
}
