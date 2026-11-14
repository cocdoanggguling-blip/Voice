export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'literata' | 'jakarta' | 'mono';
export type ReadingMode = 'scroll' | 'paginated';

export type TargetLanguageCode = 'id' | 'en' | 'ms' | 'jv' | 'ar' | 'ja' | 'zh-CN';

export interface BookMetadata {
  id: string;
  title: string;
  author: string;
  language: string;
  coverDataUrl: string | null;
  addedAt: number;
  lastReadAt: number;
  totalChapters: number;
  currentChapterIndex: number;
  progressPercent: number;
  isSample?: boolean;
}

export interface ReadingPosition {
  bookId: string;
  chapterIndex: number;
  sentenceIndex: number;
  wordIndex: number;
  scrollRatio: number;
  updatedAt: number;
}

export interface TocItem {
  id: string;
  label: string;
  href: string;
  chapterIndex: number;
  level: number;
}

export interface ChapterMeta {
  index: number;
  idref: string;
  href: string;
  title: string;
}

export interface ReaderSettings {
  theme: ReaderTheme;
  font: ReaderFont;
  fontSize: number;
  lineHeight: number;
  readingMode: ReadingMode;
  targetLanguage: TargetLanguageCode;
  paragraphTranslateEnabled: boolean;
}

export interface TtsVoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  engineName?: string;
}

export interface TtsSettings {
  voiceURI: string;
  langFilter: string;
  rate: number;
  pitch: number;
  commaPauseMs: number;
  sleepTimerMinutes: number; // 0 = off, -1 = end of chapter, >0 = minutes
}

export interface WordToken {
  wordIndex: number;
  text: string;
  startChar: number;
  endChar: number;
}

export interface CommaChunk {
  chunkIndex: number;
  text: string;
  startCharOffset: number;
  endCharOffset: number;
  pauseAfterMs: number;
}

export interface SentenceSegment {
  globalIndex: number;
  paragraphIndex: number;
  text: string;
  words: WordToken[];
}

export interface ParsedParagraph {
  id: string;
  index: number;
  tag: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote';
  rawText: string;
  sentences: SentenceSegment[];
}

export interface TranslationResult {
  ok: boolean;
  offline?: boolean;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  fromCache: boolean;
  error?: string;
}
