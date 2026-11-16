import type {
  InlineFormatSpan,
  ParsedParagraph,
  SentenceSegment,
  TargetLanguageCode,
  TranslationProvider,
  WordToken,
} from '../types/reader';
import {
  detectLikelySourceLanguage,
  normalizeBookLocale,
  splitIntoSentencesWithOffsets,
  tokenizeWords,
} from './textSegmentation';

export interface RenderedChapterModel {
  paragraphs: ParsedParagraph[];
  allSentences: SentenceSegment[];
  translatedParagraphFlags: boolean[];
  renderedLocale: string;
}

const TARGET_LOCALE_TAG_MAP: Record<TargetLanguageCode, string> = {
  id: 'id-ID',
  en: 'en-US',
  ms: 'ms-MY',
  jv: 'jv-ID',
  ar: 'ar-SA',
  ja: 'ja-JP',
  'zh-CN': 'zh-CN',
};

export function targetLangToLocaleTag(targetLang: TargetLanguageCode): string {
  return TARGET_LOCALE_TAG_MAP[targetLang] || normalizeBookLocale(targetLang);
}

/**
 * Deterministic key scoping paragraph translation lookup to chapter, paragraph ID,
 * text length, target language, provider, and Gemini model (when used).
 * Prevents cross-chapter or cross-language mixing during rapid transitions.
 */
export function buildParagraphTranslationSlotKey(
  chapterIndex: number,
  paragraphId: string,
  sourceText: string,
  targetLang: TargetLanguageCode,
  provider: TranslationProvider,
  geminiModel?: string
): string {
  const modelScope = provider === 'gemini' ? (geminiModel || '').trim() : '';
  return `ch${chapterIndex}:${paragraphId}:len${sourceText.length}:${targetLang}:${provider}:${modelScope}`;
}

/**
 * Preserves uniform full-paragraph formatting (e.g. an entirely italicized paragraph
 * or entirely bold heading) onto translated text without misaligning partial spans.
 */
function remapUniformFormatsForTranslation(
  originalFormats: InlineFormatSpan[] | undefined,
  originalLength: number,
  translatedLength: number
): InlineFormatSpan[] | undefined {
  if (!originalFormats || originalFormats.length === 0 || originalLength <= 0 || translatedLength <= 0) {
    return undefined;
  }
  const allItalic = originalFormats.some(
    (s) => s.italic && s.start <= 1 && s.end >= Math.max(1, originalLength - 1)
  );
  const allBold = originalFormats.some(
    (s) => s.bold && s.start <= 1 && s.end >= Math.max(1, originalLength - 1)
  );
  if (!allItalic && !allBold) return undefined;
  return [
    {
      start: 0,
      end: translatedLength,
      ...(allItalic ? { italic: true } : {}),
      ...(allBold ? { bold: true } : {}),
    },
  ];
}

function mapTargetLangToDetectedLang(targetLang: TargetLanguageCode): 'id' | 'en' | undefined {
  if (targetLang === 'id' || targetLang === 'ms' || targetLang === 'jv') return 'id';
  if (targetLang === 'en') return 'en';
  return undefined;
}

/**
 * Builds the active display & TTS chapter model from the immutable original
 * `originalParagraphs` source layer without mutating original data.
 *
 * - OFF: returns original paragraphs & sentences unchanged.
 * - ON: replaces each paragraph's rendered text in place with its translation
 *   wherever a translation exists, falling back cleanly to original text when
 *   translation is pending or unavailable.
 */
export function buildRenderedChapterModel(
  originalParagraphs: ParsedParagraph[],
  originalAllSentences: SentenceSegment[],
  options: {
    translateEnabled: boolean;
    targetLanguage: TargetLanguageCode;
    bookLocale: string;
    getTranslatedText: (para: ParsedParagraph) => string | null;
  }
): RenderedChapterModel {
  const safeBookLocale = normalizeBookLocale(options.bookLocale);

  if (!options.translateEnabled) {
    return {
      paragraphs: originalParagraphs,
      allSentences: originalAllSentences,
      translatedParagraphFlags: originalParagraphs.map(() => false),
      renderedLocale: safeBookLocale,
    };
  }

  const targetLocaleTag = targetLangToLocaleTag(options.targetLanguage);
  const targetSegmentLocale = normalizeBookLocale(options.targetLanguage);
  const paragraphs: ParsedParagraph[] = [];
  const allSentences: SentenceSegment[] = [];
  const translatedParagraphFlags: boolean[] = [];
  let cursor = 0;

  for (let i = 0; i < originalParagraphs.length; i++) {
    const orig = originalParagraphs[i];
    const translatedRaw = options.getTranslatedText(orig);
    const cleanedTranslation = translatedRaw ? translatedRaw.replace(/\s+/g, ' ').trim() : '';
    const isTranslated = cleanedTranslation.length > 0;
    const activeText = isTranslated ? cleanedTranslation : orig.rawText;
    const segmentLocale = isTranslated ? targetSegmentLocale : safeBookLocale;
    const langTag = isTranslated ? targetLocaleTag : safeBookLocale;
    const detectedLang: 'id' | 'en' = isTranslated
      ? mapTargetLangToDetectedLang(options.targetLanguage) ?? 'en'
      : detectLikelySourceLanguage(activeText, safeBookLocale) === 'id'
        ? 'id'
        : 'en';

    const pIndex = orig.index;
    const pStart = cursor;
    const pEnd = pStart + activeText.length;

    const spans = splitIntoSentencesWithOffsets(activeText, segmentLocale);
    const sentenceSegments: SentenceSegment[] = spans.map((span) => {
      const globalIndex = allSentences.length;
      const chapStart = pStart + span.startOffset;
      const chapEnd = pStart + span.endOffset;
      const words: WordToken[] = tokenizeWords(span.text, globalIndex, pIndex, chapStart);

      const seg: SentenceSegment = {
        globalIndex,
        paragraphIndex: pIndex,
        text: span.text,
        chapterStartChar: chapStart,
        chapterEndChar: chapEnd,
        words,
        isFootnote: orig.isFootnote,
        detectedLang,
        langTag,
      };
      allSentences.push(seg);
      return seg;
    });

    const inlineFormats = isTranslated
      ? remapUniformFormatsForTranslation(orig.inlineFormats, orig.rawText.length, activeText.length)
      : orig.inlineFormats;

    paragraphs.push({
      id: orig.id,
      index: pIndex,
      tag: orig.tag,
      rawText: activeText,
      chapterStartChar: pStart,
      chapterEndChar: pEnd,
      sentences: sentenceSegments,
      isFootnote: orig.isFootnote,
      isHeaderLike: orig.isHeaderLike,
      inlineFormats,
    });
    translatedParagraphFlags.push(isTranslated);
    cursor = pEnd + 2; // "\n\n" separator
  }

  const anyTranslated = translatedParagraphFlags.some(Boolean);
  return {
    paragraphs,
    allSentences,
    translatedParagraphFlags,
    renderedLocale: anyTranslated ? targetSegmentLocale : safeBookLocale,
  };
}

/**
 * Anchors a reading/TTS cursor across render transitions (e.g. toggling translation
 * ON/OFF or switching target language) using the invariant `paragraphIndex` and
 * proportional sentence progress inside that paragraph.
 */
export function mapSentenceCursorAcrossRender(
  oldSentences: SentenceSegment[],
  oldActiveSentenceIdx: number,
  newParagraphs: ParsedParagraph[],
  newAllSentences: SentenceSegment[]
): { sentenceIndex: number; wordIndex: number; paragraphIndex: number; chapterOffset: number } {
  if (newAllSentences.length === 0 || newParagraphs.length === 0) {
    return { sentenceIndex: 0, wordIndex: 0, paragraphIndex: 0, chapterOffset: 0 };
  }

  const currentSent =
    oldSentences[Math.max(0, Math.min(oldActiveSentenceIdx, Math.max(0, oldSentences.length - 1)))];
  const targetParaIdx = Math.max(
    0,
    Math.min(currentSent?.paragraphIndex ?? 0, newParagraphs.length - 1)
  );
  const targetPara = newParagraphs[targetParaIdx];

  if (!targetPara || targetPara.sentences.length === 0) {
    return {
      sentenceIndex: 0,
      wordIndex: 0,
      paragraphIndex: targetParaIdx,
      chapterOffset: targetPara?.chapterStartChar ?? 0,
    };
  }

  const oldParaSents = oldSentences.filter((s) => s.paragraphIndex === targetParaIdx);
  const oldPosInPara = Math.max(
    0,
    oldParaSents.findIndex((s) => s.globalIndex === currentSent?.globalIndex)
  );
  const ratio =
    oldParaSents.length > 1 ? oldPosInPara / (oldParaSents.length - 1) : 0;
  const newPosInPara =
    targetPara.sentences.length > 1
      ? Math.round(ratio * (targetPara.sentences.length - 1))
      : 0;
  const matched =
    targetPara.sentences[
      Math.max(0, Math.min(newPosInPara, targetPara.sentences.length - 1))
    ];

  return {
    sentenceIndex: matched.globalIndex,
    wordIndex: matched.words[0]?.wordIndex ?? 0,
    paragraphIndex: targetParaIdx,
    chapterOffset: matched.chapterStartChar,
  };
}

/**
 * Maps a rendered chapter character offset back to the original EPUB chapter's
 * character coordinate so virtual pages and persisted reading positions stay stable
 * regardless of translated text length.
 */
export function mapRenderedOffsetToOriginalOffset(
  renderedSentences: SentenceSegment[],
  renderedActiveSentenceIdx: number,
  originalParagraphs: ParsedParagraph[]
): number {
  if (originalParagraphs.length === 0) return 0;
  const sent =
    renderedSentences[
      Math.max(0, Math.min(renderedActiveSentenceIdx, Math.max(0, renderedSentences.length - 1)))
    ];
  const paraIdx = Math.max(
    0,
    Math.min(sent?.paragraphIndex ?? 0, originalParagraphs.length - 1)
  );
  return originalParagraphs[paraIdx]?.chapterStartChar ?? 0;
}
