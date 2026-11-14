import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Languages,
  List,
  Type,
} from 'lucide-react';
import { loadChapterSegments, openEpubForReading, type OpenedEpubBook } from '../services/epubService';
import {
  getBookFile,
  getReadingPosition,
  saveReadingPosition,
  updateBookMetadata,
} from '../services/storageService';
import { translateText } from '../services/translationService';
import {
  checkAndroidNotificationPermission,
  getSystemVoices,
  openNativeTtsSettings,
  requestAndroidNotificationPermission,
  TtsPlaybackController,
  type NotificationPermissionStatus,
} from '../services/ttsBridge';
import type {
  BookMetadata,
  ChapterMeta,
  ParsedParagraph,
  ReaderSettings,
  SentenceSegment,
  TargetLanguageCode,
  TocItem,
  TranslationResult,
  TtsSettings,
  TtsVoiceInfo,
} from '../types/reader';
import { AppearanceSheet } from './AppearanceSheet';
import { ReaderControlsBar } from './ReaderControlsBar';
import { TocDrawer } from './TocDrawer';
import { TranslationPopup } from './TranslationPopup';
import { TtsSettingsSheet } from './TtsSettingsSheet';

interface ReaderViewProps {
  bookMeta: BookMetadata;
  readerSettings: ReaderSettings;
  ttsSettings: TtsSettings;
  onUpdateReaderSettings: (patch: Partial<ReaderSettings>) => void;
  onUpdateTtsSettings: (patch: Partial<TtsSettings>) => void;
  onBookProgressUpdated: (updated: BookMetadata) => void;
  onBackToLibrary: () => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  bookMeta,
  readerSettings,
  ttsSettings,
  onUpdateReaderSettings,
  onUpdateTtsSettings,
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
  const [activeWordIdx, setActiveWordIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingBook, setIsLoadingBook] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Paginated view state
  const [pageIndex, setPageIndex] = useState(0);
  const PARAGRAPHS_PER_PAGE = 4;

  // Drawers & Popups
  const [tocOpen, setTocOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [ttsSheetOpen, setTtsSheetOpen] = useState(false);

  // Voices & Permissions
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermissionStatus>({
    granted: true,
    sdkInt: 0,
    isNative: false,
  });
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  // Translation state
  const [popupSourceText, setPopupSourceText] = useState('');
  const [popupSentenceIdx, setPopupSentenceIdx] = useState<number | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupResult, setPopupResult] = useState<TranslationResult | null>(null);
  const [inlineTranslations, setInlineTranslations] = useState<Record<string, TranslationResult>>({});

  // Quick sentence action bar when user taps a sentence (Read from here OR Translate)
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState<number | null>(null);

  const sentenceRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const controllerRef = useRef<TtsPlaybackController | null>(null);
  const chapterIndexRef = useRef(chapterIndex);
  const chaptersRef = useRef(chapters);
  const activeSentenceRef = useRef(activeSentenceIdx);
  const activeWordRef = useRef(activeWordIdx);

  chapterIndexRef.current = chapterIndex;
  chaptersRef.current = chapters;
  activeSentenceRef.current = activeSentenceIdx;
  activeWordRef.current = activeWordIdx;

  // Persist reading position helper
  const persistPosition = useCallback(
    async (cIdx: number, sIdx: number, wIdx: number, totalChaps: number) => {
      await saveReadingPosition({
        bookId: bookMeta.id,
        chapterIndex: cIdx,
        sentenceIndex: sIdx,
        wordIndex: wIdx,
        scrollRatio: 0,
        updatedAt: Date.now(),
      });

      const pct =
        totalChaps <= 1
          ? allSentences.length > 0
            ? Math.round(((sIdx + 1) / allSentences.length) * 100)
            : 0
          : Math.min(100, Math.round(((cIdx + (sIdx + 1) / Math.max(1, allSentences.length)) / totalChaps) * 100));

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

  // Initialize TTS controller once
  useEffect(() => {
    const controller = new TtsPlaybackController(ttsSettings, {
      onHighlight: (sIdx, wIdx) => {
        setActiveSentenceIdx(sIdx);
        setActiveWordIdx(wIdx);
      },
      onPlaybackStateChange: (playing) => {
        setIsPlaying(playing);
        if (!playing) {
          const pos = controller.getPosition();
          void persistPosition(
            chapterIndexRef.current,
            pos.sentenceIndex,
            pos.wordIndex,
            chaptersRef.current.length || bookMeta.totalChapters
          );
        }
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

    void getSystemVoices().then(setVoices);
    void checkAndroidNotificationPermission().then(setNotificationStatus);

    return () => {
      const pos = controller.getPosition();
      void saveReadingPosition({
        bookId: bookMeta.id,
        chapterIndex: chapterIndexRef.current,
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

  // Keep controller settings synced
  useEffect(() => {
    controllerRef.current?.updateSettings(ttsSettings);
  }, [ttsSettings]);

  // Open EPUB binary from IndexedDB and restore exact chapter + sentence + word
  useEffect(() => {
    let cancelled = false;
    let instanceToDestroy: OpenedEpubBook | null = null;

    async function init() {
      setIsLoadingBook(true);
      setLoadError(null);
      try {
        const buffer = await getBookFile(bookMeta.id);
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

        const savedPos = await getReadingPosition(bookMeta.id);
        const startChap = savedPos
          ? Math.min(savedPos.chapterIndex, Math.max(0, opened.chapters.length - 1))
          : Math.min(bookMeta.currentChapterIndex || 0, Math.max(0, opened.chapters.length - 1));

        const segs = await loadChapterSegments(opened.book, startChap);
        if (cancelled) return;

        const startSentence = savedPos
          ? Math.min(savedPos.sentenceIndex, Math.max(0, segs.allSentences.length - 1))
          : 0;
        const startWord = savedPos ? savedPos.wordIndex : 0;

        setChapterIndex(startChap);
        setParagraphs(segs.paragraphs);
        setAllSentences(segs.allSentences);
        setActiveSentenceIdx(startSentence);
        setActiveWordIdx(startWord);

        const chapTitle = opened.chapters[startChap]?.title || segs.chapterTitle || `Bab ${startChap + 1}`;
        controllerRef.current?.setBookContext(
          bookMeta.title,
          chapTitle,
          segs.allSentences,
          startSentence,
          startWord
        );
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
  }, [bookMeta.id, bookMeta.title, bookMeta.currentChapterIndex]);

  const handleSelectChapter = useCallback(
    async (targetIndex: number, autoPlayAfterLoad = false) => {
      if (!openedEpub) return;
      const clamped = Math.max(0, Math.min(targetIndex, openedEpub.chapters.length - 1));
      controllerRef.current?.pause();

      const segs = await loadChapterSegments(openedEpub.book, clamped);
      setChapterIndex(clamped);
      setParagraphs(segs.paragraphs);
      setAllSentences(segs.allSentences);
      setActiveSentenceIdx(0);
      setActiveWordIdx(0);
      setPageIndex(0);
      setInlineTranslations({});
      setSelectedSentenceIdx(null);

      const chapTitle =
        openedEpub.chapters[clamped]?.title || segs.chapterTitle || `Bab ${clamped + 1}`;
      controllerRef.current?.setBookContext(bookMeta.title, chapTitle, segs.allSentences, 0, 0);

      await persistPosition(clamped, 0, 0, openedEpub.chapters.length);

      if (autoPlayAfterLoad && segs.allSentences.length > 0) {
        void controllerRef.current?.playFrom(0, 0);
      }
    },
    [bookMeta.title, openedEpub, persistPosition]
  );

  // Auto-scroll to highlighted sentence during TTS playback & switch page if paginated
  useEffect(() => {
    const el = sentenceRefs.current.get(activeSentenceIdx);
    if (isPlaying && el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (readerSettings.readingMode === 'paginated' && paragraphs.length > 0) {
      const targetParaIdx = allSentences[activeSentenceIdx]?.paragraphIndex ?? 0;
      const targetPage = Math.floor(targetParaIdx / PARAGRAPHS_PER_PAGE);
      if (targetPage !== pageIndex) {
        setPageIndex(targetPage);
      }
    }
  }, [activeSentenceIdx, allSentences, isPlaying, pageIndex, paragraphs.length, readerSettings.readingMode]);

  // Inline paragraph translation fetcher when mode enabled
  useEffect(() => {
    if (!readerSettings.paragraphTranslateEnabled || paragraphs.length === 0) {
      return;
    }

    let cancelled = false;
    async function runBatch() {
      for (const para of paragraphs) {
        if (cancelled) return;
        const cacheKey = `${para.id}:${readerSettings.targetLanguage}`;
        if (inlineTranslations[cacheKey]) continue;
        const res = await translateText(para.rawText, readerSettings.targetLanguage, bookMeta.language);
        if (cancelled) return;
        setInlineTranslations((prev) => ({
          ...prev,
          [cacheKey]: res,
        }));
      }
    }

    void runBatch();
    return () => {
      cancelled = true;
    };
  }, [
    bookMeta.language,
    inlineTranslations,
    paragraphs,
    readerSettings.paragraphTranslateEnabled,
    readerSettings.targetLanguage,
  ]);

  // Trigger translation popup for any word/sentence
  const triggerTranslationPopup = useCallback(
    async (text: string, sentenceIdx: number | null, langOverride?: TargetLanguageCode) => {
      const targetLang = langOverride ?? readerSettings.targetLanguage;
      setPopupSourceText(text);
      setPopupSentenceIdx(sentenceIdx);
      setPopupLoading(true);
      const res = await translateText(text, targetLang, bookMeta.language);
      setPopupResult(res);
      setPopupLoading(false);
    },
    [bookMeta.language, readerSettings.targetLanguage]
  );

  // Listen to native text selection (drag select words/phrase)
  const handleReaderMouseUp = () => {
    const sel = window.getSelection()?.toString().trim() ?? '';
    if (sel.length >= 2 && sel.length <= 500) {
      void triggerTranslationPopup(sel, null);
    }
  };

  const handleSentenceTap = (sentence: SentenceSegment) => {
    setSelectedSentenceIdx((prev) => (prev === sentence.globalIndex ? null : sentence.globalIndex));
  };

  const handleReadFromSentence = (sentenceIdx: number) => {
    setSelectedSentenceIdx(null);
    void controllerRef.current?.playFrom(sentenceIdx, 0);
  };

  const handleTogglePlay = () => {
    if (!controllerRef.current) return;
    if (isPlaying) {
      controllerRef.current.pause();
    } else {
      // Request Android 13+ notification permission lazily if needed on native
      if (notificationStatus.isNative && !notificationStatus.granted) {
        void requestAndroidNotificationPermission().then((granted) => {
          setNotificationStatus((prev) => ({ ...prev, granted }));
        });
      }
      controllerRef.current.resume();
    }
  };

  const totalPages = Math.max(1, Math.ceil(paragraphs.length / PARAGRAPHS_PER_PAGE));
  const visibleParagraphs = useMemo(() => {
    if (readerSettings.readingMode === 'scroll') return paragraphs;
    const start = pageIndex * PARAGRAPHS_PER_PAGE;
    return paragraphs.slice(start, start + PARAGRAPHS_PER_PAGE);
  }, [pageIndex, paragraphs, readerSettings.readingMode]);

  const fontClass =
    readerSettings.font === 'literata'
      ? 'font-reader-literata'
      : readerSettings.font === 'jakarta'
        ? 'font-reader-jakarta'
        : 'font-reader-mono';

  const currentChapterTitle =
    chapters[chapterIndex]?.title || `Bab ${chapterIndex + 1}`;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--nv-bg)] text-[var(--nv-text)] transition-colors duration-150">
      {/* Compact Sticky Top Reader Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--nv-border)] bg-[var(--nv-bg)]/95 backdrop-blur-md pt-safe">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                controllerRef.current?.pause();
                void persistPosition(
                  chapterIndexRef.current,
                  activeSentenceRef.current,
                  activeWordRef.current,
                  chapters.length || bookMeta.totalChapters
                );
                onBackToLibrary();
              }}
              aria-label="Kembali ke Rak Buku"
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{bookMeta.title}</p>
              <p className="truncate text-xs text-[var(--nv-muted)]">{currentChapterTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setTocOpen(true)}
              aria-label="Buka Daftar Isi"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            >
              <List className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateReaderSettings({
                  paragraphTranslateEnabled: !readerSettings.paragraphTranslateEnabled,
                })
              }
              aria-label="Aktifkan atau matikan terjemahan paragraf"
              aria-pressed={readerSettings.paragraphTranslateEnabled}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors ${
                readerSettings.paragraphTranslateEnabled
                  ? 'bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                  : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Languages className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Terjemah</span>
            </button>

            <button
              type="button"
              onClick={() => setAppearanceOpen(true)}
              aria-label="Pengaturan Tampilan Huruf dan Tema"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Type className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Reading Canvas */}
      <main
        className="mx-auto w-full max-w-[68ch] flex-1 px-5 py-7 sm:px-8 sm:py-10"
        onMouseUp={handleReaderMouseUp}
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
          <article
            className={`${fontClass} transition-all`}
            style={{
              fontSize: `${readerSettings.fontSize}px`,
              lineHeight: readerSettings.lineHeight,
            }}
          >
            {visibleParagraphs.map((para) => {
              const inlineKey = `${para.id}:${readerSettings.targetLanguage}`;
              const inlineRes = inlineTranslations[inlineKey];

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
                  ? 'mb-6 text-2xl font-bold leading-tight tracking-tight sm:text-3xl'
                  : para.tag === 'h2'
                    ? 'mb-5 mt-8 text-xl font-bold leading-snug'
                    : para.tag === 'h3'
                      ? 'mb-4 mt-6 text-lg font-semibold'
                      : para.tag === 'blockquote'
                        ? 'my-5 px-4 py-2 italic text-[var(--nv-muted)]'
                        : 'mb-5';

              return (
                <div key={para.id} className="mb-2">
                  <Tag className={tagStyle}>
                    {para.sentences.map((sentence) => {
                      const isCurrentSentence = sentence.globalIndex === activeSentenceIdx;
                      const isSelected = sentence.globalIndex === selectedSentenceIdx;

                      return (
                        <React.Fragment key={sentence.globalIndex}>
                          <span
                            ref={(node) => {
                              if (node) sentenceRefs.current.set(sentence.globalIndex, node);
                              else sentenceRefs.current.delete(sentence.globalIndex);
                            }}
                            onClick={() => handleSentenceTap(sentence)}
                            data-sentence-index={sentence.globalIndex}
                            className={`cursor-pointer transition-colors duration-150 ${
                              isCurrentSentence
                                ? 'tts-sentence-active'
                                : isSelected
                                  ? 'bg-[var(--nv-accent-soft)] rounded-xs'
                                  : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                            }`}
                          >
                            {sentence.words.map((word, wIdx) => {
                              const isCurrentWord =
                                isCurrentSentence && isPlaying && word.wordIndex === activeWordIdx;
                              return (
                                <React.Fragment key={word.wordIndex}>
                                  <span
                                    className={isCurrentWord ? 'tts-word-active font-medium' : undefined}
                                  >
                                    {word.text}
                                  </span>
                                  {wIdx < sentence.words.length - 1 ? ' ' : ''}
                                </React.Fragment>
                              );
                            })}
                          </span>{' '}
                        </React.Fragment>
                      );
                    })}
                  </Tag>

                  {/* Contextual Sentence Action Row (Tap any sentence -> Read from here or Translate) */}
                  {para.sentences.some((s) => s.globalIndex === selectedSentenceIdx) &&
                    selectedSentenceIdx !== null && (
                      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 py-2 text-xs font-sans shadow-sm">
                        <button
                          type="button"
                          onClick={() => handleReadFromSentence(selectedSentenceIdx)}
                          className="min-h-[36px] rounded-lg bg-[var(--nv-accent)] px-3 font-semibold text-white hover:opacity-90"
                        >
                          Baca dari kalimat ini
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const s = allSentences[selectedSentenceIdx];
                            if (s) {
                              void triggerTranslationPopup(s.text, s.globalIndex);
                            }
                            setSelectedSentenceIdx(null);
                          }}
                          className="min-h-[36px] rounded-lg border border-[var(--nv-border)] px-3 font-semibold hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          Terjemahkan kalimat
                        </button>
                      </div>
                    )}

                  {/* Inline Paragraph Translation Mode */}
                  {readerSettings.paragraphTranslateEnabled && (
                    <div className="mb-6 border-t border-[var(--nv-border)] pt-2 font-sans text-sm italic leading-relaxed text-[var(--nv-muted)]">
                      {!inlineRes ? (
                        <span>Menerjemahkan paragraf...</span>
                      ) : inlineRes.ok ? (
                        <span>{inlineRes.translatedText}</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">{inlineRes.error}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </article>
        )}

        {/* Paginated Controls or Chapter Navigation Footer */}
        {!isLoadingBook && !loadError && (
          <div className="mt-10 flex items-center justify-between gap-3 border-t border-[var(--nv-border)] pt-6">
            {readerSettings.readingMode === 'paginated' && totalPages > 1 ? (
              <>
                <button
                  type="button"
                  disabled={pageIndex === 0 && chapterIndex === 0}
                  onClick={() => {
                    if (pageIndex > 0) setPageIndex((p) => p - 1);
                    else if (chapterIndex > 0) void handleSelectChapter(chapterIndex - 1);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-4 text-sm font-medium disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Sebelumnya</span>
                </button>

                <span className="text-xs font-medium text-[var(--nv-muted)] tabular-nums">
                  Halaman {pageIndex + 1} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={pageIndex >= totalPages - 1 && chapterIndex >= chapters.length - 1}
                  onClick={() => {
                    if (pageIndex < totalPages - 1) setPageIndex((p) => p + 1);
                    else if (chapterIndex < chapters.length - 1)
                      void handleSelectChapter(chapterIndex + 1);
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-4 text-sm font-medium disabled:opacity-40"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={chapterIndex <= 0}
                  onClick={() => void handleSelectChapter(chapterIndex - 1)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-4 text-sm font-medium disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Bab Sebelumnya</span>
                </button>

                <span className="text-xs font-medium text-[var(--nv-muted)] tabular-nums">
                  Bab {chapterIndex + 1} / {Math.max(1, chapters.length)}
                </span>

                <button
                  type="button"
                  disabled={chapterIndex >= chapters.length - 1}
                  onClick={() => void handleSelectChapter(chapterIndex + 1)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-4 text-sm font-medium disabled:opacity-40"
                >
                  <span>Bab Berikutnya</span>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </main>

      {/* Bottom Thumb-Zone TTS Controls Bar */}
      <ReaderControlsBar
        isPlaying={isPlaying}
        currentSentenceIndex={activeSentenceIdx}
        totalSentences={allSentences.length}
        sleepRemainingSec={sleepRemainingSec}
        sleepTimerMode={ttsSettings.sleepTimerMinutes}
        commaPauseMs={ttsSettings.commaPauseMs}
        rate={ttsSettings.rate}
        onTogglePlay={handleTogglePlay}
        onPrevSentence={() => controllerRef.current?.prevSentence()}
        onNextSentence={() => controllerRef.current?.nextSentence()}
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
        onClose={() => {
          setPopupSourceText('');
          setPopupResult(null);
          setPopupSentenceIdx(null);
        }}
      />

      {/* Drawers & Bottom Sheets */}
      <TocDrawer
        open={tocOpen}
        bookTitle={bookMeta.title}
        toc={toc}
        currentChapterIndex={chapterIndex}
        onSelectChapter={(idx) => void handleSelectChapter(idx)}
        onClose={() => setTocOpen(false)}
      />

      <AppearanceSheet
        open={appearanceOpen}
        settings={readerSettings}
        onUpdate={onUpdateReaderSettings}
        onClose={() => setAppearanceOpen(false)}
      />

      <TtsSettingsSheet
        open={ttsSheetOpen}
        settings={ttsSettings}
        voices={voices}
        notificationStatus={notificationStatus}
        sleepRemainingSec={sleepRemainingSec}
        onUpdate={onUpdateTtsSettings}
        onPreviewVoice={(voiceURI) => {
          const sample =
            bookMeta.language.startsWith('en')
              ? 'This is a preview of the selected reading voice, with natural pauses.'
              : 'Ini adalah contoh suara pembacaan NovelVoice, dengan jeda koma yang terasa natural.';
          void controllerRef.current?.previewVoice(voiceURI, sample);
        }}
        onOpenAndroidTtsSettings={openNativeTtsSettings}
        onRequestNotificationPermission={async () => {
          const granted = await requestAndroidNotificationPermission();
          setNotificationStatus((prev) => ({ ...prev, granted }));
        }}
        onClose={() => setTtsSheetOpen(false)}
      />
    </div>
  );
};
