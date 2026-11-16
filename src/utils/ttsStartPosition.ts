import type {
  ParsedParagraph,
  SentenceSegment,
  TtsLastPosition,
} from '../types/reader';
import { mapRenderedOffsetToOriginalOffset } from './renderedTranslation';

export interface ParagraphViewportRect {
  paragraphIndex: number;
  top: number;
  bottom: number;
}

export interface ResolvedTtsTarget {
  sentenceIndex: number;
  paragraphIndex: number;
  wordIndex: number;
  chapterOffset: number;
}

/**
 * Finds the topmost paragraph visibly exposed inside the reading viewport
 * (below any sticky header bar). Ignores tiny sliver overlaps (< 20px) that
 * are mostly scrolled past above the top edge unless nothing else is visible.
 */
export function findTopmostVisibleParagraphIndex(
  rects: ParagraphViewportRect[],
  visibleTopEdge = 0,
  visibleBottomEdge = Number.POSITIVE_INFINITY
): number {
  if (rects.length === 0) return 0;

  const sorted = [...rects].sort(
    (a, b) => a.top - b.top || a.paragraphIndex - b.paragraphIndex
  );

  const intersecting = sorted.filter(
    (r) => r.bottom > visibleTopEdge + 2 && r.top < visibleBottomEdge - 2
  );

  if (intersecting.length === 0) {
    // If all paragraphs sit above viewport, take the last one; otherwise take the first below top
    const belowTop = sorted.find((r) => r.bottom > visibleTopEdge);
    return belowTop ? belowTop.paragraphIndex : sorted[sorted.length - 1].paragraphIndex;
  }

  for (const r of intersecting) {
    const height = Math.max(1, r.bottom - r.top);
    const visibleHeight = Math.min(r.bottom, visibleBottomEdge) - Math.max(r.top, visibleTopEdge);
    // Paragraph starts cleanly at/below header OR has meaningful body visible in viewport
    if (r.top >= visibleTopEdge - 10 || visibleHeight >= Math.min(24, height * 0.45)) {
      return r.paragraphIndex;
    }
  }

  return intersecting[0].paragraphIndex;
}

/**
 * Resolves the starting playback target for "Mulai dari sini" in the currently active
 * rendered chapter (supports both original EPUB text and inline translated text).
 */
export function resolveStartFromViewportTarget(
  paragraphIndex: number,
  renderedParagraphs: ParsedParagraph[],
  renderedSentences: SentenceSegment[]
): ResolvedTtsTarget {
  if (renderedParagraphs.length === 0 || renderedSentences.length === 0) {
    return { sentenceIndex: 0, paragraphIndex: 0, wordIndex: 0, chapterOffset: 0 };
  }

  const clampedParaIdx = Math.max(0, Math.min(paragraphIndex, renderedParagraphs.length - 1));
  const para = renderedParagraphs[clampedParaIdx];
  const firstSentence =
    para?.sentences[0] ??
    renderedSentences.find((s) => s.paragraphIndex === clampedParaIdx) ??
    renderedSentences[0];

  return {
    sentenceIndex: firstSentence.globalIndex,
    paragraphIndex: firstSentence.paragraphIndex,
    wordIndex: 0,
    chapterOffset: firstSentence.chapterStartChar,
  };
}

/**
 * Builds an immutable-coordinate-aware snapshot of the exact TTS playback position
 * when TTS speaks, pauses, stops, or leaves the reader.
 */
export function buildTtsLastPositionSnapshot(params: {
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  activeSentenceIndex: number;
  activeWordIndex: number;
  renderedParagraphs: ParsedParagraph[];
  renderedSentences: SentenceSegment[];
  originalParagraphs: ParsedParagraph[];
  updatedAt?: number;
}): TtsLastPosition | null {
  const {
    bookId,
    chapterIndex,
    chapterTitle,
    activeSentenceIndex,
    activeWordIndex,
    renderedParagraphs,
    renderedSentences,
    originalParagraphs,
    updatedAt = Date.now(),
  } = params;

  if (!bookId || renderedSentences.length === 0) return null;

  const clampedSentIdx = Math.max(0, Math.min(activeSentenceIndex, renderedSentences.length - 1));
  const activeSent = renderedSentences[clampedSentIdx];
  const paraIdx = activeSent.paragraphIndex;
  const para = renderedParagraphs[paraIdx];
  const paraSentences = para?.sentences ?? [];
  const sentenceInParagraph = Math.max(
    0,
    paraSentences.findIndex((s) => s.globalIndex === activeSent.globalIndex)
  );
  const paragraphSentenceCount = Math.max(1, paraSentences.length);

  const originalCharOffset = mapRenderedOffsetToOriginalOffset(
    renderedSentences,
    clampedSentIdx,
    originalParagraphs
  );

  const rawSnippet = activeSent.text.replace(/\u00AD/g, '').trim();
  const snippet =
    rawSnippet.length > 72 ? `${rawSnippet.slice(0, 69).trimEnd()}…` : rawSnippet;

  return {
    bookId,
    chapterIndex,
    chapterTitle,
    paragraphIndex: paraIdx,
    sentenceInParagraph,
    paragraphSentenceCount,
    originalCharOffset,
    sentenceIndex: clampedSentIdx,
    wordIndex: Math.max(0, activeWordIndex),
    snippet,
    updatedAt,
  };
}

/**
 * Resolves a saved TtsLastPosition against the currently rendered sentences of its chapter
 * without ever consulting viewport scroll position. Handles transitions between original
 * and translated text seamlessly via invariant paragraphIndex + relative sentence ratio.
 */
export function resolveTtsResumeTarget(
  saved: TtsLastPosition,
  renderedParagraphs: ParsedParagraph[],
  renderedSentences: SentenceSegment[]
): ResolvedTtsTarget {
  if (renderedParagraphs.length === 0 || renderedSentences.length === 0) {
    return { sentenceIndex: 0, paragraphIndex: 0, wordIndex: 0, chapterOffset: 0 };
  }

  const clampedParaIdx = Math.max(0, Math.min(saved.paragraphIndex, renderedParagraphs.length - 1));
  const targetPara = renderedParagraphs[clampedParaIdx];

  if (targetPara && targetPara.sentences.length > 0) {
    const newCount = targetPara.sentences.length;
    const oldCount = Math.max(1, saved.paragraphSentenceCount);
    const localIdx =
      newCount === oldCount
        ? Math.min(saved.sentenceInParagraph, newCount - 1)
        : Math.min(
            newCount - 1,
            Math.max(0, Math.round((saved.sentenceInParagraph / oldCount) * newCount))
          );

    const chosen = targetPara.sentences[localIdx];
    const wordIdx =
      chosen.words.length > 0 ? Math.min(saved.wordIndex, chosen.words.length - 1) : 0;

    return {
      sentenceIndex: chosen.globalIndex,
      paragraphIndex: clampedParaIdx,
      wordIndex: wordIdx,
      chapterOffset: chosen.chapterStartChar,
    };
  }

  const fallbackIdx = Math.max(0, Math.min(saved.sentenceIndex, renderedSentences.length - 1));
  const fallback = renderedSentences[fallbackIdx];
  return {
    sentenceIndex: fallback.globalIndex,
    paragraphIndex: fallback.paragraphIndex,
    wordIndex: 0,
    chapterOffset: fallback.chapterStartChar,
  };
}
