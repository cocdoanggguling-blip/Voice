import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  BookMetadata,
  BookmarkItem,
  CustomFontRecord,
  HighlightItem,
  ReaderPreset,
  ReaderSettings,
  ReadingPosition,
  TextReplaceRule,
  TtsSettings,
} from '../types/reader';
import { DEFAULT_FIND_REPLACE_SETTINGS } from '../utils/textReplace';
import { DEFAULT_UI_COLOR, normalizeHexColor } from '../utils/uiTheme';

interface NovelVoiceDB extends DBSchema {
  books: {
    key: string;
    value: BookMetadata;
    indexes: { 'by-lastRead': number };
  };
  bookFiles: {
    key: string;
    value: { id: string; buffer: ArrayBuffer };
  };
  positions: {
    key: string;
    value: ReadingPosition;
  };
  translations: {
    key: string;
    value: {
      key: string;
      translatedText: string;
      sourceLang: string;
      targetLang: string;
      createdAt: number;
    };
  };
  bookmarks: {
    key: string;
    value: BookmarkItem;
    indexes: { 'by-bookId': string };
  };
  highlights: {
    key: string;
    value: HighlightItem;
    indexes: { 'by-bookId': string };
  };
  customFonts: {
    key: string;
    value: CustomFontRecord;
  };
  chapterMetrics: {
    key: string;
    value: { bookId: string; lengths: number[]; updatedAt: number };
  };
  textReplaceRules: {
    key: string;
    value: TextReplaceRule;
    indexes: { 'by-priority': number; 'by-bookId': string };
  };
}

const DB_NAME = 'novelvoice_db';
const DB_VERSION = 3;
const READER_SETTINGS_KEY = 'novelvoice_reader_settings_v2';
const LEGACY_READER_SETTINGS_KEY = 'novelvoice_reader_settings_v1';
const TTS_SETTINGS_KEY = 'novelvoice_tts_settings_v2';
const LEGACY_TTS_SETTINGS_KEY = 'novelvoice_tts_settings_v1';
const PRESETS_KEY = 'novelvoice_reader_presets_v1';
const SEEDED_FLAG_KEY = 'novelvoice_samples_seeded_v1';

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'twilight',
  uiColor: DEFAULT_UI_COLOR,
  customBg: '#faf6ee',
  customText: '#231f20',
  customAccent: '#06b6d4',
  font: 'literata',
  fontSize: 18,
  fontWeight: 400,
  lineHeight: 1.7,
  lineHeightPercent: 170,
  readingMode: 'scroll',
  pageAnimation: 'horizontal',
  textAlign: 'justify',
  twoPageSpread: false,
  pageGapBorder: true,
  margins: { top: 20, right: 20, bottom: 24, left: 20 },
  paragraphSpacingPx: 14,
  orientationLock: 'auto',
  keepScreenOn: false,
  brightness: 1.0,
  brightnessCollapsed: false,
  autoScrollEnabled: false,
  autoScrollSpeedPxPerSec: 28,
  targetLanguage: 'id',
  paragraphTranslateEnabled: false,
  translationProvider: 'mymemory',
  libreTranslateUrl: 'https://libretranslate.com/translate',
  findReplaceDefaults: DEFAULT_FIND_REPLACE_SETTINGS,
};

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  voiceURI: '',
  langFilter: 'all',
  readingMode: 'flowing',
  chunkSizeChars: 800,
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  paragraphPauseMs: 300,
  commaPauseMs: 200,
  sentencePauseMs: 0,
  sleepTimerMinutes: 0,
  fadeOutBeforeStop: true,
  multiLangAuto: false,
  readFootnotes: true,
  skipHeadersAndFootnotes: false,
  skipParentheses: false,
  skipSymbolsAndQuotes: false,
  readChapterTitle: true,
  pronunciationDict: [],
};

let dbPromise: Promise<IDBPDatabase<NovelVoiceDB>> | null = null;

function getDb(): Promise<IDBPDatabase<NovelVoiceDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NovelVoiceDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('books')) {
          const store = db.createObjectStore('books', { keyPath: 'id' });
          store.createIndex('by-lastRead', 'lastReadAt');
        }
        if (!db.objectStoreNames.contains('bookFiles')) {
          db.createObjectStore('bookFiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('positions')) {
          db.createObjectStore('positions', { keyPath: 'bookId' });
        }
        if (!db.objectStoreNames.contains('translations')) {
          db.createObjectStore('translations', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          const bm = db.createObjectStore('bookmarks', { keyPath: 'id' });
          bm.createIndex('by-bookId', 'bookId');
        }
        if (!db.objectStoreNames.contains('highlights')) {
          const hl = db.createObjectStore('highlights', { keyPath: 'id' });
          hl.createIndex('by-bookId', 'bookId');
        }
        if (!db.objectStoreNames.contains('customFonts')) {
          db.createObjectStore('customFonts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('chapterMetrics')) {
          db.createObjectStore('chapterMetrics', { keyPath: 'bookId' });
        }
        if (!db.objectStoreNames.contains('textReplaceRules')) {
          const rules = db.createObjectStore('textReplaceRules', { keyPath: 'id' });
          rules.createIndex('by-priority', 'priority');
          rules.createIndex('by-bookId', 'bookId');
        }
      },
    });
  }
  return dbPromise;
}

export async function listBooks(): Promise<BookMetadata[]> {
  const db = await getDb();
  const books = await db.getAll('books');
  return books.sort((a, b) => b.lastReadAt - a.lastReadAt);
}

export async function saveBook(metadata: BookMetadata, buffer: ArrayBuffer): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['books', 'bookFiles'], 'readwrite');
  await tx.objectStore('books').put(metadata);
  await tx.objectStore('bookFiles').put({ id: metadata.id, buffer });
  await tx.done;
}

export async function findDuplicateBookBySha1(sha1: string): Promise<BookMetadata | undefined> {
  if (!sha1) return undefined;
  const books = await listBooks();
  return books.find((b) => b.sha1 && b.sha1 === sha1);
}

export async function updateBookMetadata(metadata: BookMetadata): Promise<void> {
  const db = await getDb();
  await db.put('books', metadata);
}

export async function getBookFile(bookId: string): Promise<ArrayBuffer | undefined> {
  const db = await getDb();
  const record = await db.get('bookFiles', bookId);
  return record?.buffer;
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = await getDb();
  const bms = await db.getAllFromIndex('bookmarks', 'by-bookId', bookId);
  const hls = await db.getAllFromIndex('highlights', 'by-bookId', bookId);
  const tx = db.transaction(
    ['books', 'bookFiles', 'positions', 'bookmarks', 'highlights', 'chapterMetrics'],
    'readwrite'
  );
  await tx.objectStore('books').delete(bookId);
  await tx.objectStore('bookFiles').delete(bookId);
  await tx.objectStore('positions').delete(bookId);
  await tx.objectStore('chapterMetrics').delete(bookId);
  for (const b of bms) await tx.objectStore('bookmarks').delete(b.id);
  for (const h of hls) await tx.objectStore('highlights').delete(h.id);
  await tx.done;
}

export async function getReadingPosition(bookId: string): Promise<ReadingPosition | undefined> {
  const db = await getDb();
  return db.get('positions', bookId);
}

export async function saveReadingPosition(position: ReadingPosition): Promise<void> {
  const db = await getDb();
  await db.put('positions', position);
}

// Bookmarks
export async function listBookmarks(bookId: string): Promise<BookmarkItem[]> {
  const db = await getDb();
  const items = await db.getAllFromIndex('bookmarks', 'by-bookId', bookId);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveBookmark(item: BookmarkItem): Promise<void> {
  const db = await getDb();
  await db.put('bookmarks', item);
}

export async function deleteBookmark(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('bookmarks', id);
}

// Highlights & Notes
export async function listHighlights(bookId: string): Promise<HighlightItem[]> {
  const db = await getDb();
  const items = await db.getAllFromIndex('highlights', 'by-bookId', bookId);
  return items.sort((a, b) => a.chapterIndex - b.chapterIndex || a.charOffset - b.charOffset);
}

export async function saveHighlight(item: HighlightItem): Promise<void> {
  const db = await getDb();
  await db.put('highlights', item);
}

export async function deleteHighlight(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('highlights', id);
}

// Custom Fonts (.ttf/.otf)
export async function listCustomFonts(): Promise<CustomFontRecord[]> {
  const db = await getDb();
  return db.getAll('customFonts');
}

export async function saveCustomFont(font: CustomFontRecord): Promise<void> {
  const db = await getDb();
  await db.put('customFonts', font);
}

export async function deleteCustomFont(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('customFonts', id);
}

// Cached Chapter Char Lengths for Virtual Pages
export async function getChapterMetrics(bookId: string): Promise<number[] | null> {
  const db = await getDb();
  const rec = await db.get('chapterMetrics', bookId);
  return rec?.lengths ?? null;
}

export async function saveChapterMetrics(bookId: string, lengths: number[]): Promise<void> {
  const db = await getDb();
  await db.put('chapterMetrics', { bookId, lengths, updatedAt: Date.now() });
}

export async function clearChapterMetrics(bookId: string): Promise<void> {
  const db = await getDb();
  await db.delete('chapterMetrics', bookId);
}

// Text Replace Rules (Non-Destructive Find & Replace)
export async function listTextReplaceRules(): Promise<TextReplaceRule[]> {
  const db = await getDb();
  const items = await db.getAll('textReplaceRules');
  return items.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
}

export async function saveTextReplaceRule(rule: TextReplaceRule): Promise<void> {
  const db = await getDb();
  await db.put('textReplaceRules', rule);
}

export async function saveManyTextReplaceRules(rules: TextReplaceRule[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('textReplaceRules', 'readwrite');
  for (const r of rules) {
    await tx.objectStore('textReplaceRules').put(r);
  }
  await tx.done;
}

export async function deleteTextReplaceRule(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('textReplaceRules', id);
}

export interface TextReplaceRulesExportPayload {
  app: 'NovelVoice';
  kind: 'textReplaceRules';
  version: 1;
  exportedAt: number;
  rules: TextReplaceRule[];
}

export function exportReplaceRulesJson(rules: TextReplaceRule[]): string {
  const payload: TextReplaceRulesExportPayload = {
    app: 'NovelVoice',
    kind: 'textReplaceRules',
    version: 1,
    exportedAt: Date.now(),
    rules,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importReplaceRulesJson(rawJson: string): Promise<number> {
  const parsed = JSON.parse(rawJson) as Partial<TextReplaceRulesExportPayload> | TextReplaceRule[];
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.rules)
      ? parsed.rules
      : null;

  if (!rawList) {
    throw new Error('Format JSON aturan ganti teks tidak valid.');
  }

  const now = Date.now();
  const existing = await listTextReplaceRules();
  let nextPriority = existing.reduce((max, r) => Math.max(max, r.priority), 0) + 1;

  const normalized: TextReplaceRule[] = [];
  for (const item of rawList) {
    if (!item || typeof item.pattern !== 'string' || !item.pattern) continue;
    normalized.push({
      id:
        typeof item.id === 'string' && item.id
          ? item.id
          : `tr_${now}_${Math.random().toString(36).slice(2, 7)}`,
      pattern: item.pattern,
      replacement: typeof item.replacement === 'string' ? item.replacement : '',
      caseSensitive: Boolean(item.caseSensitive),
      wholeWord: Boolean(item.wholeWord),
      preserveCase: Boolean(item.preserveCase),
      isRegex: Boolean(item.isRegex),
      ttsOnly: Boolean(item.ttsOnly),
      scope: item.scope || 'book',
      bookId: item.bookId,
      bookSha1: item.bookSha1,
      seriesKey: item.seriesKey,
      targetChapterIndex: item.targetChapterIndex,
      targetParagraphIndex: item.targetParagraphIndex,
      targetCharOffset: item.targetCharOffset,
      excludedMatchKeys: Array.isArray(item.excludedMatchKeys) ? item.excludedMatchKeys : undefined,
      priority: typeof item.priority === 'number' ? item.priority : nextPriority++,
      enabled: item.enabled !== false,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
      updatedAt: now,
    });
  }

  if (normalized.length > 0) {
    await saveManyTextReplaceRules(normalized);
  }
  return normalized.length;
}

// Translation Cache
export async function getCachedTranslation(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const hit = await db.get('translations', key);
    return hit ? hit.translatedText : null;
  } catch {
    return null;
  }
}

export async function setCachedTranslation(
  key: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string
): Promise<void> {
  try {
    const db = await getDb();
    await db.put('translations', {
      key,
      translatedText,
      sourceLang,
      targetLang,
      createdAt: Date.now(),
    });
  } catch {
    // Ignore cache write errors
  }
}

// Settings Persistence
export function loadReaderSettings(): ReaderSettings {
  try {
    const raw =
      localStorage.getItem(READER_SETTINGS_KEY) ||
      localStorage.getItem(LEGACY_READER_SETTINGS_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReaderSettings>;
    const lineHeightPercent =
      parsed.lineHeightPercent ??
      Math.round((parsed.lineHeight ?? DEFAULT_READER_SETTINGS.lineHeight) * 100);
    return {
      ...DEFAULT_READER_SETTINGS,
      ...parsed,
      uiColor: normalizeHexColor(parsed.uiColor, DEFAULT_UI_COLOR),
      lineHeightPercent,
      lineHeight: lineHeightPercent / 100,
      margins: {
        ...DEFAULT_READER_SETTINGS.margins,
        ...(parsed.margins || {}),
      },
      findReplaceDefaults: {
        ...DEFAULT_FIND_REPLACE_SETTINGS,
        ...(parsed.findReplaceDefaults || {}),
      },
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadTtsSettings(): TtsSettings {
  try {
    const raw =
      localStorage.getItem(TTS_SETTINGS_KEY) ||
      localStorage.getItem(LEGACY_TTS_SETTINGS_KEY);
    if (!raw) return DEFAULT_TTS_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<TtsSettings>;
    return {
      ...DEFAULT_TTS_SETTINGS,
      ...parsed,
      pronunciationDict: Array.isArray(parsed.pronunciationDict) ? parsed.pronunciationDict : [],
    };
  } catch {
    return DEFAULT_TTS_SETTINGS;
  }
}

export function saveTtsSettings(settings: TtsSettings): void {
  try {
    localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadReaderPresets(): ReaderPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveReaderPresets(presets: ReaderPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Ignore
  }
}

export function hasSeededSamples(): boolean {
  try {
    return localStorage.getItem(SEEDED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSamplesSeeded(): void {
  try {
    localStorage.setItem(SEEDED_FLAG_KEY, '1');
  } catch {
    // Ignore
  }
}

// JSON Backup & Restore (Settings + Presets + Positions + Bookmarks + Highlights + Book Metadata)
export interface NovelVoiceBackupPayload {
  app: 'NovelVoice';
  version: 2;
  exportedAt: number;
  readerSettings: ReaderSettings;
  ttsSettings: TtsSettings;
  presets: ReaderPreset[];
  booksMeta: BookMetadata[];
  positions: ReadingPosition[];
  bookmarks: BookmarkItem[];
  highlights: HighlightItem[];
  textReplaceRules?: TextReplaceRule[];
}

export async function exportBackupJson(): Promise<string> {
  const db = await getDb();
  const [booksMeta, positions, bookmarks, highlights, textReplaceRules] = await Promise.all([
    db.getAll('books'),
    db.getAll('positions'),
    db.getAll('bookmarks'),
    db.getAll('highlights'),
    db.getAll('textReplaceRules'),
  ]);
  const payload: NovelVoiceBackupPayload = {
    app: 'NovelVoice',
    version: 2,
    exportedAt: Date.now(),
    readerSettings: loadReaderSettings(),
    ttsSettings: loadTtsSettings(),
    presets: loadReaderPresets(),
    booksMeta,
    positions,
    bookmarks,
    highlights,
    textReplaceRules,
  };
  return JSON.stringify(payload, null, 2);
}

export async function importBackupJson(rawJson: string): Promise<{
  restoredPositions: number;
  restoredBookmarks: number;
  restoredHighlights: number;
  restoredRules: number;
}> {
  const parsed = JSON.parse(rawJson) as Partial<NovelVoiceBackupPayload>;
  if (parsed.app !== 'NovelVoice') {
    throw new Error('File cadangan bukan format NovelVoice yang valid.');
  }

  if (parsed.readerSettings) {
    saveReaderSettings({ ...DEFAULT_READER_SETTINGS, ...parsed.readerSettings });
  }
  if (parsed.ttsSettings) {
    saveTtsSettings({ ...DEFAULT_TTS_SETTINGS, ...parsed.ttsSettings });
  }
  if (Array.isArray(parsed.presets)) {
    saveReaderPresets(parsed.presets);
  }

  const db = await getDb();
  const existingBooks = await db.getAll('books');
  const existingById = new Map(existingBooks.map((b) => [b.id, b]));
  const existingBySha1 = new Map(
    existingBooks.filter((b) => b.sha1).map((b) => [b.sha1 as string, b])
  );
  const metaSha1Map = new Map(
    (parsed.booksMeta || [])
      .filter((m) => m.sha1)
      .map((m) => [m.id, m.sha1 as string])
  );

  const resolveBookId = (oldBookId: string): string => {
    if (existingById.has(oldBookId)) return oldBookId;
    const sha1 = metaSha1Map.get(oldBookId);
    if (sha1 && existingBySha1.has(sha1)) {
      return existingBySha1.get(sha1)!.id;
    }
    return oldBookId;
  };

  let restoredPositions = 0;
  let restoredBookmarks = 0;
  let restoredHighlights = 0;
  let restoredRules = 0;

  const tx = db.transaction(
    ['books', 'positions', 'bookmarks', 'highlights', 'textReplaceRules'],
    'readwrite'
  );

  if (Array.isArray(parsed.booksMeta)) {
    for (const meta of parsed.booksMeta) {
      const targetId = resolveBookId(meta.id);
      const current = existingById.get(targetId);
      if (current) {
        await tx.objectStore('books').put({
          ...current,
          currentChapterIndex: meta.currentChapterIndex ?? current.currentChapterIndex,
          progressPercent: meta.progressPercent ?? current.progressPercent,
          isFavorite: meta.isFavorite ?? current.isFavorite,
          isFinished: meta.isFinished ?? current.isFinished,
          collections: meta.collections ?? current.collections,
          annotation: meta.annotation ?? current.annotation,
          series: meta.series ?? current.series,
        });
      }
    }
  }

  if (Array.isArray(parsed.positions)) {
    for (const pos of parsed.positions) {
      const bookId = resolveBookId(pos.bookId);
      await tx.objectStore('positions').put({ ...pos, bookId });
      restoredPositions++;
    }
  }

  if (Array.isArray(parsed.bookmarks)) {
    for (const bm of parsed.bookmarks) {
      const bookId = resolveBookId(bm.bookId);
      await tx.objectStore('bookmarks').put({ ...bm, bookId });
      restoredBookmarks++;
    }
  }

  if (Array.isArray(parsed.highlights)) {
    for (const hl of parsed.highlights) {
      const bookId = resolveBookId(hl.bookId);
      await tx.objectStore('highlights').put({ ...hl, bookId });
      restoredHighlights++;
    }
  }

  if (Array.isArray(parsed.textReplaceRules)) {
    for (const rule of parsed.textReplaceRules) {
      const bookId = rule.bookId ? resolveBookId(rule.bookId) : undefined;
      await tx.objectStore('textReplaceRules').put({ ...rule, bookId });
      restoredRules++;
    }
  }

  await tx.done;
  return { restoredPositions, restoredBookmarks, restoredHighlights, restoredRules };
}
