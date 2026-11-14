import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  BookMetadata,
  ReaderSettings,
  ReadingPosition,
  TtsSettings,
} from '../types/reader';

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
}

const DB_NAME = 'novelvoice_db';
const DB_VERSION = 1;
const READER_SETTINGS_KEY = 'novelvoice_reader_settings_v1';
const TTS_SETTINGS_KEY = 'novelvoice_tts_settings_v1';
const SEEDED_FLAG_KEY = 'novelvoice_samples_seeded_v1';

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'light',
  font: 'literata',
  fontSize: 18,
  lineHeight: 1.7,
  readingMode: 'scroll',
  targetLanguage: 'id',
  paragraphTranslateEnabled: false,
};

export const DEFAULT_TTS_SETTINGS: TtsSettings = {
  voiceURI: '',
  langFilter: 'all',
  rate: 1.0,
  pitch: 1.0,
  commaPauseMs: 180,
  sleepTimerMinutes: 0,
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
  const tx = db.transaction(['books', 'bookFiles', 'positions'], 'readwrite');
  await tx.objectStore('books').delete(bookId);
  await tx.objectStore('bookFiles').delete(bookId);
  await tx.objectStore('positions').delete(bookId);
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

export function loadReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(raw) };
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
    const raw = localStorage.getItem(TTS_SETTINGS_KEY);
    if (!raw) return DEFAULT_TTS_SETTINGS;
    return { ...DEFAULT_TTS_SETTINGS, ...JSON.parse(raw) };
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
