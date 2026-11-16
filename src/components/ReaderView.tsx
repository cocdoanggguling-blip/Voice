import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  Languages,
  List,
  MessageSquarePlus,
  MoreVertical,
  Play,
  Replace,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sun,
  Volume2,
} from 'lucide-react';
import {
  computeAllChapterCharLengths,
  exportEditedEpubBlob,
  extractAllChaptersForPreview,
  loadChapterSegments,
  openEpubForReading,
  type EpubReplaceOptions,
  type OpenedEpubBook,
} from '../services/epubService';
import {
  clearChapterMetrics,
  deleteBookmark,
  deleteHighlight,
  deleteTextReplaceRule,
  exportReplaceRulesJson,
  getBookFile,
  getChapterMetrics,
  getReadingPosition,
  getTtsLastPosition,
  importReplaceRulesJson,
  listBookmarks,
  listHighlights,
  listTextReplaceRules,
  saveBookmark,
  saveChapterMetrics,
  saveHighlight,
  saveManyTextReplaceRules,
  saveReadingPosition,
  saveTextReplaceRule,
  saveTtsLastPosition,
  updateBookMetadata,
} from '../services/storageService';
import { translateText } from '../services/translationService';
import {
  checkAndroidNotificationPermission,
  getSystemVoices,
  getTtsEngineCapabilities,
  openBatteryOptimizationSettings,
  openNativeTtsSettings,
  requestAndroidNotificationPermission,
  syncNativeScreenSettings,
  TtsPlaybackController,
  type NotificationPermissionStatus,
} from '../services/ttsBridge';
import type {
  BookMetadata,
  BookmarkItem,
  ChapterMeta,
  CustomFontRecord,
  FindReplaceDefaultSettings,
  HighlightColor,
  HighlightItem,
  InlineFormatSpan,
  OrientationLockMode,
  ParsedParagraph,
  ReaderFont,
  ReaderPreset,
  ReaderSettings,
  ReplaceScope,
  SentenceSegment,
  TargetLanguageCode,
  TextReplaceRule,
  TocItem,
  TranslationResult,
  TtsEngineCapabilities,
  TtsLastPosition,
  TtsSettings,
  TtsVoiceInfo,
  WordToken,
} from '../types/reader';
import {
  calculateBookVirtualPages,
  estimateCharsPerVirtualPage,
  extractSeriesName,
  findTargetFromVirtualPage,
  resolveVirtualPageLocation,
} from '../utils/bookMetrics';
import { applyIndonesianHyphenation } from '../utils/hyphenationId';
import {
  buildParagraphTranslationSlotKey,
  buildRenderedChapterModel,
  mapRenderedOffsetToOriginalOffset,
  mapSentenceCursorAcrossRender,
} from '../utils/renderedTranslation';
import {
  applyNonTtsRulesToPlainText,
  buildEffectiveChaptersForPreview,
  DEFAULT_FIND_REPLACE_SETTINGS,
  type BookReplaceContext,
  type ChapterParagraphInput,
} from '../utils/textReplace';
import {
  findLocationAtChapterOffset,
  normalizeBookLocale,
} from '../utils/textSegmentation';
import {
  buildTtsLastPositionSnapshot,
  findTopmostVisibleParagraphIndex,
  resolveStartFromViewportTarget,
  resolveTtsResumeTarget,
  type ParagraphViewportRect,
} from '../utils/ttsStartPosition';
import { AppearanceSheet } from './AppearanceSheet';
import { BookSearchModal } from './BookSearchModal';
import { FindReplacePopup } from './FindReplacePopup';
import { ReaderControlsBar } from './ReaderControlsBar';
import { ReplaceRulesModal } from './ReplaceRulesModal';
import { TocDrawer } from './TocDrawer';
import { TranslationPopup } from './TranslationPopup';
import { TtsSettingsSheet } from './TtsSettingsSheet';
import { TtsStartChoiceModal } from './TtsStartChoiceModal';

interface ReaderViewProps {
  bookMeta: BookMetadata;
  autoStartTts?: boolean;
  readerSettings: ReaderSettings;
  ttsSettings: TtsSettings;
  customFonts: CustomFontRecord[];
  presets: ReaderPreset[];
  onUpdateReaderSettings: (patch: Partial<ReaderSettings>) => void;
  onUpdateTtsSettings: (patch: Partial<TtsSettings>) => void;
  onImportCustomFont: (file: File) => Promise<void> | void;
  onDeleteCustomFont: (fontId: string) => Promise<void> | void;
  onSavePreset: (name: string) => void;
  onApplyPreset: (preset: ReaderPreset) => void;
  onDeletePreset: (id: string) => void;
  onBookProgressUpdated: (updated: BookMetadata) => void;
  onBackToLibrary: () => void;
}

const FONT_CLASS_MAP: Record<string, string> = {
  book: 'font-reader-book',
  alice: 'font-reader-alice',
  literata: 'font-reader-literata',
  merriweather: 'font-reader-merriweather',
  lora: 'font-reader-lora',
  roboto: 'font-reader-roboto',
  'noto-serif': 'font-reader-noto-serif',
  'open-sans': 'font-reader-open-sans',
  atkinson: 'font-reader-atkinson',
  jakarta: 'font-reader-jakarta',
  mono: 'font-reader-mono',
};

const HIGHLIGHT_BG_MAP: Record<HighlightColor, string> = {
  yellow: 'bg-amber-300/40 dark:bg-amber-400/25',
  green: 'bg-emerald-300/40 dark:bg-emerald-400/25',
  blue: 'bg-sky-300/40 dark:bg-sky-400/25',
  pink: 'bg-pink-300/40 dark:bg-pink-400/25',
  purple: 'bg-purple-300/40 dark:bg-purple-400/25',
};

const HIGHLIGHT_SWATCHES: Array<{ color: HighlightColor; bg: string; label: string }> = [
  { color: 'yellow', bg: 'bg-amber-400', label: 'Kuning' },
  { color: 'green', bg: 'bg-emerald-500', label: 'Hijau' },
  { color: 'blue', bg: 'bg-sky-500', label: 'Biru' },
  { color: 'pink', bg: 'bg-pink-500', label: 'Merah muda' },
  { color: 'purple', bg: 'bg-purple-500', label: 'Ungu' },
];

function getWordFormat(
  word: WordToken,
  spans?: InlineFormatSpan[]
): { italic: boolean; bold: boolean } {
  if (!spans || spans.length === 0) return { italic: false, bold: false };
  let italic = false;
  let bold = false;
  for (const s of spans) {
    if (word.endChar > s.start && word.startChar < s.end) {
      if (s.italic) italic = true;
      if (s.bold) bold = true;
    }
  }
  return { italic, bold };
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  bookMeta,
  autoStartTts = false,
  readerSettings,
  ttsSettings,
  customFonts,
  presets,
  onUpdateReaderSettings,
  onUpdateTtsSettings,
  onImportCustomFont,
  onDeleteCustomFont,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onBookProgressUpdated,
  onBackToLibrary,
}) => {
  const [openedEpub, setOpenedEpub] = useState<OpenedEpubBook | null>(null);
  const [chapters, setChapters] = useState<ChapterMeta[]>([]);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [chapterIndex, setChapterIndex] = useState<number>(bookMeta.currentChapterIndex || 0);
  const [paragraphs, setParagraphs] = useState<ParsedParagraph[]>([]);
  const [allSentences, setAllSentences] = useState<SentenceSegment[]>([]);
  const [activeSentenceIdx, setActiveSentenceIdx] = useState<number>(0);
  const [activeCharOffset, setActiveCharOffset] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingBook, setIsLoadingBook] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Virtual pages & viewport
  const [chapterCharLengths, setChapterCharLengths] = useState<number[]>([]);
  const [viewportSize, setViewportSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  });

  // Paginated view state
  const [pageIndex, setPageIndex] = useState(0);
  const PARAGRAPHS_PER_PAGE = readerSettings.twoPageSpread && viewportSize.w >= 768 ? 8 : 4;

  // UI bars, Drawers, Popups
  const [barsVisible, setBarsVisible] = useState(true);
  const [ttsBarExpanded, setTtsBarExpanded] = useState(autoStartTts);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [ttsSheetOpen, setTtsSheetOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [undoSnackbar, setUndoSnackbar] = useState<{
    message: string;
    addedRuleId?: string;
    previousRule?: TextReplaceRule | null;
  } | null>(null);

  // Find & Replace Rules State (Tahap 8)
  const [replaceRules, setReplaceRules] = useState<TextReplaceRule[]>([]);
  const [findReplaceState, setFindReplaceState] = useState<{
    open: boolean;
    mode: 'selection' | 'manual' | 'edit';
    initialPattern: string;
    editingRule?: TextReplaceRule | null;
    presetTtsOnly?: boolean;
    paragraphIndex?: number;
    charOffset: number;
  }>({
    open: false,
    mode: 'selection',
    initialPattern: '',
    charOffset: 0,
  });
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [rulesModalFilter, setRulesModalFilter] = useState<'all' | 'book' | 'ttsOnly'>('all');
  const [rawChaptersCache, setRawChaptersCache] = useState<ChapterParagraphInput[] | null>(null);
  const [scanningPreviewChapters, setScanningPreviewChapters] = useState(false);

  // Bookmarks & Highlights
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [selectionMenu, setSelectionMenu] = useState<{
    text: string;
    sentenceIndex: number | null;
    paragraphIndex?: number;
    charOffset: number;
  } | null>(null);
  const [noteDialog, setNoteDialog] = useState<{
    text: string;
    sentenceIndex: number;
    charOffset: number;
    color: HighlightColor;
    note: string;
  } | null>(null);

  // Voices, Engine Capabilities & Permissions
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);
  const [engineCapabilities, setEngineCapabilities] = useState<TtsEngineCapabilities>({
    maxSpeechInputLength: 3500,
    ssmlSupported: false,
  });
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermissionStatus>({
    granted: true,
    sdkInt: 0,
    isNative: false,
  });
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  // Translation state (Readest-style in-place render layer)
  const [popupSourceText, setPopupSourceText] = useState('');
  const [popupSentenceIdx, setPopupSentenceIdx] = useState<number | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupResult, setPopupResult] = useState<TranslationResult | null>(null);
  const [inlineTranslations, setInlineTranslations] = useState<Record<string, TranslationResult>>({});
  const [translateRetryTick, setTranslateRetryTick] = useState(0);
  const [isTranslatingBatch, setIsTranslatingBatch] = useState(false);

  const [lastTtsPosition, setLastTtsPosition] = useState<TtsLastPosition | null>(() =>
    getTtsLastPosition(bookMeta.id)
  );
  const [ttsChoiceModal, setTtsChoiceModal] = useState<{
    open: boolean;
    startHereParagraphIndex: number;
  } | null>(null);

  const sentenceRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const controllerRef = useRef<TtsPlaybackController | null>(null);
  const chapterIndexRef = useRef(chapterIndex);
  const chaptersRef = useRef(chapters);
  const activeSentenceRef = useRef(activeSentenceIdx);
  const activeWordRef = useRef(0);
  const activeOffsetRef = useRef(activeCharOffset);
  const longPressTimerRef = useRef<number | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const paragraphsVersionRef = useRef(0);
  const prevSyncSignatureRef = useRef<string>('');
  const prevRenderedSentencesRef = useRef<SentenceSegment[]>([]);
  const prevTranslatedFlagsRef = useRef<boolean[]>([]);
  const wasTtsPlayingRef = useRef(false);

  const seriesKey = useMemo(() => extractSeriesName(bookMeta), [bookMeta]);
  const safeBookLang = useMemo(() => normalizeBookLocale(bookMeta.language), [bookMeta.language]);
  const bookCtx = useMemo<BookReplaceContext>(
    () => ({
      bookId: bookMeta.id,
      sha1: bookMeta.sha1,
      seriesKey,
    }),
    [bookMeta.id, bookMeta.sha1, seriesKey]
  );
  const findReplaceDefaults: FindReplaceDefaultSettings =
    readerSettings.findReplaceDefaults ?? DEFAULT_FIND_REPLACE_SETTINGS;
  const replaceOptions = useMemo<EpubReplaceOptions>(
    () => ({ rules: replaceRules, bookCtx }),
    [bookCtx, replaceRules]
  );
  const replaceOptionsRef = useRef(replaceOptions);
  replaceOptionsRef.current = replaceOptions;
  const readerSettingsRef = useRef(readerSettings);
  readerSettingsRef.current = readerSettings;
  const inlineTranslationsRef = useRef(inlineTranslations);
  inlineTranslationsRef.current = inlineTranslations;
  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;
  const renderedParagraphsRef = useRef<ParsedParagraph[]>([]);
  const renderedSentencesRef = useRef<SentenceSegment[]>([]);

  chapterIndexRef.current = chapterIndex;
  chaptersRef.current = chapters;
  activeSentenceRef.current = activeSentenceIdx;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(null), 2400);
  }, []);

  // Viewport listener for virtual page recalculation without losing reading position
  useEffect(() => {
    const onResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Sync native brightness, keepScreenOn, orientation lock
  useEffect(() => {
    void syncNativeScreenSettings({
      brightness: readerSettings.brightness,
      keepScreenOn: readerSettings.keepScreenOn,
      orientationLock: readerSettings.orientationLock,
    });
  }, [
    readerSettings.brightness,
    readerSettings.keepScreenOn,
    readerSettings.orientationLock,
  ]);

  // Auto-scroll loop
  useEffect(() => {
    if (!readerSettings.autoScrollEnabled || readerSettings.readingMode !== 'scroll') return;
    const speed = Math.max(10, readerSettings.autoScrollSpeedPxPerSec || 28);
    const interval = window.setInterval(() => {
      window.scrollBy({ top: Math.max(1, Math.round(speed / 20)), behavior: 'auto' });
    }, 50);
    return () => window.clearInterval(interval);
  }, [
    readerSettings.autoScrollEnabled,
    readerSettings.autoScrollSpeedPxPerSec,
    readerSettings.readingMode,
  ]);

  // Persist reading position helper (always normalized to immutable original chapter coordinates)
  const persistPosition = useCallback(
    async (cIdx: number, charOffset: number, sIdx: number, wIdx: number, totalChaps: number) => {
      const origOffset =
        cIdx === chapterIndexRef.current && renderedSentencesRef.current.length > 0
          ? mapRenderedOffsetToOriginalOffset(
              renderedSentencesRef.current,
              sIdx,
              paragraphsRef.current
            )
          : charOffset;
      const denomSentences = Math.max(
        1,
        renderedSentencesRef.current.length || allSentences.length
      );

      await saveReadingPosition({
        bookId: bookMeta.id,
        chapterIndex: cIdx,
        charOffset: origOffset,
        sentenceIndex: sIdx,
        wordIndex: wIdx,
        scrollRatio: 0,
        updatedAt: Date.now(),
      });

      const pct =
        totalChaps <= 1
          ? renderedSentencesRef.current.length > 0 || allSentences.length > 0
            ? Math.round(((sIdx + 1) / denomSentences) * 100)
            : 0
          : Math.min(
              100,
              Math.round(((cIdx + (sIdx + 1) / denomSentences) / totalChaps) * 100)
            );

      const updated: BookMetadata = {
        ...bookMeta,
        currentChapterIndex: cIdx,
        lastReadAt: Date.now(),
        progressPercent: Math.max(1, pct),
      };
      await updateBookMetadata(updated);
      onBookProgressUpdated(updated);
    },
    [allSentences.length, bookMeta, onBookProgressUpdated]
  );

  const persistTtsLastSnapshot = useCallback(
    (sIdx: number, wIdx: number, updateState = true) => {
      const cIdx = chapterIndexRef.current;
      const chapTitle = chaptersRef.current[cIdx]?.title || `Bab ${cIdx + 1}`;
      const snap = buildTtsLastPositionSnapshot({
        bookId: bookMeta.id,
        chapterIndex: cIdx,
        chapterTitle: chapTitle,
        activeSentenceIndex: sIdx,
        activeWordIndex: wIdx,
        renderedParagraphs: renderedParagraphsRef.current,
        renderedSentences: renderedSentencesRef.current,
        originalParagraphs: paragraphsRef.current,
      });
      if (!snap) return;
      saveTtsLastPosition(snap);
      if (updateState) {
        setLastTtsPosition(snap);
      }
    },
    [bookMeta.id]
  );

  // Initialize TTS controller once
  useEffect(() => {
    setLastTtsPosition(getTtsLastPosition(bookMeta.id));
    const controller = new TtsPlaybackController(ttsSettings, {
      onHighlight: (sIdx, wIdx, charOffset) => {
        const sentenceChanged = sIdx !== activeSentenceRef.current;
        activeWordRef.current = wIdx;
        activeOffsetRef.current = charOffset;
        if (sentenceChanged) {
          activeSentenceRef.current = sIdx;
          setActiveSentenceIdx(sIdx);
          setActiveCharOffset(charOffset);
        }
        if (controller.getIsPlaying() && sentenceChanged) {
          persistTtsLastSnapshot(sIdx, wIdx, false);
        }
      },
      onPlaybackStateChange: (playing) => {
        setIsPlaying(playing);
        if (playing) {
          wasTtsPlayingRef.current = true;
          return;
        }
        const pos = controller.getPosition();
        if (wasTtsPlayingRef.current) {
          wasTtsPlayingRef.current = false;
          persistTtsLastSnapshot(pos.sentenceIndex, pos.wordIndex, true);
        }
        void persistPosition(
          chapterIndexRef.current,
          pos.charOffset,
          pos.sentenceIndex,
          pos.wordIndex,
          chaptersRef.current.length || bookMeta.totalChapters
        );
      },
      onChapterComplete: () => {
        const nextChap = chapterIndexRef.current + 1;
        if (nextChap < chaptersRef.current.length) {
          void handleSelectChapter(nextChap, true);
        }
      },
      onSleepTimerTick: (sec) => {
        setSleepRemainingSec(sec);
      },
    });

    controllerRef.current = controller;

    void getSystemVoices().then((v) => {
      setVoices(v);
      controller.setAvailableVoices(v);
    });
    void getTtsEngineCapabilities().then((caps) => {
      setEngineCapabilities(caps);
      controller.setCapabilities(caps);
    });
    void checkAndroidNotificationPermission().then(setNotificationStatus);

    return () => {
      const pos = controller.getPosition();
      if (controller.getIsPlaying() || wasTtsPlayingRef.current) {
        wasTtsPlayingRef.current = false;
        persistTtsLastSnapshot(pos.sentenceIndex, pos.wordIndex, false);
      }
      void saveReadingPosition({
        bookId: bookMeta.id,
        chapterIndex: chapterIndexRef.current,
        charOffset: pos.charOffset,
        sentenceIndex: pos.sentenceIndex,
        wordIndex: pos.wordIndex,
        scrollRatio: 0,
        updatedAt: Date.now(),
      });
      controller.destroy();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookMeta.id]);

  const refreshTtsVoices = useCallback(async () => {
    const [nextVoices, caps] = await Promise.all([
      getSystemVoices(),
      getTtsEngineCapabilities(),
    ]);
    setVoices(nextVoices);
    setEngineCapabilities(caps);
    controllerRef.current?.setAvailableVoices(nextVoices);
    controllerRef.current?.setCapabilities(caps);
  }, []);

  useEffect(() => {
    controllerRef.current?.updateSettings(ttsSettings);
  }, [ttsSettings]);

  useEffect(() => {
    if (ttsSheetOpen) {
      void refreshTtsVoices();
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshTtsVoices();
      }
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshTtsVoices, ttsSheetOpen]);

  // Open EPUB + bookmarks/highlights + cached chapter metrics
  useEffect(() => {
    let cancelled = false;
    let instanceToDestroy: OpenedEpubBook | null = null;

    async function init() {
      setIsLoadingBook(true);
      setLoadError(null);
      try {
        const [buffer, savedPos, loadedBookmarks, loadedHighlights, cachedMetrics, loadedRules] =
          await Promise.all([
            getBookFile(bookMeta.id),
            getReadingPosition(bookMeta.id),
            listBookmarks(bookMeta.id),
            listHighlights(bookMeta.id),
            getChapterMetrics(bookMeta.id),
            listTextReplaceRules(),
          ]);

        if (!buffer) {
          throw new Error('Berkas EPUB tidak ditemukan di penyimpanan lokal.');
        }

        const opened = await openEpubForReading(buffer);
        if (cancelled) {
          opened.book.destroy();
          return;
        }
        instanceToDestroy = opened;
        setOpenedEpub(opened);
        setChapters(opened.chapters);
        setToc(opened.toc);
        setBookmarks(loadedBookmarks);
        setHighlights(loadedHighlights);
        setReplaceRules(loadedRules);

        const initialReplaceOpts: EpubReplaceOptions = {
          rules: loadedRules,
          bookCtx,
        };
        controllerRef.current?.setTtsReplaceRules(loadedRules, bookCtx);

        if (cachedMetrics && cachedMetrics.length === opened.chapters.length) {
          setChapterCharLengths(cachedMetrics);
        } else {
          setChapterCharLengths(new Array(opened.chapters.length).fill(2200));
          void computeAllChapterCharLengths(
            opened.book,
            opened.chapters.length,
            () => cancelled,
            initialReplaceOpts
          ).then((lengths) => {
            if (!cancelled && lengths.length === opened.chapters.length) {
              setChapterCharLengths(lengths);
              void saveChapterMetrics(bookMeta.id, lengths);
            }
          });
        }

        const startChap = savedPos
          ? Math.min(savedPos.chapterIndex, Math.max(0, opened.chapters.length - 1))
          : Math.min(bookMeta.currentChapterIndex || 0, Math.max(0, opened.chapters.length - 1));

        const segs = await loadChapterSegments(
          opened.book,
          startChap,
          safeBookLang,
          initialReplaceOpts
        );
        if (cancelled) return;

        let initialOffset = 0;
        if (savedPos && typeof savedPos.charOffset === 'number' && savedPos.charOffset > 0) {
          initialOffset = savedPos.charOffset;
        } else if (savedPos && savedPos.sentenceIndex > 0 && segs.allSentences.length > 0) {
          const fallbackSent =
            segs.allSentences[Math.min(savedPos.sentenceIndex, segs.allSentences.length - 1)];
          initialOffset = fallbackSent?.chapterStartChar ?? 0;
        }

        const loc = findLocationAtChapterOffset(segs.allSentences, initialOffset);

        paragraphsVersionRef.current += 1;
        setChapterIndex(startChap);
        setParagraphs(segs.paragraphs);
        setAllSentences(segs.allSentences);
        setActiveSentenceIdx(loc.sentenceIndex);
        activeSentenceRef.current = loc.sentenceIndex;
        activeWordRef.current = loc.wordIndex;
        activeOffsetRef.current = loc.chapterOffset;
        setActiveCharOffset(loc.chapterOffset);

        const chapTitle =
          opened.chapters[startChap]?.title || segs.chapterTitle || `Bab ${startChap + 1}`;
        // Build initial rendered model immediately from already-available cache entries if any
        const initialRendered = buildRenderedChapterModel(segs.paragraphs, segs.allSentences, {
          translateEnabled: readerSettings.paragraphTranslateEnabled,
          targetLanguage: readerSettings.targetLanguage,
          bookLocale: safeBookLang,
          getTranslatedText: (para) => {
            const slotKey = buildParagraphTranslationSlotKey(
              startChap,
              para.id,
              para.rawText,
              readerSettings.targetLanguage,
              readerSettings.translationProvider,
              readerSettings.geminiModel
            );
            const res = inlineTranslations[slotKey];
            return res?.ok && res.translatedText.trim() ? res.translatedText : null;
          },
        });
        chaptersRef.current = opened.chapters;
        chapterIndexRef.current = startChap;
        paragraphsRef.current = segs.paragraphs;
        renderedParagraphsRef.current = initialRendered.paragraphs;
        renderedSentencesRef.current = initialRendered.allSentences;
        prevRenderedSentencesRef.current = initialRendered.allSentences;
        prevTranslatedFlagsRef.current = initialRendered.translatedParagraphFlags;
        const initModelScope =
          readerSettings.translationProvider === 'gemini' ? readerSettings.geminiModel : '';
        prevSyncSignatureRef.current = `${startChap}|${paragraphsVersionRef.current}|${readerSettings.paragraphTranslateEnabled}|${readerSettings.targetLanguage}|${readerSettings.translationProvider}|${initModelScope}`;

        controllerRef.current?.setBookContext(
          bookMeta.title,
          chapTitle,
          initialRendered.paragraphs,
          initialRendered.allSentences,
          loc.chapterOffset,
          startChap,
          bookCtx,
          {
            translatedFlags: initialRendered.translatedParagraphFlags,
            hasPendingTranslations:
              readerSettings.paragraphTranslateEnabled && segs.paragraphs.length > 0,
          }
        );

        if (autoStartTts && initialRendered.allSentences.length > 0) {
          setTtsBarExpanded(true);
          void controllerRef.current?.playFromOffset(loc.chapterOffset);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Gagal membuka berkas EPUB.');
        }
      } finally {
        if (!cancelled) setIsLoadingBook(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
      instanceToDestroy?.book.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookMeta.id]);

  // Extract raw chapter paragraphs once lazily when Find & Replace or Rules Manager opens
  useEffect(() => {
    if ((!findReplaceState.open && !rulesModalOpen) || !openedEpub || rawChaptersCache) return;
    let cancelled = false;
    setScanningPreviewChapters(true);
    void extractAllChaptersForPreview(
      openedEpub.book,
      openedEpub.chapters,
      () => cancelled
    ).then((data) => {
      if (!cancelled) {
        setRawChaptersCache(data);
        setScanningPreviewChapters(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [findReplaceState.open, openedEpub, rawChaptersCache, rulesModalOpen]);

  const effectivePreviewChapters = useMemo(() => {
    if (!rawChaptersCache) return null;
    const editingRule = findReplaceState.editingRule ?? undefined;
    return buildEffectiveChaptersForPreview(rawChaptersCache, replaceRules, bookCtx, {
      excludeRuleId: editingRule?.id,
      onlyRulesBeforeRule: editingRule,
    });
  }, [bookCtx, findReplaceState.editingRule, rawChaptersCache, replaceRules]);

  const applyUpdatedRulesToReader = useCallback(
    async (nextRules: TextReplaceRule[], visualRulesChanged = true) => {
      setReplaceRules(nextRules);
      const nextOpts: EpubReplaceOptions = { rules: nextRules, bookCtx };
      controllerRef.current?.setTtsReplaceRules(nextRules, bookCtx);

      if (!visualRulesChanged || !openedEpub) return;

      setInlineTranslations({});

      const currentChap = chapterIndexRef.current;
      const keepOffset = activeOffsetRef.current;
      const segs = await loadChapterSegments(
        openedEpub.book,
        currentChap,
        safeBookLang,
        nextOpts
      );
      const origLoc = findLocationAtChapterOffset(segs.allSentences, keepOffset);
      const rs = readerSettingsRef.current;
      const nextRendered = buildRenderedChapterModel(segs.paragraphs, segs.allSentences, {
        translateEnabled: rs.paragraphTranslateEnabled,
        targetLanguage: rs.targetLanguage,
        bookLocale: safeBookLang,
        getTranslatedText: () => null,
      });

      paragraphsVersionRef.current += 1;
      prevRenderedSentencesRef.current = nextRendered.allSentences;
      prevTranslatedFlagsRef.current = nextRendered.translatedParagraphFlags;
      const ruleModelScope = rs.translationProvider === 'gemini' ? rs.geminiModel : '';
      prevSyncSignatureRef.current = `${currentChap}|${paragraphsVersionRef.current}|${rs.paragraphTranslateEnabled}|${rs.targetLanguage}|${rs.translationProvider}|${ruleModelScope}`;

      setParagraphs(segs.paragraphs);
      setAllSentences(segs.allSentences);
      setActiveSentenceIdx(origLoc.sentenceIndex);
      activeSentenceRef.current = origLoc.sentenceIndex;
      activeWordRef.current = origLoc.wordIndex;
      activeOffsetRef.current = origLoc.chapterOffset;
      setActiveCharOffset(origLoc.chapterOffset);

      const chapTitle =
        openedEpub.chapters[currentChap]?.title || segs.chapterTitle || `Bab ${currentChap + 1}`;
      controllerRef.current?.setBookContext(
        bookMeta.title,
        chapTitle,
        nextRendered.paragraphs,
        nextRendered.allSentences,
        origLoc.chapterOffset,
        currentChap,
        bookCtx,
        {
          translatedFlags: nextRendered.translatedParagraphFlags,
          hasPendingTranslations:
            rs.paragraphTranslateEnabled && segs.paragraphs.length > 0,
        }
      );

      await clearChapterMetrics(bookMeta.id);
      void computeAllChapterCharLengths(
        openedEpub.book,
        openedEpub.chapters.length,
        () => false,
        nextOpts
      ).then((lengths) => {
        if (lengths.length === openedEpub.chapters.length) {
          setChapterCharLengths(lengths);
          void saveChapterMetrics(bookMeta.id, lengths);
        }
      });
    },
    [bookCtx, bookMeta.id, bookMeta.title, openedEpub, safeBookLang]
  );

  const handleSelectChapter = useCallback(
    async (
      targetIndex: number,
      autoPlayAfterLoad = false,
      targetCharOffset = 0,
      resumeTtsSnapshot?: TtsLastPosition
    ) => {
      if (!openedEpub) return;
      const clamped = Math.max(0, Math.min(targetIndex, openedEpub.chapters.length - 1));
      controllerRef.current?.pause();

      const segs = await loadChapterSegments(
        openedEpub.book,
        clamped,
        safeBookLang,
        replaceOptionsRef.current
      );
      const origLoc = findLocationAtChapterOffset(segs.allSentences, targetCharOffset);
      const rs = readerSettingsRef.current;
      const cachedTranslations = inlineTranslationsRef.current;
      const nextRendered = buildRenderedChapterModel(segs.paragraphs, segs.allSentences, {
        translateEnabled: rs.paragraphTranslateEnabled,
        targetLanguage: rs.targetLanguage,
        bookLocale: safeBookLang,
        getTranslatedText: (para) => {
          const slotKey = buildParagraphTranslationSlotKey(
            clamped,
            para.id,
            para.rawText,
            rs.targetLanguage,
            rs.translationProvider,
            rs.geminiModel
          );
          const res = cachedTranslations[slotKey];
          return res?.ok && res.translatedText.trim() ? res.translatedText : null;
        },
      });
      const resolvedFromResume = resumeTtsSnapshot
        ? resolveTtsResumeTarget(
            resumeTtsSnapshot,
            nextRendered.paragraphs,
            nextRendered.allSentences
          )
        : null;
      const targetRenderedPara = resolvedFromResume
        ? nextRendered.paragraphs[resolvedFromResume.paragraphIndex]
        : nextRendered.paragraphs[origLoc.paragraphIndex];
      const nextLoc = resolvedFromResume
        ? {
            sentenceIndex: resolvedFromResume.sentenceIndex,
            wordIndex: resolvedFromResume.wordIndex,
            chapterOffset: resolvedFromResume.chapterOffset,
            paragraphIndex: resolvedFromResume.paragraphIndex,
          }
        : findLocationAtChapterOffset(
            nextRendered.allSentences,
            targetRenderedPara?.chapterStartChar ?? 0
          );

      paragraphsVersionRef.current += 1;
      chapterIndexRef.current = clamped;
      paragraphsRef.current = segs.paragraphs;
      renderedParagraphsRef.current = nextRendered.paragraphs;
      renderedSentencesRef.current = nextRendered.allSentences;
      prevRenderedSentencesRef.current = nextRendered.allSentences;
      prevTranslatedFlagsRef.current = nextRendered.translatedParagraphFlags;
      const nextModelScope = rs.translationProvider === 'gemini' ? rs.geminiModel : '';
      prevSyncSignatureRef.current = `${clamped}|${paragraphsVersionRef.current}|${rs.paragraphTranslateEnabled}|${rs.targetLanguage}|${rs.translationProvider}|${nextModelScope}`;

      setChapterIndex(clamped);
      setParagraphs(segs.paragraphs);
      setAllSentences(segs.allSentences);
      setActiveSentenceIdx(nextLoc.sentenceIndex);
      activeSentenceRef.current = nextLoc.sentenceIndex;
      activeWordRef.current = nextLoc.wordIndex;
      activeOffsetRef.current = nextLoc.chapterOffset;
      setActiveCharOffset(nextLoc.chapterOffset);
      const nextPage =
        rs.readingMode === 'paginated'
          ? Math.floor((nextLoc.paragraphIndex ?? 0) / PARAGRAPHS_PER_PAGE)
          : 0;
      setPageIndex(nextPage);
      setSelectionMenu(null);

      const chapTitle =
        openedEpub.chapters[clamped]?.title || segs.chapterTitle || `Bab ${clamped + 1}`;
      controllerRef.current?.setBookContext(
        bookMeta.title,
        chapTitle,
        nextRendered.paragraphs,
        nextRendered.allSentences,
        nextLoc.chapterOffset,
        clamped,
        bookCtx,
        {
          translatedFlags: nextRendered.translatedParagraphFlags,
          hasPendingTranslations:
            rs.paragraphTranslateEnabled &&
            nextRendered.translatedParagraphFlags.some((flag) => !flag),
        }
      );

      await persistPosition(
        clamped,
        resumeTtsSnapshot?.originalCharOffset ?? origLoc.chapterOffset,
        nextLoc.sentenceIndex,
        nextLoc.wordIndex,
        openedEpub.chapters.length
      );

      if (autoPlayAfterLoad && nextRendered.allSentences.length > 0) {
        void controllerRef.current?.playFromOffset(nextLoc.chapterOffset);
        window.setTimeout(() => {
          sentenceRefs.current
            .get(nextLoc.sentenceIndex)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [PARAGRAPHS_PER_PAGE, bookCtx, bookMeta.title, openedEpub, persistPosition, safeBookLang]
  );

  // Build non-destructive Readest-style display & TTS chapter model from immutable original `paragraphs`
  const renderedModel = useMemo(
    () =>
      buildRenderedChapterModel(paragraphs, allSentences, {
        translateEnabled: readerSettings.paragraphTranslateEnabled,
        targetLanguage: readerSettings.targetLanguage,
        bookLocale: safeBookLang,
        getTranslatedText: (para) => {
          const slotKey = buildParagraphTranslationSlotKey(
            chapterIndex,
            para.id,
            para.rawText,
            readerSettings.targetLanguage,
            readerSettings.translationProvider,
            readerSettings.geminiModel
          );
          const res = inlineTranslations[slotKey];
          return res?.ok && res.translatedText.trim() ? res.translatedText : null;
        },
      }),
    [
      allSentences,
      chapterIndex,
      inlineTranslations,
      paragraphs,
      readerSettings.geminiModel,
      readerSettings.paragraphTranslateEnabled,
      readerSettings.targetLanguage,
      readerSettings.translationProvider,
      safeBookLang,
    ]
  );

  const renderedParagraphs = renderedModel.paragraphs;
  renderedParagraphsRef.current = renderedParagraphs;
  const renderedSentences = renderedModel.allSentences;
  renderedSentencesRef.current = renderedSentences;
  const renderedLocale = renderedModel.renderedLocale;
  const translatedParagraphFlags = renderedModel.translatedParagraphFlags;

  const translationStats = useMemo(() => {
    if (!readerSettings.paragraphTranslateEnabled || paragraphs.length === 0) {
      return { total: 0, translated: 0, pending: 0, errorMessage: null as string | null };
    }
    let translated = 0;
    let errored = 0;
    let firstError: string | null = null;
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const slotKey = buildParagraphTranslationSlotKey(
        chapterIndex,
        p.id,
        p.rawText,
        readerSettings.targetLanguage,
        readerSettings.translationProvider,
        readerSettings.geminiModel
      );
      const res = inlineTranslations[slotKey];
      if (res?.ok && res.translatedText.trim()) {
        translated++;
      } else if (res && !res.ok) {
        errored++;
        if (!firstError) firstError = res.error || 'Sebagian paragraf gagal diterjemahkan.';
      }
    }
    const pending = Math.max(0, paragraphs.length - translated - errored);
    return {
      total: paragraphs.length,
      translated,
      pending,
      errorMessage: firstError,
    };
  }, [
    chapterIndex,
    inlineTranslations,
    paragraphs,
    readerSettings.geminiModel,
    readerSettings.paragraphTranslateEnabled,
    readerSettings.targetLanguage,
    readerSettings.translationProvider,
  ]);

  // Synchronize rendered content (ON/OFF/language switch & incremental batch completions) with TTS controller
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || renderedParagraphs.length === 0) return;

    const modelScope =
      readerSettings.translationProvider === 'gemini' ? readerSettings.geminiModel : '';
    const nextSyncSignature = `${chapterIndex}|${paragraphsVersionRef.current}|${readerSettings.paragraphTranslateEnabled}|${readerSettings.targetLanguage}|${readerSettings.translationProvider}|${modelScope}`;
    const chapTitle =
      chapters[chapterIndex]?.title || `Bab ${chapterIndex + 1}`;
    const hasPending =
      readerSettings.paragraphTranslateEnabled &&
      (isTranslatingBatch || translationStats.pending > 0);

    const prevSentences =
      prevRenderedSentencesRef.current.length > 0
        ? prevRenderedSentencesRef.current
        : renderedSentences;

    if (prevSyncSignatureRef.current !== nextSyncSignature) {
      const wasPlaying = controller.getIsPlaying();
      const mapped = mapSentenceCursorAcrossRender(
        prevSentences,
        activeSentenceRef.current,
        renderedParagraphs,
        renderedSentences
      );

      activeSentenceRef.current = mapped.sentenceIndex;
      activeWordRef.current = mapped.wordIndex;
      activeOffsetRef.current = mapped.chapterOffset;
      setActiveSentenceIdx(mapped.sentenceIndex);
      setActiveCharOffset(mapped.chapterOffset);

      controller.setBookContext(
        bookMeta.title,
        chapTitle,
        renderedParagraphs,
        renderedSentences,
        mapped.chapterOffset,
        chapterIndex,
        bookCtx,
        {
          translatedFlags: translatedParagraphFlags,
          hasPendingTranslations: hasPending,
        }
      );

      prevSyncSignatureRef.current = nextSyncSignature;
      prevRenderedSentencesRef.current = renderedSentences;
      prevTranslatedFlagsRef.current = translatedParagraphFlags;

      if (wasPlaying) {
        void controller.playFromOffset(mapped.chapterOffset);
      }
      return;
    }

    // Incremental batch translation finished another paragraph in current chapter/mode
    const mapped = mapSentenceCursorAcrossRender(
      prevSentences,
      activeSentenceRef.current,
      renderedParagraphs,
      renderedSentences
    );
    const activeParaIdx = mapped.paragraphIndex;
    const prevFlags = prevTranslatedFlagsRef.current;
    const activeParaJustTranslated =
      controller.getIsPlaying() &&
      !prevFlags[activeParaIdx] &&
      Boolean(translatedParagraphFlags[activeParaIdx]);

    activeSentenceRef.current = mapped.sentenceIndex;
    activeWordRef.current = mapped.wordIndex;
    activeOffsetRef.current = mapped.chapterOffset;
    setActiveSentenceIdx(mapped.sentenceIndex);
    setActiveCharOffset(mapped.chapterOffset);

    prevRenderedSentencesRef.current = renderedSentences;
    prevTranslatedFlagsRef.current = translatedParagraphFlags;

    if (activeParaJustTranslated) {
      controller.setBookContext(
        bookMeta.title,
        chapTitle,
        renderedParagraphs,
        renderedSentences,
        mapped.chapterOffset,
        chapterIndex,
        bookCtx,
        {
          translatedFlags: translatedParagraphFlags,
          hasPendingTranslations: hasPending,
        }
      );
      void controller.playFromOffset(mapped.chapterOffset);
    } else {
      controller.updateRenderedContextKeepPlayback(
        renderedParagraphs,
        renderedSentences,
        translatedParagraphFlags,
        hasPending
      );
    }
  }, [
    bookCtx,
    bookMeta.title,
    chapterIndex,
    chapters,
    isTranslatingBatch,
    readerSettings.geminiModel,
    readerSettings.paragraphTranslateEnabled,
    readerSettings.targetLanguage,
    readerSettings.translationProvider,
    renderedParagraphs,
    renderedSentences,
    translatedParagraphFlags,
    translationStats.pending,
  ]);

  // Compute virtual pages dynamically from layout settings & viewport (using original coordinate mapping)
  const virtualPageSummary = useMemo(() => {
    if (chapterCharLengths.length === 0) return null;
    const charsPerPage = estimateCharsPerVirtualPage(
      readerSettings,
      viewportSize.w,
      viewportSize.h
    );
    return calculateBookVirtualPages(chapterCharLengths, charsPerPage);
  }, [chapterCharLengths, readerSettings, viewportSize.h, viewportSize.w]);

  const activeOriginalOffset = useMemo(
    () =>
      mapRenderedOffsetToOriginalOffset(renderedSentences, activeSentenceIdx, paragraphs),
    [activeSentenceIdx, paragraphs, renderedSentences]
  );

  const virtualLocation = useMemo(() => {
    if (!virtualPageSummary) {
      return {
        bookVirtualPage: 1,
        totalVirtualPages: Math.max(1, chapters.length),
        chapterLocalPage: 1,
        chapterTotalPages: 1,
      };
    }
    return resolveVirtualPageLocation(virtualPageSummary, chapterIndex, activeOriginalOffset);
  }, [activeOriginalOffset, chapterIndex, chapters.length, virtualPageSummary]);

  const handleSeekVirtualPage = useCallback(
    (targetPage: number) => {
      if (!virtualPageSummary) return;
      const target = findTargetFromVirtualPage(virtualPageSummary, targetPage);
      if (target.chapterIndex !== chapterIndex) {
        void handleSelectChapter(target.chapterIndex, false, target.charOffset);
      } else {
        const origLoc = findLocationAtChapterOffset(allSentences, target.charOffset);
        const targetRenderedPara = renderedParagraphs[origLoc.paragraphIndex];
        const targetOffset = targetRenderedPara?.chapterStartChar ?? 0;
        const loc = findLocationAtChapterOffset(renderedSentences, targetOffset);
        setActiveSentenceIdx(loc.sentenceIndex);
        activeSentenceRef.current = loc.sentenceIndex;
        activeWordRef.current = loc.wordIndex;
        activeOffsetRef.current = loc.chapterOffset;
        setActiveCharOffset(loc.chapterOffset);
        const el = sentenceRefs.current.get(loc.sentenceIndex);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [allSentences, chapterIndex, handleSelectChapter, renderedParagraphs, renderedSentences, virtualPageSummary]
  );

  // Scroll highlighted sentence into view during TTS playback
  useEffect(() => {
    const el = sentenceRefs.current.get(activeSentenceIdx);
    if (isPlaying && el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (readerSettings.readingMode === 'paginated' && renderedParagraphs.length > 0) {
      const targetParaIdx = renderedSentences[activeSentenceIdx]?.paragraphIndex ?? 0;
      const targetPage = Math.floor(targetParaIdx / PARAGRAPHS_PER_PAGE);
      if (targetPage !== pageIndex) {
        setPageIndex(targetPage);
      }
    }
  }, [
    PARAGRAPHS_PER_PAGE,
    activeSentenceIdx,
    isPlaying,
    pageIndex,
    readerSettings.readingMode,
    renderedParagraphs.length,
    renderedSentences,
  ]);

  // Prioritized inline paragraph translation batch fetcher (starts from current paragraph forward)
  useEffect(() => {
    if (!readerSettings.paragraphTranslateEnabled || paragraphs.length === 0) {
      setIsTranslatingBatch(false);
      return;
    }

    let cancelled = false;
    setIsTranslatingBatch(true);

    const startParaIdx = Math.max(
      0,
      Math.min(
        renderedSentences[activeSentenceRef.current]?.paragraphIndex ?? 0,
        paragraphs.length - 1
      )
    );
    const orderedParagraphs = [
      ...paragraphs.slice(startParaIdx),
      ...paragraphs.slice(0, startParaIdx),
    ];

    async function runBatch() {
      try {
        for (const para of orderedParagraphs) {
          if (cancelled) return;
          const slotKey = buildParagraphTranslationSlotKey(
            chapterIndex,
            para.id,
            para.rawText,
            readerSettings.targetLanguage,
            readerSettings.translationProvider,
            readerSettings.geminiModel
          );
          if (inlineTranslations[slotKey]?.ok) continue;

          const res = await translateText(
            para.rawText,
            readerSettings.targetLanguage,
            safeBookLang,
            {
              provider: readerSettings.translationProvider,
              libreTranslateUrl: readerSettings.libreTranslateUrl,
              geminiApiKey: readerSettings.geminiApiKey,
              geminiModel: readerSettings.geminiModel,
            }
          );
          if (cancelled) return;
          setInlineTranslations((prev) => ({ ...prev, [slotKey]: res }));
        }
      } finally {
        if (!cancelled) {
          setIsTranslatingBatch(false);
        }
      }
    }

    void runBatch();
    return () => {
      cancelled = true;
    };
    // Note: intentionally exclude `inlineTranslations` & `renderedSentences` so we don't restart
    // the active ordered loop after each single paragraph finishes translating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chapterIndex,
    paragraphs,
    readerSettings.geminiApiKey,
    readerSettings.geminiModel,
    readerSettings.libreTranslateUrl,
    readerSettings.paragraphTranslateEnabled,
    readerSettings.targetLanguage,
    readerSettings.translationProvider,
    safeBookLang,
    translateRetryTick,
  ]);

  const triggerTranslationPopup = useCallback(
    async (text: string, sentenceIdx: number | null, langOverride?: TargetLanguageCode) => {
      const targetLang = langOverride ?? readerSettings.targetLanguage;
      setPopupSourceText(text);
      setPopupSentenceIdx(sentenceIdx);
      setPopupLoading(true);
      const res = await translateText(text, targetLang, safeBookLang, {
        provider: readerSettings.translationProvider,
        libreTranslateUrl: readerSettings.libreTranslateUrl,
        geminiApiKey: readerSettings.geminiApiKey,
        geminiModel: readerSettings.geminiModel,
      });
      setPopupResult(res);
      setPopupLoading(false);
    },
    [
      readerSettings.geminiApiKey,
      readerSettings.geminiModel,
      readerSettings.libreTranslateUrl,
      readerSettings.targetLanguage,
      readerSettings.translationProvider,
      safeBookLang,
    ]
  );

  const handleReadFromSentence = (sentenceIdx: number) => {
    setSelectionMenu(null);
    setTtsBarExpanded(true);
    void controllerRef.current?.playFromSentence(sentenceIdx);
  };

  const detectTopmostViewportParagraph = useCallback((): number => {
    const headerEl = document.querySelector('header');
    const visibleTopEdge = headerEl ? headerEl.getBoundingClientRect().bottom : 0;
    const bottomBarEl = document.querySelector('[data-reader-bottom-bar]');
    const visibleBottomEdge = bottomBarEl
      ? bottomBarEl.getBoundingClientRect().top
      : window.innerHeight;

    const paraEls = Array.from(
      document.querySelectorAll('article [data-paragraph-index]')
    ) as HTMLElement[];
    const rects = paraEls
      .map((el) => {
        const idx = Number(el.dataset.paragraphIndex);
        const r = el.getBoundingClientRect();
        return Number.isFinite(idx)
          ? { paragraphIndex: idx, top: r.top, bottom: r.bottom }
          : null;
      })
      .filter((x): x is ParagraphViewportRect => Boolean(x));

    if (rects.length === 0) {
      return renderedSentences[activeSentenceRef.current]?.paragraphIndex ?? 0;
    }
    return findTopmostVisibleParagraphIndex(rects, visibleTopEdge, visibleBottomEdge);
  }, [renderedSentences]);

  const handleTogglePlay = () => {
    if (!controllerRef.current) return;
    if (isPlaying) {
      controllerRef.current.pause();
      return;
    }
    const topmostPara = detectTopmostViewportParagraph();
    setLastTtsPosition(getTtsLastPosition(bookMeta.id));
    setTtsChoiceModal({
      open: true,
      startHereParagraphIndex: topmostPara,
    });
  };

  const handleConfirmStartHere = () => {
    if (!controllerRef.current || !ttsChoiceModal) return;
    const target = resolveStartFromViewportTarget(
      ttsChoiceModal.startHereParagraphIndex,
      renderedParagraphs,
      renderedSentences
    );
    setTtsChoiceModal(null);

    if (notificationStatus.isNative && !notificationStatus.granted) {
      void requestAndroidNotificationPermission().then((granted) => {
        setNotificationStatus((prev) => ({ ...prev, granted }));
      });
    }

    activeSentenceRef.current = target.sentenceIndex;
    activeWordRef.current = target.wordIndex;
    activeOffsetRef.current = target.chapterOffset;
    setActiveSentenceIdx(target.sentenceIndex);
    setActiveCharOffset(target.chapterOffset);
    setTtsBarExpanded(true);
    persistTtsLastSnapshot(target.sentenceIndex, target.wordIndex, true);
    void controllerRef.current.playFromOffset(target.chapterOffset);
  };

  const handleConfirmResumePrevious = () => {
    if (!controllerRef.current) return;
    const saved = getTtsLastPosition(bookMeta.id) ?? lastTtsPosition;
    if (!saved) return;
    setTtsChoiceModal(null);

    if (notificationStatus.isNative && !notificationStatus.granted) {
      void requestAndroidNotificationPermission().then((granted) => {
        setNotificationStatus((prev) => ({ ...prev, granted }));
      });
    }

    setTtsBarExpanded(true);

    if (saved.chapterIndex !== chapterIndexRef.current) {
      void handleSelectChapter(saved.chapterIndex, true, saved.originalCharOffset, saved);
      return;
    }

    const target = resolveTtsResumeTarget(saved, renderedParagraphs, renderedSentences);
    activeSentenceRef.current = target.sentenceIndex;
    activeWordRef.current = target.wordIndex;
    activeOffsetRef.current = target.chapterOffset;
    setActiveSentenceIdx(target.sentenceIndex);
    setActiveCharOffset(target.chapterOffset);

    if (readerSettings.readingMode === 'paginated') {
      const targetPage = Math.floor(target.paragraphIndex / PARAGRAPHS_PER_PAGE);
      if (targetPage !== pageIndex) {
        setPageIndex(targetPage);
      }
    }

    persistTtsLastSnapshot(target.sentenceIndex, target.wordIndex, true);
    void controllerRef.current.playFromOffset(target.chapterOffset);
    window.requestAnimationFrame(() => {
      sentenceRefs.current
        .get(target.sentenceIndex)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const handleAddBookmark = async () => {
    const currentSent = renderedSentences[activeSentenceIdx];
    const currentChapTitle = chapters[chapterIndex]?.title || `Bab ${chapterIndex + 1}`;
    const item: BookmarkItem = {
      id: `bm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      bookId: bookMeta.id,
      chapterIndex,
      chapterTitle: currentChapTitle,
      charOffset: activeOriginalOffset,
      quote: currentSent?.text.slice(0, 140) || currentChapTitle,
      progressPercent: bookMeta.progressPercent,
      createdAt: Date.now(),
    };
    await saveBookmark(item);
    setBookmarks((prev) => [item, ...prev]);
    showToast('Penanda posisi baca ditambahkan.');
  };

  const handleAddHighlight = async (
    text: string,
    sentenceIndex: number,
    charOffset: number,
    color: HighlightColor,
    note = ''
  ) => {
    const currentChapTitle = chapters[chapterIndex]?.title || `Bab ${chapterIndex + 1}`;
    const item: HighlightItem = {
      id: `hl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      bookId: bookMeta.id,
      chapterIndex,
      chapterTitle: currentChapTitle,
      charOffset,
      sentenceIndex,
      text: text.trim(),
      note: note.trim(),
      color,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveHighlight(item);
    setHighlights((prev) => [...prev, item]);
    setSelectionMenu(null);
    setNoteDialog(null);
    showToast(note ? 'Highlight & catatan disimpan.' : 'Teks disorot.');
  };

  const handleReaderSelectionUp = () => {
    const selection = window.getSelection();
    const sel = (selection?.toString() ?? '').replace(/\u00AD/g, '').trim();
    if (sel.length >= 1 && sel.length <= 800) {
      let sentIdx = activeSentenceIdx;
      let paraIdx = renderedSentences[activeSentenceIdx]?.paragraphIndex;
      let charOffset = activeCharOffset;

      const anchorEl =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement;
      const sentEl = anchorEl?.closest('[data-sentence-index]') as HTMLElement | null;
      const paraEl = anchorEl?.closest('[data-paragraph-index]') as HTMLElement | null;

      if (sentEl) {
        const parsedIdx = Number(sentEl.dataset.sentenceIndex);
        if (Number.isFinite(parsedIdx) && renderedSentences[parsedIdx]) {
          sentIdx = parsedIdx;
          const sent = renderedSentences[parsedIdx];
          paraIdx = sent.paragraphIndex;
          const posInSent = sent.text.toLowerCase().indexOf(sel.toLowerCase());
          charOffset =
            posInSent >= 0 ? sent.chapterStartChar + posInSent : sent.chapterStartChar;
        }
      } else if (paraEl) {
        const parsedPara = Number(paraEl.dataset.paragraphIndex);
        if (Number.isFinite(parsedPara)) paraIdx = parsedPara;
      }

      setSelectionMenu({
        text: sel,
        sentenceIndex: sentIdx,
        paragraphIndex: paraIdx,
        charOffset,
      });
    }
  };

  const handleSentenceLongPressStart = (sentence: SentenceSegment) => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setSelectionMenu({
        text: sentence.text,
        sentenceIndex: sentence.globalIndex,
        paragraphIndex: sentence.paragraphIndex,
        charOffset: sentence.chapterStartChar,
      });
    }, 420);
  };

  const handleSentenceLongPressEnd = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCanvasTap = (e: React.MouseEvent<HTMLElement>) => {
    const sel = (window.getSelection()?.toString() ?? '').replace(/\u00AD/g, '').trim();
    if (sel.length >= 1) return;
    if (selectionMenu) {
      setSelectionMenu(null);
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) return;

    // If TTS mini-player is open & user taps a sentence directly, show contextual sentence bar (v1 compatible)
    const sentEl = target.closest('[data-sentence-index]') as HTMLElement | null;
    if (sentEl && (ttsBarExpanded || isPlaying)) {
      const idx = Number(sentEl.dataset.sentenceIndex);
      const sent = renderedSentences[idx];
      if (sent) {
        setSelectionMenu({
          text: sent.text,
          sentenceIndex: sent.globalIndex,
          paragraphIndex: sent.paragraphIndex,
          charOffset: sent.chapterStartChar,
        });
        return;
      }
    }

    // Center tap toggles immersive bars
    setBarsVisible((v) => !v);
    setMenuOpen(false);
  };

  const currentChapterHighlights = useMemo(
    () => highlights.filter((h) => h.chapterIndex === chapterIndex),
    [chapterIndex, highlights]
  );

  const sentenceHighlightMap = useMemo(() => {
    const map = new Map<number, HighlightColor>();
    for (const h of currentChapterHighlights) {
      map.set(h.sentenceIndex, h.color);
    }
    return map;
  }, [currentChapterHighlights]);

  const totalPages = Math.max(1, Math.ceil(renderedParagraphs.length / PARAGRAPHS_PER_PAGE));
  const visibleParagraphs = useMemo(() => {
    if (readerSettings.readingMode === 'scroll') return renderedParagraphs;
    const start = pageIndex * PARAGRAPHS_PER_PAGE;
    return renderedParagraphs.slice(start, start + PARAGRAPHS_PER_PAGE);
  }, [PARAGRAPHS_PER_PAGE, pageIndex, readerSettings.readingMode, renderedParagraphs]);

  const pageAnimClass =
    readerSettings.pageAnimation === 'horizontal'
      ? 'anim-page-horizontal'
      : readerSettings.pageAnimation === 'vertical'
        ? 'anim-page-vertical'
        : readerSettings.pageAnimation === 'fade'
          ? 'anim-page-fade'
          : '';

  const customFontFamily = useMemo(() => {
    if (!readerSettings.font.startsWith('custom:')) return undefined;
    const id = readerSettings.font.slice('custom:'.length);
    return customFonts.find((cf) => cf.id === id)?.familyName;
  }, [customFonts, readerSettings.font]);

  const fontClass = customFontFamily
    ? ''
    : FONT_CLASS_MAP[readerSettings.font as ReaderFont] || 'font-reader-literata';

  const displayedChapters = useMemo(() => {
    if (!findReplaceDefaults.applyToToc || replaceRules.length === 0) return chapters;
    return chapters.map((ch) => ({
      ...ch,
      title: applyNonTtsRulesToPlainText(ch.title, replaceRules, bookCtx, ch.index),
    }));
  }, [bookCtx, chapters, findReplaceDefaults.applyToToc, replaceRules]);

  const displayedToc = useMemo(() => {
    if (!findReplaceDefaults.applyToToc || replaceRules.length === 0) return toc;
    return toc.map((t) => ({
      ...t,
      label: applyNonTtsRulesToPlainText(t.label, replaceRules, bookCtx, t.chapterIndex),
    }));
  }, [bookCtx, findReplaceDefaults.applyToToc, replaceRules, toc]);

  const currentChapterTitle = displayedChapters[chapterIndex]?.title || `Bab ${chapterIndex + 1}`;
  const chapterProgressPct =
    renderedSentences.length > 0
      ? Math.round(((activeSentenceIdx + 1) / renderedSentences.length) * 100)
      : 0;

  const isHyphenationActive =
    readerSettings.textAlign === 'justify' || readerSettings.textAlign === 'original-hyphen';
  const useIndonesianHyphenator =
    isHyphenationActive &&
    (renderedLocale.toLowerCase().startsWith('id') ||
      renderedLocale.toLowerCase().startsWith('ms'));

  const textAlignStyle: React.CSSProperties['textAlign'] =
    readerSettings.textAlign === 'left'
      ? 'left'
      : readerSettings.textAlign === 'justify'
        ? 'justify'
        : undefined;

  const cycleOrientation = () => {
    const order: OrientationLockMode[] = ['auto', 'portrait', 'landscape'];
    const idx = order.indexOf(readerSettings.orientationLock);
    const next = order[(idx + 1) % order.length];
    onUpdateReaderSettings({ orientationLock: next });
    showToast(
      next === 'auto'
        ? 'Orientasi: Otomatis'
        : next === 'portrait'
          ? 'Orientasi dikunci: Potret'
          : 'Orientasi dikunci: Lanskap'
    );
  };

  const brightnessOverlayOpacity = Math.max(0, Math.min(0.75, 1 - readerSettings.brightness));

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--nv-bg)] text-[var(--nv-text)] transition-colors duration-150">
      {/* Subtle Brightness Overlay for Cross-Platform Consistency */}
      {brightnessOverlayOpacity > 0.02 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[60] bg-black transition-opacity duration-100"
          style={{ opacity: brightnessOverlayOpacity }}
        />
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="pointer-events-none fixed top-[122px] left-1/2 z-50 -translate-x-1/2 rounded-[6px] border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] px-4 py-2 text-xs font-semibold text-[var(--nv-text)] shadow-xl whitespace-nowrap">
          {toastMessage}
        </div>
      )}

      {/* Undo Replace Snackbar ("N diganti" + BATALKAN) */}
      {undoSnackbar && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-[6px] border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] px-4 py-2.5 text-xs font-medium text-[var(--nv-text)] shadow-2xl"
        >
          <span>{undoSnackbar.message}</span>
          <button
            type="button"
            onClick={async () => {
              const snap = undoSnackbar;
              setUndoSnackbar(null);
              if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
              if (snap.previousRule) {
                await saveTextReplaceRule(snap.previousRule);
                const next = replaceRules.map((r) =>
                  r.id === snap.previousRule!.id ? snap.previousRule! : r
                );
                await applyUpdatedRulesToReader(next, !snap.previousRule.ttsOnly);
              } else if (snap.addedRuleId) {
                const removed = replaceRules.find((r) => r.id === snap.addedRuleId);
                await deleteTextReplaceRule(snap.addedRuleId);
                const next = replaceRules.filter((r) => r.id !== snap.addedRuleId);
                await applyUpdatedRulesToReader(next, !removed?.ttsOnly);
              }
              showToast('Perubahan dibatalkan.');
            }}
            className="shrink-0 font-bold tracking-wide text-[var(--nv-gold)] hover:underline whitespace-nowrap"
          >
            BATALKAN
          </button>
        </div>
      )}

      {/* Top Reader Bar (ReadEra Teal Header + Title/Author/Page + Brightness Strip) */}
      {barsVisible && (
        <header className="sticky top-0 z-30 shadow-md pt-safe">
          <div className="bg-[var(--nv-teal)] text-[var(--nv-teal-text)]">
            <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-1 px-1.5 sm:px-4">
              <button
                type="button"
                onClick={() => {
                  if (controllerRef.current?.getIsPlaying() || wasTtsPlayingRef.current) {
                    const pos = controllerRef.current?.getPosition();
                    if (pos) {
                      persistTtsLastSnapshot(pos.sentenceIndex, pos.wordIndex, true);
                    }
                  }
                  controllerRef.current?.pause();
                  void persistPosition(
                    chapterIndexRef.current,
                    activeOffsetRef.current,
                    activeSentenceRef.current,
                    activeWordRef.current,
                    chapters.length || bookMeta.totalChapters
                  );
                  onBackToLibrary();
                }}
                aria-label="Kembali ke Perpustakaan"
                className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="relative flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTtsBarExpanded((v) => !v);
                    if (!isPlaying && !ttsBarExpanded) {
                      setTtsBarExpanded(true);
                    }
                  }}
                  aria-label="Tampilkan atau tutup kontrol TTS"
                  title="Baca Suara (TTS)"
                  className={`inline-flex min-h-[40px] min-w-[36px] sm:min-w-[40px] items-center justify-center rounded-lg ${
                    isPlaying || ttsBarExpanded
                      ? 'bg-white/15 text-[var(--nv-ui-bar-highlight)]'
                      : 'text-[var(--nv-teal-text)] hover:bg-white/10'
                  }`}
                >
                  <Volume2 className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextEnabled = !readerSettings.paragraphTranslateEnabled;
                    onUpdateReaderSettings({ paragraphTranslateEnabled: nextEnabled });
                    showToast(
                      nextEnabled
                        ? `Terjemahan aktif (${readerSettings.targetLanguage.toUpperCase()})`
                        : 'Teks asli dipulihkan'
                    );
                  }}
                  aria-pressed={readerSettings.paragraphTranslateEnabled}
                  aria-label={
                    readerSettings.paragraphTranslateEnabled
                      ? 'Matikan terjemahan halaman'
                      : 'Terjemahkan halaman'
                  }
                  title={
                    readerSettings.paragraphTranslateEnabled
                      ? 'Matikan Terjemahan (Kembalikan Teks Asli)'
                      : 'Terjemahkan Halaman'
                  }
                  className={`inline-flex min-h-[40px] min-w-[36px] sm:min-w-[40px] items-center justify-center rounded-lg ${
                    readerSettings.paragraphTranslateEnabled
                      ? 'bg-white/15 text-[var(--nv-ui-bar-highlight)]'
                      : 'text-[var(--nv-teal-text)] hover:bg-white/10'
                  }`}
                >
                  <Languages className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Cari dalam buku"
                  title="Cari"
                  className="inline-flex min-h-[40px] min-w-[36px] sm:min-w-[40px] items-center justify-center rounded-lg text-white hover:bg-white/10"
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => setTocOpen(true)}
                  aria-label="Buka Daftar Isi, Penanda, dan Kutipan"
                  title="Daftar Isi"
                  className="inline-flex min-h-[40px] min-w-[36px] sm:min-w-[40px] items-center justify-center rounded-lg text-white hover:bg-white/10"
                >
                  <List className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => setAppearanceOpen(true)}
                  aria-label="Buka Setelan Tampilan"
                  title="Setelan Tampilan"
                  className="inline-flex min-h-[40px] min-w-[36px] sm:min-w-[40px] items-center justify-center rounded-lg text-white hover:bg-white/10"
                >
                  <Settings className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Menu lainnya"
                  className="inline-flex min-h-[40px] min-w-[36px] sm:min-w-[40px] items-center justify-center rounded-lg text-white hover:bg-white/10"
                >
                  <MoreVertical className="h-5 w-5" aria-hidden="true" />
                </button>

                {menuOpen && (
                  <div className="absolute right-1 top-11 z-40 w-60 rounded-[6px] border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] p-1 text-[var(--nv-text)] shadow-2xl">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void handleAddBookmark();
                      }}
                      className="flex min-h-[42px] w-full items-center gap-2.5 rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                    >
                      <BookmarkPlus className="h-4 w-4 text-[var(--nv-gold)]" />
                      <span>Tambah Penanda Posisi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        const nextEnabled = !readerSettings.paragraphTranslateEnabled;
                        onUpdateReaderSettings({ paragraphTranslateEnabled: nextEnabled });
                        showToast(
                          nextEnabled
                            ? `Terjemahan aktif (${readerSettings.targetLanguage.toUpperCase()})`
                            : 'Teks asli dipulihkan'
                        );
                      }}
                      className="flex min-h-[42px] w-full items-center gap-2.5 rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                    >
                      <Languages className="h-4 w-4 text-[var(--nv-cyan)]" />
                      <span>
                        {readerSettings.paragraphTranslateEnabled
                          ? 'Matikan Terjemahan (Teks Asli)'
                          : 'Terjemahkan Halaman'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setFindReplaceState({
                          open: true,
                          mode: 'manual',
                          initialPattern: '',
                          editingRule: null,
                          presetTtsOnly: false,
                          paragraphIndex: allSentences[activeSentenceIdx]?.paragraphIndex,
                          charOffset: activeCharOffset,
                        });
                      }}
                      className="flex min-h-[42px] w-full items-center gap-2.5 rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                    >
                      <Replace className="h-4 w-4 text-[var(--nv-gold)]" />
                      <span>Cari &amp; ganti</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setRulesModalFilter('all');
                        setRulesModalOpen(true);
                      }}
                      className="flex min-h-[42px] w-full items-center gap-2.5 rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                    >
                      <SlidersHorizontal className="h-4 w-4 text-[var(--nv-cyan)]" />
                      <span>Aturan ganti teks ({replaceRules.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setTtsSheetOpen(true);
                      }}
                      className="flex min-h-[42px] w-full items-center gap-2.5 rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                    >
                      <Volume2 className="h-4 w-4 text-[var(--nv-gold)]" />
                      <span>Pengaturan Suara (TTS)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setBarsVisible(false);
                      }}
                      className="flex min-h-[42px] w-full items-center gap-2.5 rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                    >
                      <FileText className="h-4 w-4 text-[var(--nv-muted)]" />
                      <span>Mode Layar Penuh</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Book Title, Author, Chapter Name & In-Chapter Page Directly Inside Teal Bar */}
            <div className="mx-auto max-w-5xl px-3.5 pb-2.5 sm:px-5">
              <p className="truncate text-sm font-bold leading-snug text-white">
                {bookMeta.title}
              </p>
              <p className="truncate text-[11px] leading-tight text-white/80">
                {bookMeta.author}
              </p>
              <p className="truncate text-[11px] leading-tight text-white/85 tabular-nums">
                {currentChapterTitle} - halaman {virtualLocation.chapterLocalPage} /{virtualLocation.chapterTotalPages}
              </p>
            </div>
          </div>

          {/* Collapsible Brightness Bar */}
          <div className="border-b border-white/10 bg-[#2a2a2c]/95 text-white/80 backdrop-blur-sm">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-2.5 px-3 py-1 sm:px-5">
              {!readerSettings.brightnessCollapsed ? (
                <>
                  <Sun className="h-4 w-4 shrink-0 text-white/75" aria-hidden="true" />
                  <input
                    type="range"
                    aria-label="Kecerahan layar"
                    min={0.2}
                    max={1.0}
                    step={0.05}
                    value={readerSettings.brightness}
                    onChange={(e) => onUpdateReaderSettings({ brightness: Number(e.target.value) })}
                    style={{
                      background: `linear-gradient(to right, #8e8e93 ${((readerSettings.brightness - 0.2) / 0.8) * 100}%, rgba(255,255,255,0.18) ${((readerSettings.brightness - 0.2) / 0.8) * 100}%)`,
                      height: '3px',
                      borderRadius: '9999px',
                    }}
                    className="nv-range nv-range-grey flex-1"
                  />
                  <span className="w-9 text-right text-[11px] font-medium tabular-nums text-white/75">
                    {Math.round(readerSettings.brightness * 100)}%
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] text-white/75">
                  <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Kecerahan {Math.round(readerSettings.brightness * 100)}%</span>
                </span>
              )}

              <button
                type="button"
                onClick={() =>
                  onUpdateReaderSettings({
                    brightnessCollapsed: !readerSettings.brightnessCollapsed,
                  })
                }
                aria-label={
                  readerSettings.brightnessCollapsed
                    ? 'Buka slider kecerahan'
                    : 'Lipat slider kecerahan'
                }
                className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/10"
              >
                {readerSettings.brightnessCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Main Reading Canvas */}
      <main
        onMouseUp={handleReaderSelectionUp}
        onTouchEnd={handleReaderSelectionUp}
        onClick={handleCanvasTap}
        style={{
          paddingTop: `${readerSettings.margins.top}px`,
          paddingRight: `${readerSettings.margins.right}px`,
          paddingBottom: `${readerSettings.margins.bottom}px`,
          paddingLeft: `${readerSettings.margins.left}px`,
        }}
        className={`mx-auto w-full flex-1 select-text ${
          readerSettings.twoPageSpread && viewportSize.w >= 768 ? 'max-w-5xl' : 'max-w-[70ch]'
        }`}
      >
        {isLoadingBook ? (
          <div className="space-y-4 py-8">
            <div className="h-7 w-2/3 animate-pulse rounded-lg bg-[var(--nv-border)]" />
            <div className="h-4 w-full animate-pulse rounded-lg bg-[var(--nv-border)]" />
            <div className="h-4 w-11/12 animate-pulse rounded-lg bg-[var(--nv-border)]" />
            <div className="h-4 w-4/5 animate-pulse rounded-lg bg-[var(--nv-border)]" />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {loadError}
          </div>
        ) : (
          <>
            {readerSettings.paragraphTranslateEnabled &&
              (isTranslatingBatch || translationStats.errorMessage) && (
                <div
                  role="status"
                  className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-3 py-2 text-xs text-[var(--nv-muted)]"
                >
                  <span>
                    {isTranslatingBatch
                      ? `Menerjemahkan konten (${translationStats.translated}/${translationStats.total} paragraf)...`
                      : translationStats.errorMessage}
                  </span>
                  <div className="flex items-center gap-2">
                    {!isTranslatingBatch && translationStats.errorMessage && (
                      <button
                        type="button"
                        onClick={() => setTranslateRetryTick((t) => t + 1)}
                        className="font-semibold text-[var(--nv-cyan)] hover:underline"
                      >
                        Coba lagi
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateReaderSettings({ paragraphTranslateEnabled: false })
                      }
                      className="font-semibold text-[var(--nv-text)] hover:underline"
                    >
                      Teks Asli
                    </button>
                  </div>
                </div>
              )}

            <article
              key={`${chapterIndex}-${pageIndex}`}
              lang={renderedLocale}
              data-translated-mode={readerSettings.paragraphTranslateEnabled ? 'on' : 'off'}
              className={`${fontClass} ${pageAnimClass} ${isHyphenationActive ? 'nv-hyphen-auto' : ''} ${
                readerSettings.twoPageSpread && viewportSize.w >= 768
                  ? `columns-2 gap-10 ${
                      readerSettings.pageGapBorder
                        ? '[column-rule:1px_solid_var(--nv-border)]'
                        : ''
                    }`
                  : ''
              }`}
              style={{
                fontFamily: customFontFamily ? `"${customFontFamily}", serif` : undefined,
                fontSize: `${readerSettings.fontSize}px`,
                fontWeight: readerSettings.fontWeight,
                lineHeight: readerSettings.lineHeight,
                textAlign: textAlignStyle,
              }}
            >
              {visibleParagraphs.map((para) => {
                const Tag =
                  para.tag === 'h1'
                    ? 'h1'
                    : para.tag === 'h2'
                      ? 'h2'
                      : para.tag === 'h3'
                        ? 'h3'
                        : para.tag === 'blockquote'
                          ? 'blockquote'
                          : 'p';

                const tagStyle =
                  para.tag === 'h1'
                    ? 'mb-6 text-center text-2xl font-bold leading-tight tracking-tight sm:text-3xl'
                    : para.tag === 'h2'
                      ? 'mb-4 mt-7 text-left text-xl font-bold leading-snug'
                      : para.tag === 'h3'
                        ? 'mb-3 mt-5 text-left text-lg font-semibold'
                        : para.tag === 'blockquote'
                          ? 'my-4 border-l-2 border-[var(--nv-gold)]/60 pl-4 italic text-[var(--nv-muted)]'
                          : 'indent-6';

                return (
                  <div
                    key={para.id}
                    data-paragraph-index={para.index}
                    data-translated={translatedParagraphFlags[para.index] ? 'true' : 'false'}
                    style={{ marginBottom: `${readerSettings.paragraphSpacingPx}px` }}
                    className={para.isFootnote ? 'text-[0.88em] text-[var(--nv-muted)]' : ''}
                  >
                    <Tag className={tagStyle}>
                      {para.sentences.map((sentence) => {
                        const isCurrentSentence =
                          (isPlaying || ttsBarExpanded) && sentence.globalIndex === activeSentenceIdx;
                        const hlColor = sentenceHighlightMap.get(sentence.globalIndex);
                        const hlClass = hlColor ? HIGHLIGHT_BG_MAP[hlColor] : '';

                        return (
                          <React.Fragment key={sentence.globalIndex}>
                            <span
                              ref={(node) => {
                                if (node) sentenceRefs.current.set(sentence.globalIndex, node);
                                else sentenceRefs.current.delete(sentence.globalIndex);
                              }}
                              data-sentence-index={sentence.globalIndex}
                              onPointerDown={() => handleSentenceLongPressStart(sentence)}
                              onPointerUp={handleSentenceLongPressEnd}
                              onPointerCancel={handleSentenceLongPressEnd}
                              onDoubleClick={(ev) => {
                                ev.stopPropagation();
                                setSelectionMenu({
                                  text: sentence.text,
                                  sentenceIndex: sentence.globalIndex,
                                  charOffset: sentence.chapterStartChar,
                                });
                              }}
                              className={`rounded-xs transition-colors duration-150 ${
                                isCurrentSentence ? 'tts-sentence-active' : hlClass
                              }`}
                            >
                              {sentence.words.map((word, wIdx) => {
                                const fmt = getWordFormat(word, para.inlineFormats);
                                const displayWord = useIndonesianHyphenator
                                  ? applyIndonesianHyphenation(word.text)
                                  : word.text;
                                const formatClass = `${fmt.italic ? 'italic' : ''} ${
                                  fmt.bold ? 'font-bold' : ''
                                }`.trim();

                                return (
                                  <React.Fragment key={word.wordIndex}>
                                    {formatClass ? (
                                      <span className={formatClass}>{displayWord}</span>
                                    ) : (
                                      displayWord
                                    )}
                                    {wIdx < sentence.words.length - 1 ? ' ' : ''}
                                  </React.Fragment>
                                );
                              })}
                            </span>{' '}
                          </React.Fragment>
                        );
                      })}
                    </Tag>
                  </div>
                );
              })}
            </article>
          </>
        )}

        {/* Paginated or Chapter Navigation Footer */}
        {!isLoadingBook && !loadError && (
          <div
            className={`mt-10 flex items-center justify-between gap-3 pt-6 ${
              readerSettings.pageGapBorder ? 'border-t border-[var(--nv-border)]' : ''
            }`}
          >
            {readerSettings.readingMode === 'paginated' && totalPages > 1 ? (
              <>
                <button
                  type="button"
                  disabled={pageIndex === 0 && chapterIndex === 0}
                  onClick={() => {
                    if (pageIndex > 0) setPageIndex((p) => p - 1);
                    else if (chapterIndex > 0) void handleSelectChapter(chapterIndex - 1);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[var(--nv-border)] px-3 sm:px-4 text-xs sm:text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Sebelumnya</span>
                </button>

                <span className="text-xs font-medium text-[var(--nv-muted)] tabular-nums whitespace-nowrap shrink-0">
                  Hal {pageIndex + 1} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={pageIndex >= totalPages - 1 && chapterIndex >= chapters.length - 1}
                  onClick={() => {
                    if (pageIndex < totalPages - 1) setPageIndex((p) => p + 1);
                    else if (chapterIndex < chapters.length - 1)
                      void handleSelectChapter(chapterIndex + 1);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[var(--nv-border)] px-3 sm:px-4 text-xs sm:text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={chapterIndex <= 0}
                  onClick={() => void handleSelectChapter(chapterIndex - 1)}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[var(--nv-border)] px-3 sm:px-4 text-xs sm:text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Bab Sebelumnya</span>
                </button>

                <span className="text-xs font-medium text-[var(--nv-muted)] tabular-nums whitespace-nowrap shrink-0">
                  Bab {chapterIndex + 1} / {Math.max(1, chapters.length)}
                </span>

                <button
                  type="button"
                  disabled={chapterIndex >= chapters.length - 1}
                  onClick={() => void handleSelectChapter(chapterIndex + 1)}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-[var(--nv-border)] px-3 sm:px-4 text-xs sm:text-sm font-medium disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <span>Bab Berikutnya</span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </main>

      {/* Rich Text Selection Menu (Salin, Highlight 5 warna, Catatan, Terjemahkan, Baca dari sini, Bagikan) */}
      {selectionMenu && (
        <div
          role="dialog"
          aria-label="Menu seleksi teks"
          className="fixed bottom-28 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] p-3.5 text-[var(--nv-text)] shadow-2xl space-y-2.5"
        >
          <p className="line-clamp-2 text-xs italic text-[var(--nv-muted)]">
            "{selectionMenu.text}"
          </p>

          {/* 5 Highlight Colors */}
          <div className="flex items-center justify-between gap-2 border-y border-[var(--nv-border)] py-2">
            <span className="text-xs font-semibold text-[var(--nv-muted)]">Sorot:</span>
            <div className="flex items-center gap-2">
              {HIGHLIGHT_SWATCHES.map((sw) => (
                <button
                  key={sw.color}
                  type="button"
                  aria-label={`Highlight ${sw.label}`}
                  onClick={() =>
                    void handleAddHighlight(
                      selectionMenu.text,
                      selectionMenu.sentenceIndex ?? activeSentenceIdx,
                      selectionMenu.charOffset,
                      sw.color
                    )
                  }
                  className={`h-7 w-7 rounded-full border border-black/20 transition-transform hover:scale-110 ${sw.bg}`}
                />
              ))}
            </div>
          </div>

          {/* 6 Action Buttons (Salin, Catatan, Terjemah, Ganti teks, Baca, Bagikan) */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(selectionMenu.text);
                setSelectionMenu(null);
                showToast('Teks disalin.');
              }}
              className="flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-2 text-xs font-semibold hover:brightness-110"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Salin</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNoteDialog({
                  text: selectionMenu.text,
                  sentenceIndex: selectionMenu.sentenceIndex ?? activeSentenceIdx,
                  charOffset: selectionMenu.charOffset,
                  color: 'yellow',
                  note: '',
                });
                setSelectionMenu(null);
              }}
              className="flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-2 text-xs font-semibold hover:brightness-110"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>Catatan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const { text, sentenceIndex } = selectionMenu;
                setSelectionMenu(null);
                void triggerTranslationPopup(text, sentenceIndex);
              }}
              className="flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-2 text-xs font-semibold hover:brightness-110"
            >
              <Languages className="h-3.5 w-3.5 text-[var(--nv-cyan)]" />
              <span>Terjemah</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const { text, paragraphIndex, charOffset } = selectionMenu;
                setSelectionMenu(null);
                setFindReplaceState({
                  open: true,
                  mode: 'selection',
                  initialPattern: text,
                  editingRule: null,
                  presetTtsOnly: false,
                  paragraphIndex,
                  charOffset,
                });
              }}
              className="flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-2 text-xs font-semibold hover:brightness-110 whitespace-nowrap"
            >
              <Replace className="h-3.5 w-3.5 text-[var(--nv-gold)]" />
              <span>Ganti teks</span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleReadFromSentence(selectionMenu.sentenceIndex ?? activeSentenceIdx)
              }
              className="flex min-h-[38px] items-center justify-center gap-1 rounded-lg bg-[var(--nv-ui-accent)] px-2 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Baca</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const txt = `"${selectionMenu.text}" — ${bookMeta.title}`;
                setSelectionMenu(null);
                try {
                  if (navigator.share) await navigator.share({ text: txt });
                  else {
                    await navigator.clipboard.writeText(txt);
                    showToast('Kutipan disalin untuk dibagikan.');
                  }
                } catch {
                  // Ignore
                }
              }}
              className="flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-2 text-xs font-semibold hover:brightness-110"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Bagikan</span>
            </button>
          </div>
        </div>
      )}

      {/* Note Composer Modal */}
      {noteDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setNoteDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] p-5 text-[var(--nv-text)] shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold">Tambah Catatan Kutipan</h2>
            <p className="line-clamp-3 rounded-lg bg-[var(--nv-sheet-card)] p-3 text-xs italic text-[var(--nv-muted)]">
              "{noteDialog.text}"
            </p>
            <textarea
              rows={3}
              autoFocus
              value={noteDialog.note}
              onChange={(e) => setNoteDialog({ ...noteDialog, note: e.target.value })}
              placeholder="Tulis catatan Anda di sini..."
              className="w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] p-3 text-sm focus:border-[var(--nv-cyan)] focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteDialog(null)}
                className="min-h-[40px] rounded-lg border border-[var(--nv-border)] px-4 text-xs font-medium hover:bg-white/5"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleAddHighlight(
                    noteDialog.text,
                    noteDialog.sentenceIndex,
                    noteDialog.charOffset,
                    noteDialog.color,
                    noteDialog.note
                  )
                }
                className="min-h-[40px] rounded-lg bg-[var(--nv-ui-accent)] px-4 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105"
              >
                Simpan Catatan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Bar & Expandable TTS Mini-Player */}
      <ReaderControlsBar
        visible={barsVisible}
        ttsBarExpanded={ttsBarExpanded}
        isPlaying={isPlaying}
        currentSentenceIndex={activeSentenceIdx}
        totalSentences={renderedSentences.length}
        bookVirtualPage={virtualLocation.bookVirtualPage}
        totalVirtualPages={virtualLocation.totalVirtualPages}
        chapterProgressPercent={chapterProgressPct}
        chapters={displayedChapters}
        virtualSummary={virtualPageSummary}
        sleepRemainingSec={sleepRemainingSec}
        sleepTimerMode={ttsSettings.sleepTimerMinutes}
        readingMode={ttsSettings.readingMode}
        rate={ttsSettings.rate}
        autoScrollEnabled={readerSettings.autoScrollEnabled}
        orientationLock={readerSettings.orientationLock}
        onTogglePlay={handleTogglePlay}
        onPrevSentence={() => controllerRef.current?.prevSentence()}
        onNextSentence={() => controllerRef.current?.nextSentence()}
        onPrevParagraph={() => controllerRef.current?.prevParagraph()}
        onNextParagraph={() => controllerRef.current?.nextParagraph()}
        onSeekVirtualPage={handleSeekVirtualPage}
        onToggleQuickMenu={() => setAppearanceOpen(true)}
        onToggleAutoScroll={() =>
          onUpdateReaderSettings({ autoScrollEnabled: !readerSettings.autoScrollEnabled })
        }
        onCycleOrientation={cycleOrientation}
        onToggleTtsBar={() => setTtsBarExpanded((v) => !v)}
        onOpenTtsSettings={() => setTtsSheetOpen(true)}
      />

      {/* Translation Popup */}
      <TranslationPopup
        sourceText={popupSourceText}
        sentenceIndex={popupSentenceIdx}
        targetLang={readerSettings.targetLanguage}
        loading={popupLoading}
        result={popupResult}
        onChangeTargetLang={(lang) => {
          onUpdateReaderSettings({ targetLanguage: lang });
          void triggerTranslationPopup(popupSourceText, popupSentenceIdx, lang);
        }}
        onReadFromHere={handleReadFromSentence}
        onSpeakTranslation={(translatedText, lang) => {
          void controllerRef.current?.speakAdhocText(translatedText, lang);
        }}
        onClose={() => {
          setPopupSourceText('');
          setPopupResult(null);
          setPopupSentenceIdx(null);
        }}
      />

      {/* In-Book Search Modal */}
      <BookSearchModal
        open={searchOpen}
        epubBook={openedEpub?.book ?? null}
        chapters={displayedChapters}
        replaceOptions={replaceOptions}
        onSelectMatch={(cIdx, offset) => void handleSelectChapter(cIdx, false, offset)}
        onClose={() => setSearchOpen(false)}
      />

      {/* 3-Tab TOC / Bookmarks / Quotes Drawer */}
      <TocDrawer
        open={tocOpen}
        bookTitle={bookMeta.title}
        toc={displayedToc}
        currentChapterIndex={chapterIndex}
        virtualPageSummary={virtualPageSummary}
        bookmarks={bookmarks}
        highlights={highlights}
        onSelectChapter={(idx, offset) => void handleSelectChapter(idx, false, offset ?? 0)}
        onAddCurrentBookmark={() => void handleAddBookmark()}
        onDeleteBookmark={(id) => {
          void deleteBookmark(id);
          setBookmarks((prev) => prev.filter((b) => b.id !== id));
        }}
        onDeleteHighlight={(id) => {
          void deleteHighlight(id);
          setHighlights((prev) => prev.filter((h) => h.id !== id));
        }}
        onClose={() => setTocOpen(false)}
      />

      {/* Appearance Settings Sheet */}
      <AppearanceSheet
        open={appearanceOpen}
        settings={readerSettings}
        customFonts={customFonts}
        presets={presets}
        onUpdate={onUpdateReaderSettings}
        onImportCustomFont={onImportCustomFont}
        onDeleteCustomFont={onDeleteCustomFont}
        onSavePreset={onSavePreset}
        onApplyPreset={onApplyPreset}
        onDeletePreset={onDeletePreset}
        onClose={() => setAppearanceOpen(false)}
      />

      {/* TTS Settings Sheet */}
      <TtsSettingsSheet
        open={ttsSheetOpen}
        settings={ttsSettings}
        ttsOnlyRules={replaceRules.filter((r) => r.ttsOnly)}
        voices={voices}
        engineCapabilities={engineCapabilities}
        notificationStatus={notificationStatus}
        sleepRemainingSec={sleepRemainingSec}
        onUpdate={onUpdateTtsSettings}
        onOpenManageTtsRules={() => {
          setRulesModalFilter('ttsOnly');
          setRulesModalOpen(true);
        }}
        onOpenAddTtsRule={() => {
          setFindReplaceState({
            open: true,
            mode: 'manual',
            initialPattern: '',
            editingRule: null,
            presetTtsOnly: true,
            paragraphIndex: allSentences[activeSentenceIdx]?.paragraphIndex,
            charOffset: activeCharOffset,
          });
        }}
        onPreviewVoice={(voiceURI) => {
          const sample = safeBookLang.toLowerCase().startsWith('en')
            ? 'This is a preview of the selected reading voice, flowing smoothly across sentences.'
            : 'Ini adalah contoh suara pembacaan NovelVoice yang mengalir alami antar kalimat.';
          void controllerRef.current?.previewVoice(voiceURI, sample);
        }}
        onRefreshVoices={refreshTtsVoices}
        onOpenAndroidTtsSettings={openNativeTtsSettings}
        onOpenBatteryOptimization={openBatteryOptimizationSettings}
        onRequestNotificationPermission={async () => {
          const granted = await requestAndroidNotificationPermission();
          setNotificationStatus((prev) => ({ ...prev, granted }));
        }}
        onClose={() => setTtsSheetOpen(false)}
      />

      {/* Find & Replace Popup (Tahap 8) */}
      <FindReplacePopup
        open={findReplaceState.open}
        mode={findReplaceState.mode}
        initialPattern={findReplaceState.initialPattern}
        editingRule={findReplaceState.editingRule}
        presetTtsOnly={findReplaceState.presetTtsOnly}
        defaults={findReplaceDefaults}
        chapterIndex={chapterIndex}
        paragraphIndex={findReplaceState.paragraphIndex}
        charOffset={findReplaceState.charOffset}
        bookId={bookMeta.id}
        bookSha1={bookMeta.sha1}
        seriesKey={seriesKey}
        chaptersData={effectivePreviewChapters}
        scanningChapters={scanningPreviewChapters}
        onUpdateDefaults={(patch) =>
          onUpdateReaderSettings({
            findReplaceDefaults: { ...findReplaceDefaults, ...patch },
          })
        }
        onApply={async (draft) => {
          const now = Date.now();
          let previousRule: TextReplaceRule | null = null;
          let savedRule: TextReplaceRule;
          let nextRules: TextReplaceRule[];

          if (draft.editingRuleId) {
            const existing = replaceRules.find((r) => r.id === draft.editingRuleId);
            previousRule = existing ? { ...existing } : null;
            savedRule = {
              ...(existing || {
                id: draft.editingRuleId,
                priority: replaceRules.length + 1,
                enabled: true,
                createdAt: now,
              }),
              pattern: draft.pattern,
              replacement: draft.replacement,
              caseSensitive: draft.caseSensitive,
              wholeWord: draft.wholeWord,
              preserveCase: draft.preserveCase,
              isRegex: draft.isRegex,
              ttsOnly: draft.ttsOnly,
              scope: draft.scope,
              excludedMatchKeys:
                draft.excludedMatchKeys.length > 0 ? draft.excludedMatchKeys : undefined,
              updatedAt: now,
            };
            nextRules = replaceRules.map((r) => (r.id === savedRule.id ? savedRule : r));
          } else {
            const maxPriority = replaceRules.reduce((m, r) => Math.max(m, r.priority), 0);
            savedRule = {
              id: `tr_${now}_${Math.random().toString(36).slice(2, 7)}`,
              pattern: draft.pattern,
              replacement: draft.replacement,
              caseSensitive: draft.caseSensitive,
              wholeWord: draft.wholeWord,
              preserveCase: draft.preserveCase,
              isRegex: draft.isRegex,
              ttsOnly: draft.ttsOnly,
              scope: draft.scope,
              bookId: bookMeta.id,
              bookSha1: bookMeta.sha1,
              seriesKey,
              targetChapterIndex: chapterIndex,
              targetParagraphIndex: findReplaceState.paragraphIndex,
              targetCharOffset: findReplaceState.charOffset,
              excludedMatchKeys:
                draft.excludedMatchKeys.length > 0 ? draft.excludedMatchKeys : undefined,
              priority: maxPriority + 1,
              enabled: true,
              createdAt: now,
              updatedAt: now,
            };
            nextRules = [...replaceRules, savedRule];
          }

          await saveTextReplaceRule(savedRule);
          setFindReplaceState((s) => ({ ...s, open: false, editingRule: null }));
          const visualChanged = !savedRule.ttsOnly || Boolean(previousRule && !previousRule.ttsOnly);
          await applyUpdatedRulesToReader(nextRules, visualChanged);

          if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
          const countLabel = savedRule.ttsOnly
            ? `Aturan TTS disimpan (${draft.expectedMatchCount} kecocokan)`
            : `${draft.expectedMatchCount} diganti`;
          setUndoSnackbar({
            message: countLabel,
            addedRuleId: draft.editingRuleId ? undefined : savedRule.id,
            previousRule,
          });
          undoTimerRef.current = window.setTimeout(() => setUndoSnackbar(null), 6500);
        }}
        onClose={() => setFindReplaceState((s) => ({ ...s, open: false, editingRule: null }))}
      />

      {/* Manage Replace Rules Modal (Tahap 8) */}
      <ReplaceRulesModal
        open={rulesModalOpen}
        initialFilter={rulesModalFilter}
        rules={replaceRules}
        bookCtx={bookCtx}
        bookTitle={bookMeta.title}
        chaptersData={rawChaptersCache}
        onToggleRule={async (id) => {
          const target = replaceRules.find((r) => r.id === id);
          if (!target) return;
          const updated = { ...target, enabled: !target.enabled, updatedAt: Date.now() };
          await saveTextReplaceRule(updated);
          const next = replaceRules.map((r) => (r.id === id ? updated : r));
          await applyUpdatedRulesToReader(next, !target.ttsOnly);
        }}
        onDeleteRule={async (id) => {
          const target = replaceRules.find((r) => r.id === id);
          await deleteTextReplaceRule(id);
          const next = replaceRules.filter((r) => r.id !== id);
          await applyUpdatedRulesToReader(next, !target?.ttsOnly);
        }}
        onMovePriority={async (id, direction) => {
          const sorted = [...replaceRules].sort(
            (a, b) => a.priority - b.priority || a.createdAt - b.createdAt
          );
          const idx = sorted.findIndex((r) => r.id === id);
          if (idx === -1) return;
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= sorted.length) return;
          const a = sorted[idx];
          const b = sorted[swapIdx];
          sorted[idx] = b;
          sorted[swapIdx] = a;
          const reindexed = sorted.map((r, i) => ({ ...r, priority: i + 1 }));
          await saveManyTextReplaceRules(reindexed);
          await applyUpdatedRulesToReader(reindexed, !a.ttsOnly || !b.ttsOnly);
        }}
        onEditRule={(rule) => {
          setRulesModalOpen(false);
          setFindReplaceState({
            open: true,
            mode: 'edit',
            initialPattern: rule.pattern,
            editingRule: rule,
            presetTtsOnly: rule.ttsOnly,
            paragraphIndex: rule.targetParagraphIndex,
            charOffset: rule.targetCharOffset ?? 0,
          });
        }}
        onAddNewRule={(presetTts) => {
          setRulesModalOpen(false);
          setFindReplaceState({
            open: true,
            mode: 'manual',
            initialPattern: '',
            editingRule: null,
            presetTtsOnly: Boolean(presetTts),
            paragraphIndex: allSentences[activeSentenceIdx]?.paragraphIndex,
            charOffset: activeCharOffset,
          });
        }}
        onExportJson={() => {
          const json = exportReplaceRulesJson(replaceRules);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `novelvoice_aturan_ganti_${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast('Aturan ganti teks diekspor ke JSON.');
        }}
        onImportJson={async (file) => {
          const raw = await file.text();
          const importedCount = await importReplaceRulesJson(raw);
          const reloaded = await listTextReplaceRules();
          await applyUpdatedRulesToReader(reloaded, true);
          showToast(`${importedCount} aturan berhasil diimpor.`);
        }}
        onExportEditedEpub={async () => {
          const origBuffer = await getBookFile(bookMeta.id);
          if (!origBuffer) {
            throw new Error('Berkas EPUB asli tidak ditemukan.');
          }
          const res = await exportEditedEpubBlob(
            origBuffer,
            replaceRules,
            bookCtx,
            findReplaceDefaults.applyToToc
          );
          const safeName =
            bookMeta.title.replace(/[^a-z0-9-_]+/gi, '_').replace(/^_+|_+$/g, '') || 'NovelVoice';
          const url = URL.createObjectURL(res.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${safeName}_diedit.epub`;
          a.click();
          URL.revokeObjectURL(url);
          return { appliedCount: res.appliedCount, skippedCount: res.skippedCount };
        }}
        onClose={() => setRulesModalOpen(false)}
      />

      {/* TTS Starting Position Choice Modal */}
      <TtsStartChoiceModal
        open={Boolean(ttsChoiceModal?.open)}
        startHereLabel={
          ttsChoiceModal
            ? `${currentChapterTitle} · Paragraf ${ttsChoiceModal.startHereParagraphIndex + 1}`
            : ''
        }
        startHerePreview={
          ttsChoiceModal
            ? (renderedParagraphs[ttsChoiceModal.startHereParagraphIndex]?.rawText || '')
                .replace(/\u00AD/g, '')
                .trim()
            : ''
        }
        lastTtsPosition={lastTtsPosition}
        onStartFromHere={handleConfirmStartHere}
        onResumePrevious={handleConfirmResumePrevious}
        onClose={() => setTtsChoiceModal(null)}
      />
    </div>
  );
};
