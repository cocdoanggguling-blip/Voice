export type ReaderTheme = 'light' | 'sepia' | 'twilight' | 'dark' | 'amoled' | 'custom';

export type BuiltinReaderFont =
  | 'book'
  | 'alice'
  | 'literata'
  | 'merriweather'
  | 'lora'
  | 'roboto'
  | 'noto-serif'
  | 'open-sans'
  | 'atkinson'
  | 'jakarta'
  | 'mono';

export type ReaderFont = BuiltinReaderFont | `custom:${string}`;
export type ReadingMode = 'scroll' | 'paginated';
export type PageAnimationMode = 'horizontal' | 'vertical' | 'fade' | 'none';
export type TextAlignMode = 'original' | 'left' | 'justify' | 'original-hyphen';
export type OrientationLockMode = 'auto' | 'portrait' | 'landscape';
export type TtsReadingMode = 'flowing' | 'sentence';
export type TranslationProvider = 'mymemory' | 'libretranslate' | 'gemini';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

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
  fileSizeBytes?: number;
  fileName?: string;
  sha1?: string;
  filePath?: string;
  fileCount?: number;
  annotation?: string;
  series?: string;
  collections?: string[];
  isFavorite?: boolean;
  isFinished?: boolean;
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

export interface ReaderMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ReaderPreset {
  id: string;
  name: string;
  settings: Partial<ReaderSettings>;
}

export interface CustomFontRecord {
  id: string;
  name: string;
  familyName: string;
  dataUrl: string;
  addedAt: number;
}

export interface ReaderSettings {
  theme: ReaderTheme;
  uiColor: string;
  customBg: string;
  customText: string;
  customAccent: string;
  font: ReaderFont;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  lineHeightPercent: number;
  readingMode: ReadingMode;
  pageAnimation: PageAnimationMode;
  textAlign: TextAlignMode;
  twoPageSpread: boolean;
  pageGapBorder: boolean;
  margins: ReaderMargins;
  paragraphSpacingPx: number;
  orientationLock: OrientationLockMode;
  keepScreenOn: boolean;
  brightness: number;
  brightnessCollapsed: boolean;
  autoScrollEnabled: boolean;
  autoScrollSpeedPxPerSec: number;
  targetLanguage: TargetLanguageCode;
  paragraphTranslateEnabled: boolean;
  translationProvider: TranslationProvider;
  libreTranslateUrl: string;
  geminiApiKey: string;
  geminiModel: string;
  findReplaceDefaults?: FindReplaceDefaultSettings;
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

export interface PronunciationRule {
  id: string;
  pattern: string;
  replacement: string;
  caseSensitive?: boolean;
}

export interface TtsSettings {
  voiceURI: string;
  langFilter: string;
  readingMode: TtsReadingMode;
  chunkSizeChars: number;
  rate: number;
  pitch: number;
  volume: number;
  paragraphPauseMs: number;
  commaPauseMs: number;
  sentencePauseMs: number;
  sleepTimerMinutes: number; // 0 = off, -1 = end of chapter, >0 = minutes
  fadeOutBeforeStop: boolean;
  multiLangAuto: boolean;
  readFootnotes: boolean;
  skipHeadersAndFootnotes: boolean;
  skipParentheses: boolean;
  skipSymbolsAndQuotes: boolean;
  readChapterTitle: boolean;
  pronunciationDict: PronunciationRule[];
}

export interface WordToken {
  wordIndex: number;
  sentenceIndex: number;
  paragraphIndex: number;
  text: string;
  startChar: number;
  endChar: number;
  chapterStartChar: number;
  chapterEndChar: number;
}

export interface SentenceSegment {
  globalIndex: number;
  paragraphIndex: number;
  text: string;
  chapterStartChar: number;
  chapterEndChar: number;
  words: WordToken[];
  isFootnote?: boolean;
  detectedLang?: 'id' | 'en';
  langTag?: string;
}

export interface InlineFormatSpan {
  start: number;
  end: number;
  italic?: boolean;
  bold?: boolean;
}

export interface ParsedParagraph {
  id: string;
  index: number;
  tag: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote';
  rawText: string;
  chapterStartChar: number;
  chapterEndChar: number;
  sentences: SentenceSegment[];
  isFootnote?: boolean;
  isHeaderLike?: boolean;
  inlineFormats?: InlineFormatSpan[];
}

export interface SpeechChunkSlice {
  paragraphIndex: number;
  chapterStartChar: number;
  chapterEndChar: number;
  localStartChar: number;
  localEndChar: number;
}

export interface SpokenOffsetSegment {
  spokenStart: number;
  spokenEnd: number;
  origStart: number;
  origEnd: number;
}

export interface SpeechChunk {
  chunkIndex: number;
  text: string;
  speakText: string;
  isSsml: boolean;
  chapterStartChar: number;
  chapterEndChar: number;
  pauseAfterMs: number;
  detectedLang?: 'id' | 'en';
  langTag?: string;
  slices: SpeechChunkSlice[];
  spokenOffsetMap?: SpokenOffsetSegment[];
}

export interface BookmarkItem {
  id: string;
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  charOffset: number;
  quote: string;
  progressPercent: number;
  createdAt: number;
}

export interface HighlightItem {
  id: string;
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  charOffset: number;
  sentenceIndex: number;
  text: string;
  note: string;
  color: HighlightColor;
  createdAt: number;
  updatedAt: number;
}

export interface BookSearchMatch {
  chapterIndex: number;
  chapterTitle: string;
  charOffset: number;
  snippet: string;
}

export interface TranslationResult {
  ok: boolean;
  offline?: boolean;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  fromCache: boolean;
  provider?: TranslationProvider;
  model?: string;
  error?: string;
}

export type ReplaceScope =
  | 'onlyThis'
  | 'chapter'
  | 'fromHereToEnd'
  | 'book'
  | 'series'
  | 'global';

export interface FindReplaceDefaultSettings {
  defaultScope: ReplaceScope;
  defaultCaseSensitive: boolean;
  defaultWholeWord: boolean;
  defaultPreserveCase: boolean;
  applyToToc: boolean;
}

export interface TextReplaceRule {
  id: string;
  pattern: string;
  replacement: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  preserveCase: boolean;
  isRegex: boolean;
  ttsOnly: boolean;
  scope: ReplaceScope;
  bookId?: string;
  bookSha1?: string;
  seriesKey?: string;
  targetChapterIndex?: number;
  targetParagraphIndex?: number;
  targetCharOffset?: number;
  excludedMatchKeys?: string[];
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TtsLastPosition {
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  paragraphIndex: number;
  sentenceInParagraph: number;
  paragraphSentenceCount: number;
  originalCharOffset: number;
  sentenceIndex: number;
  wordIndex: number;
  snippet: string;
  updatedAt: number;
}

