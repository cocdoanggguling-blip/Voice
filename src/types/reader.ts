export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderFont = 'literata' | 'jakarta' | 'mono';
export type ReadingMode = 'scroll' | 'paginated';
export type TtsReadingMode = 'flowing' | 'sentence';

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
  charOffset: number;
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

export interface TtsEngineCapabilities {
  maxSpeechInputLength: number;
  ssmlSupported: boolean;
  enginePackage?: string;
}

export interface TtsSettings {
  voiceURI: string;
  langFilter: string;
  readingMode: TtsReadingMode;
  chunkSizeChars: number;
  rate: number;
  pitch: number;
  paragraphPauseMs: number;
  commaPauseMs: number;
  sentencePauseMs: number;
  sleepTimerMinutes: number; // 0 = off, -1 = end of chapter, >0 = minutes
}

export interface WordToken {
  wordIndex: number;
  sentenceIndex: number;
  paragraphIndex: number;
  text: string;
  startChar: number; // Relative to sentence start
  endChar: number;
  chapterStartChar: number; // Exact UTF-16 offset in chapter text
  chapterEndChar: number;
}

export interface SentenceSegment {
  globalIndex: number;
  paragraphIndex: number;
  text: string;
  chapterStartChar: number;
  chapterEndChar: number;
  words: WordToken[];
}

export interface ParsedParagraph {
  id: string;
  index: number;
  tag: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote';
  rawText: string;
  chapterStartChar: number;
  chapterEndChar: number;
  sentences: SentenceSegment[];
}

export interface SpeechChunkSlice {
  paragraphIndex: number;
  chapterStartChar: number;
  chapterEndChar: number;
  localStartChar: number;
  localEndChar: number;
}

export interface SpeechChunk {
  chunkIndex: number;
  text: string;
  speakText: string; // May contain SSML if ssmlSupported and extra pauses > 0
  isSsml: boolean;
  chapterStartChar: number;
  chapterEndChar: number;
  pauseAfterMs: number;
  slices: SpeechChunkSlice[];
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
