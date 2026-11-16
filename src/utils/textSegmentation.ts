import type {
  InlineFormatSpan,
  ParsedParagraph,
  PronunciationRule,
  SentenceSegment,
  SpeechChunk,
  SpeechChunkSlice,
  TextReplaceRule,
  TtsReadingMode,
  WordToken,
} from '../types/reader';
import {
  buildTtsSpokenTransform,
  mapSpokenOffsetToOriginal,
  type BookReplaceContext,
} from './textReplace';

const ABBREVIATIONS = new Set([
  'tn.',
  'ny.',
  'sdr.',
  'sdri.',
  'dr.',
  'drg.',
  'mr.',
  'mrs.',
  'ms.',
  'prof.',
  'ir.',
  'no.',
  'hlm.',
  'hal.',
  'dkk.',
  'dll.',
  'dsb.',
  'dst.',
  'yth.',
  'a.n.',
  'u.p.',
  's.h.',
  's.kom.',
  's.pd.',
  'st.',
  'vs.',
  'e.g.',
  'i.e.',
  'etc.',
  'vol.',
  'bab.',
]);

export interface SentenceSpan {
  text: string;
  startOffset: number;
  endOffset: number;
}

function shouldMergeSentenceBoundary(fullText: string, boundaryEndIndex: number): boolean {
  const before = fullText.slice(0, boundaryEndIndex).trimEnd();
  const after = fullText.slice(boundaryEndIndex).trimStart();
  if (!before || !after) return false;

  // Never split inside ellipsis (... or …)
  if (before.endsWith('...') || before.endsWith('…')) {
    return /^[a-zà-ÿ0-9]/i.test(after) && !/^[A-ZÀ-Ÿ]/.test(after);
  }

  // Never split inside abbreviations like Tn., Dr., dll.
  const lastTokenMatch = before.match(/([A-Za-zÀ-ÿ.]+)$/);
  if (lastTokenMatch && ABBREVIATIONS.has(lastTokenMatch[1].toLowerCase())) {
    return true;
  }

  // Never split decimal numbers like 3.5 or 18.00
  if (/\d\.$/.test(before) && /^\d/.test(after)) {
    return true;
  }

  // Keep lowercase dialogue attribution attached to closing quotes: `"Sudah siap?" tanya Nara.`
  if (/[.!?]["”’'»)\]]+$/.test(before) && /^[a-zà-ÿ]/.test(after)) {
    return true;
  }

  // Keep periods inside open quotation marks attached if the next word starts lowercase
  const openQuotes = (before.match(/[“"«]/g) || []).length;
  const closeQuotes = (before.match(/[”"»]/g) || []).length;
  if (openQuotes > closeQuotes && /^[a-zà-ÿ]/.test(after)) {
    return true;
  }

  return false;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  'bahasa indonesia': 'id',
  indonesia: 'id',
  indonesian: 'id',
  indo: 'id',
  'bhs indonesia': 'id',
  'bhs. indonesia': 'id',
  ind: 'id',
  in: 'id',
  'bahasa melayu': 'ms',
  melayu: 'ms',
  malay: 'ms',
  msa: 'ms',
  zsm: 'ms',
  may: 'ms',
  english: 'en',
  inggris: 'en',
  eng: 'en',
  japanese: 'ja',
  jepang: 'ja',
  jpn: 'ja',
  chinese: 'zh',
  mandarin: 'zh',
  chi: 'zh',
  zho: 'zh',
  arabic: 'ar',
  arab: 'ar',
  ara: 'ar',
  javanese: 'jv',
  jawa: 'jv',
  jav: 'jv',
  sundanese: 'su',
  sunda: 'su',
  sun: 'su',
};

/**
 * Normalizes arbitrary EPUB <dc:language> metadata strings (such as
 * "bahasa Indonesia", "indonesian", "en_US", "in-ID", "und", etc.)
 * into a canonical BCP-47 locale tag accepted by Intl APIs.
 */
export function normalizeBookLocale(rawLang?: string): string {
  if (typeof rawLang !== 'string') return 'id';
  const primary = rawLang.split(/[;,|]/)[0]?.trim() ?? '';
  if (!primary) return 'id';

  const lower = primary.toLowerCase().replace(/\s+/g, ' ');
  if (LANGUAGE_ALIASES[lower]) {
    return LANGUAGE_ALIASES[lower];
  }

  let candidate = primary.replace(/_/g, '-').trim();
  const lowerHyphen = candidate.toLowerCase();
  if (lowerHyphen === 'und' || lowerHyphen === 'unknown') {
    return 'id';
  }
  if (lowerHyphen.startsWith('in-')) {
    candidate = `id-${candidate.slice(3)}`;
  }

  if (typeof Intl !== 'undefined' && typeof Intl.getCanonicalLocales === 'function') {
    try {
      const canonical = Intl.getCanonicalLocales(candidate);
      if (canonical.length > 0 && canonical[0].toLowerCase() !== 'und') {
        return canonical[0];
      }
    } catch {
      // Fallback via keyword match below
    }
  } else if (/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(candidate)) {
    return candidate;
  }

  if (lower.includes('indonesia') || lower.includes('indo')) return 'id';
  if (lower.includes('melayu') || lower.includes('malay')) return 'ms';
  if (lower.includes('inggris') || lower.includes('english')) return 'en';
  if (lower.includes('jepang') || lower.includes('japan')) return 'ja';
  if (lower.includes('arab')) return 'ar';
  if (lower.includes('mandarin') || lower.includes('china')) return 'zh';
  return 'id';
}

interface SentenceSegmenterLike {
  segment: (text: string) => Iterable<{ segment: string; index: number }>;
}

const sentenceSegmenterCache = new Map<string, SentenceSegmenterLike | null>();

function getSentenceSegmenter(locale?: string): SentenceSegmenterLike | null {
  if (typeof Intl === 'undefined' || !('Segmenter' in Intl)) {
    return null;
  }

  const safeLocale = normalizeBookLocale(locale);
  if (sentenceSegmenterCache.has(safeLocale)) {
    return sentenceSegmenterCache.get(safeLocale) ?? null;
  }

  const SegmenterCtor = (
    Intl as unknown as {
      Segmenter: new (
        loc: string,
        opts: { granularity: 'sentence' }
      ) => SentenceSegmenterLike;
    }
  ).Segmenter;

  let segmenter: SentenceSegmenterLike | null = null;
  try {
    segmenter = new SegmenterCtor(safeLocale, { granularity: 'sentence' });
  } catch {
    try {
      segmenter = new SegmenterCtor('id', { granularity: 'sentence' });
    } catch {
      segmenter = null;
    }
  }

  if (sentenceSegmenterCache.size >= 16) {
    sentenceSegmenterCache.clear();
  }
  sentenceSegmenterCache.set(safeLocale, segmenter);
  return segmenter;
}

/**
 * Splits prose into sentence spans with exact UTF-16 offsets using Intl.Segmenter
 * (granularity: "sentence", locale "id") enhanced with abbreviation, decimal,
 * ellipsis, and dialog-quote guards.
 */
export function splitIntoSentencesWithOffsets(input: string, locale = 'id'): SentenceSpan[] {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const rawSpans: SentenceSpan[] = [];
  const segmenter = getSentenceSegmenter(locale);

  if (segmenter) {
    for (const seg of segmenter.segment(normalized)) {
      const leading = seg.segment.length - seg.segment.trimStart().length;
      const trimmed = seg.segment.trim();
      if (!trimmed) continue;
      const startOffset = seg.index + leading;
      rawSpans.push({
        text: trimmed,
        startOffset,
        endOffset: startOffset + trimmed.length,
      });
    }
  } else {
    const regex = /[^.!?…]+(?:[.!?…]+["”’')\]»]*|$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(normalized)) !== null) {
      const leading = match[0].length - match[0].trimStart().length;
      const trimmed = match[0].trim();
      if (!trimmed) continue;
      const startOffset = match.index + leading;
      rawSpans.push({
        text: trimmed,
        startOffset,
        endOffset: startOffset + trimmed.length,
      });
    }
  }

  if (rawSpans.length === 0) {
    return [{ text: normalized, startOffset: 0, endOffset: normalized.length }];
  }

  // Merge false-positive splits (abbreviations, decimals, ellipsis, dialogue attribution)
  const merged: SentenceSpan[] = [];
  for (const span of rawSpans) {
    if (merged.length === 0) {
      merged.push({ ...span });
      continue;
    }
    const prev = merged[merged.length - 1];
    if (shouldMergeSentenceBoundary(normalized, prev.endOffset)) {
      prev.endOffset = span.endOffset;
      prev.text = normalized.slice(prev.startOffset, prev.endOffset);
    } else {
      merged.push({ ...span });
    }
  }

  return merged;
}

export function splitIntoSentences(input: string, locale = 'id'): string[] {
  return splitIntoSentencesWithOffsets(input, locale).map((s) => s.text);
}

/**
 * Tokenizes a sentence into words with exact offsets both locally and in chapter coordinates.
 */
export function tokenizeWords(
  sentence: string,
  sentenceIndex = 0,
  paragraphIndex = 0,
  sentenceChapterStart = 0
): WordToken[] {
  const tokens: WordToken[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(sentence)) !== null) {
    tokens.push({
      wordIndex: idx++,
      sentenceIndex,
      paragraphIndex,
      text: match[0],
      startChar: match.index,
      endChar: match.index + match[0].length,
      chapterStartChar: sentenceChapterStart + match.index,
      chapterEndChar: sentenceChapterStart + match.index + match[0].length,
    });
  }

  return tokens;
}

export interface ParagraphInputEntry {
  tag: ParsedParagraph['tag'];
  text: string;
  isFootnote?: boolean;
  isHeaderLike?: boolean;
  inlineFormats?: InlineFormatSpan[];
}

/**
 * Segments chapter paragraphs into a unified chapter-character coordinate system.
 * Paragraphs are separated by "\n\n" (2 chars) in chapter offset space.
 */
export function segmentParagraphs(
  entries: ParagraphInputEntry[],
  locale = 'id'
): {
  paragraphs: ParsedParagraph[];
  allSentences: SentenceSegment[];
  allWords: WordToken[];
  totalChars: number;
} {
  const paragraphs: ParsedParagraph[] = [];
  const allSentences: SentenceSegment[] = [];
  const allWords: WordToken[] = [];
  let cursor = 0;

  for (const entry of entries) {
    const cleanText = entry.text.replace(/\s+/g, ' ').trim();
    if (!cleanText) continue;

    const pIndex = paragraphs.length;
    const pStart = cursor;
    const pEnd = pStart + cleanText.length;
    const paraLang: 'id' | 'en' =
      detectLikelySourceLanguage(cleanText, locale) === 'id' ? 'id' : 'en';

    const spans = splitIntoSentencesWithOffsets(cleanText, locale);
    const sentenceSegments: SentenceSegment[] = spans.map((span) => {
      const globalIndex = allSentences.length;
      const chapStart = pStart + span.startOffset;
      const chapEnd = pStart + span.endOffset;
      const words = tokenizeWords(span.text, globalIndex, pIndex, chapStart);
      allWords.push(...words);

      const seg: SentenceSegment = {
        globalIndex,
        paragraphIndex: pIndex,
        text: span.text,
        chapterStartChar: chapStart,
        chapterEndChar: chapEnd,
        words,
        isFootnote: entry.isFootnote,
        detectedLang: paraLang,
      };
      allSentences.push(seg);
      return seg;
    });

    paragraphs.push({
      id: `p-${pIndex}`,
      index: pIndex,
      tag: entry.tag,
      rawText: cleanText,
      chapterStartChar: pStart,
      chapterEndChar: pEnd,
      sentences: sentenceSegments,
      isFootnote: entry.isFootnote,
      isHeaderLike: entry.isHeaderLike,
      inlineFormats: entry.inlineFormats,
    });

    cursor = pEnd + 2; // "\n\n" separator
  }

  return {
    paragraphs,
    allSentences,
    allWords,
    totalChars: Math.max(0, cursor - 2),
  };
}

export interface SpeechFilterOptions {
  skipParentheses?: boolean;
  skipSymbolsAndQuotes?: boolean;
  pronunciationDict?: PronunciationRule[];
  ttsOnlyRules?: TextReplaceRule[];
  chapterIndex?: number;
  bookCtx?: BookReplaceContext;
}

export function preprocessSpeechText(
  rawText: string,
  options: SpeechFilterOptions
): string {
  return buildTtsSpokenTransform(rawText, options).spokenText;
}

/**
 * Injects SSML <break> tags ONLY when the engine supports SSML and extra
 * comma/sentence pauses > 0. Never splits the utterance itself.
 */
export function buildOptionalSsml(
  plainText: string,
  commaPauseMs: number,
  sentencePauseMs: number,
  ssmlSupported: boolean
): { speakText: string; isSsml: boolean } {
  if (!ssmlSupported || (commaPauseMs <= 0 && sentencePauseMs <= 0)) {
    return { speakText: plainText, isSsml: false };
  }

  let escaped = plainText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (commaPauseMs > 0) {
    const clampedComma = Math.min(500, Math.max(0, Math.round(commaPauseMs)));
    escaped = escaped.replace(/([,;:])(\s+)/g, `$1<break time="${clampedComma}ms"/>$2`);
  }

  if (sentencePauseMs > 0) {
    const clampedSent = Math.min(600, Math.max(0, Math.round(sentencePauseMs)));
    escaped = escaped.replace(/([.!?]["”’')\]»]*)(\s+)/g, `$1<break time="${clampedSent}ms"/>$2`);
  }

  return {
    speakText: `<speak>${escaped}</speak>`,
    isSsml: true,
  };
}

export interface BuildSpeechQueueOptions {
  readingMode: TtsReadingMode;
  chunkSizeChars: number;
  maxEngineInputLength: number;
  paragraphPauseMs: number;
  commaPauseMs: number;
  sentencePauseMs: number;
  ssmlSupported: boolean;
  readFootnotes?: boolean;
  skipHeadersAndFootnotes?: boolean;
  readChapterTitle?: boolean;
  skipParentheses?: boolean;
  skipSymbolsAndQuotes?: boolean;
  pronunciationDict?: PronunciationRule[];
  ttsOnlyRules?: TextReplaceRule[];
  chapterIndex?: number;
  bookCtx?: BookReplaceContext;
}

function splitCommaSegments(text: string): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];
  const regex = /[^,;:]+(?:[,;:]+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = match.index + lead;
    results.push({
      text: trimmed,
      start,
      end: start + trimmed.length,
    });
  }
  return results.length > 0 ? results : [{ text, start: 0, end: text.length }];
}

/**
 * Builds the playback queue of voice units starting from `startChapterOffset`.
 * - "flowing": sends whole paragraphs (or merges short dialogue paragraphs up to ~300-600 chars)
 *   as single speech units; splits long paragraphs ONLY at sentence boundaries before
 *   min(chunkSizeChars, maxEngineInputLength). Adds paragraphPauseMs only between paragraphs.
 *   When commaPauseMs > 0 and SSML is unavailable, splits at comma clauses while keeping
 *   exact chapter charOffset mapping intact.
 * - "sentence": per-sentence fallback mode.
 */
export function buildSpeechChunksFromOffset(
  paragraphs: ParsedParagraph[],
  startChapterOffset: number,
  options: BuildSpeechQueueOptions
): SpeechChunk[] {
  if (paragraphs.length === 0) return [];

  const filteredParagraphs = paragraphs.filter((para, idx) => {
    if (options.readChapterTitle === false && idx === 0 && para.tag === 'h1') {
      return false;
    }
    if (options.skipHeadersAndFootnotes && (para.isHeaderLike || para.isFootnote)) {
      return false;
    }
    if (options.readFootnotes === false && para.isFootnote) {
      return false;
    }
    return true;
  });

  if (filteredParagraphs.length === 0) return [];

  const userChunkSize = Math.max(300, Math.min(3000, options.chunkSizeChars));
  const engineLimit = options.maxEngineInputLength > 0 ? options.maxEngineInputLength : 3500;
  const hardMax = Math.min(userChunkSize, engineLimit);
  const shortMergeTarget = Math.min(600, Math.max(300, Math.round(hardMax * 0.6)));
  const isShortPiece = (len: number) => len < 180;
  const chunks: SpeechChunk[] = [];

  const speechFilterOpts: SpeechFilterOptions = {
    skipParentheses: options.skipParentheses,
    skipSymbolsAndQuotes: options.skipSymbolsAndQuotes,
    pronunciationDict: options.pronunciationDict,
    ttsOnlyRules: options.ttsOnlyRules,
    chapterIndex: options.chapterIndex,
    bookCtx: options.bookCtx,
  };

  if (options.readingMode === 'sentence') {
    const useCommaSplit = !options.ssmlSupported && options.commaPauseMs > 0;
    for (const para of filteredParagraphs) {
      for (let sIdx = 0; sIdx < para.sentences.length; sIdx++) {
        const sent = para.sentences[sIdx];
        if (sent.chapterEndChar <= startChapterOffset) continue;

        const sliceStart = Math.max(sent.chapterStartChar, startChapterOffset);
        const relStart = sliceStart - sent.chapterStartChar;
        const text = sent.text.slice(relStart).trimStart();
        const leadingTrim = sent.text.slice(relStart).length - text.length;
        const actualStart = sliceStart + leadingTrim;
        if (!text) continue;

        const isLastInPara = sIdx === para.sentences.length - 1;
        const subSegments = useCommaSplit
          ? splitCommaSegments(text)
          : [{ text, start: 0, end: text.length }];

        subSegments.forEach((seg, segIdx) => {
          const isLastSub = segIdx === subSegments.length - 1;
          const { spokenText: processed, offsetMap } = buildTtsSpokenTransform(
            seg.text,
            speechFilterOpts
          );
          if (!processed) return;
          const { speakText, isSsml } = buildOptionalSsml(
            processed,
            options.commaPauseMs,
            options.sentencePauseMs,
            options.ssmlSupported
          );
          const segStartChar = actualStart + seg.start;
          const segEndChar = actualStart + seg.end;
          const pauseMs = isLastSub
            ? isLastInPara
              ? options.paragraphPauseMs
              : Math.max(120, options.sentencePauseMs || 0)
            : options.commaPauseMs;

          chunks.push({
            chunkIndex: chunks.length,
            text: seg.text,
            speakText,
            isSsml,
            chapterStartChar: segStartChar,
            chapterEndChar: segEndChar,
            pauseAfterMs: pauseMs,
            detectedLang: sent.detectedLang,
            slices: [
              {
                paragraphIndex: para.index,
                chapterStartChar: segStartChar,
                chapterEndChar: segEndChar,
                localStartChar: 0,
                localEndChar: seg.text.length,
              },
            ],
            spokenOffsetMap: offsetMap,
          });
        });
      }
    }
    if (chunks.length > 0) {
      chunks[chunks.length - 1].pauseAfterMs = 0;
    }
    return chunks;
  }

  // Flowing mode: collect paragraph segments starting at or after startChapterOffset
  interface ParaSegment {
    paragraphIndex: number;
    text: string;
    chapterStartChar: number;
    chapterEndChar: number;
    endsParagraph: boolean;
    detectedLang?: 'id' | 'en';
  }

  const atomicPieces: ParaSegment[] = [];

  for (const para of filteredParagraphs) {
    if (para.chapterEndChar <= startChapterOffset) continue;

    // Extract remaining portion of paragraph if resuming mid-paragraph
    const resumeStart = Math.max(para.chapterStartChar, startChapterOffset);
    // Align to sentence start if offset falls inside a sentence's first word or keep exact word start
    const remainingSentences = para.sentences.filter((s) => s.chapterEndChar > resumeStart);
    if (remainingSentences.length === 0) continue;

    // Group sentences of this paragraph up to `hardMax`
    let groupSentences: SentenceSegment[] = [];
    let groupLen = 0;

    const flushGroup = (isParaEnd: boolean) => {
      if (groupSentences.length === 0) return;
      const first = groupSentences[0];
      const last = groupSentences[groupSentences.length - 1];
      const sliceStart = Math.max(first.chapterStartChar, resumeStart);
      const rawPrefix = first.text.slice(sliceStart - first.chapterStartChar);
      const trimLead = rawPrefix.length - rawPrefix.trimStart().length;
      const actualStart = sliceStart + trimLead;

      const textParts = groupSentences.map((s, idx) => {
        if (idx === 0) {
          return s.text.slice(actualStart - s.chapterStartChar);
        }
        return s.text;
      });
      const joined = textParts.join(' ');
      atomicPieces.push({
        paragraphIndex: para.index,
        text: joined,
        chapterStartChar: actualStart,
        chapterEndChar: last.chapterEndChar,
        endsParagraph: isParaEnd,
        detectedLang: first.detectedLang,
      });
      groupSentences = [];
      groupLen = 0;
    };

    for (let i = 0; i < remainingSentences.length; i++) {
      const sent = remainingSentences[i];
      const isLast = i === remainingSentences.length - 1;
      const effectiveLen =
        i === 0 && sent.chapterStartChar < resumeStart
          ? sent.chapterEndChar - resumeStart
          : sent.text.length;

      if (groupSentences.length > 0 && groupLen + 1 + effectiveLen > hardMax) {
        flushGroup(false);
      }

      // If a single giant sentence still exceeds engine limit, split safely by words
      if (effectiveLen > hardMax && groupSentences.length === 0) {
        const startOff = Math.max(sent.chapterStartChar, resumeStart);
        const sliceText = sent.text.slice(startOff - sent.chapterStartChar).trimStart();
        const leadSkip = sent.text.slice(startOff - sent.chapterStartChar).length - sliceText.length;
        let subCursor = 0;
        const baseStart = startOff + leadSkip;

        while (subCursor < sliceText.length) {
          let cut = Math.min(sliceText.length, subCursor + hardMax);
          if (cut < sliceText.length) {
            const lastSpace = sliceText.lastIndexOf(' ', cut);
            if (lastSpace > subCursor + Math.floor(hardMax * 0.4)) {
              cut = lastSpace;
            }
          }
          const piece = sliceText.slice(subCursor, cut).trim();
          if (piece) {
            const leadingPiece = sliceText.slice(subCursor, cut).length - sliceText.slice(subCursor, cut).trimStart().length;
            const pStart = baseStart + subCursor + leadingPiece;
            atomicPieces.push({
              paragraphIndex: para.index,
              text: piece,
              chapterStartChar: pStart,
              chapterEndChar: pStart + piece.length,
              endsParagraph: isLast && cut >= sliceText.length,
              detectedLang: sent.detectedLang,
            });
          }
          subCursor = cut;
          while (subCursor < sliceText.length && sliceText[subCursor] === ' ') subCursor++;
        }
        continue;
      }

      groupSentences.push(sent);
      groupLen += (groupLen > 0 ? 1 : 0) + effectiveLen;

      if (isLast) {
        flushGroup(true);
      }
    }
  }

  // Merge very short consecutive paragraph pieces (e.g., short 1-line dialog)
  // up to ~300-600 chars so the TTS engine flows without awkward restarts,
  // while keeping longer paragraphs separated by `paragraphPauseMs`.
  let bufferPieces: ParaSegment[] = [];
  let bufferLen = 0;

  const commitBuffer = () => {
    if (bufferPieces.length === 0) return;

    const slices: SpeechChunkSlice[] = [];
    let combined = '';

    for (let i = 0; i < bufferPieces.length; i++) {
      const piece = bufferPieces[i];
      if (i > 0) combined += ' ';
      const localStart = combined.length;
      combined += piece.text;
      slices.push({
        paragraphIndex: piece.paragraphIndex,
        chapterStartChar: piece.chapterStartChar,
        chapterEndChar: piece.chapterEndChar,
        localStartChar: localStart,
        localEndChar: combined.length,
      });
    }

    const lastPiece = bufferPieces[bufferPieces.length - 1];
    const { spokenText: processed, offsetMap } = buildTtsSpokenTransform(
      combined,
      speechFilterOpts
    );
    if (processed) {
      const { speakText, isSsml } = buildOptionalSsml(
        processed,
        options.commaPauseMs,
        options.sentencePauseMs,
        options.ssmlSupported
      );

      chunks.push({
        chunkIndex: chunks.length,
        text: combined,
        speakText,
        isSsml,
        chapterStartChar: bufferPieces[0].chapterStartChar,
        chapterEndChar: lastPiece.chapterEndChar,
        pauseAfterMs: lastPiece.endsParagraph ? options.paragraphPauseMs : 0,
        detectedLang: bufferPieces[0].detectedLang,
        slices,
        spokenOffsetMap: offsetMap,
      });
    }

    bufferPieces = [];
    bufferLen = 0;
  };

  for (const piece of atomicPieces) {
    if (bufferPieces.length === 0) {
      bufferPieces.push(piece);
      bufferLen = piece.text.length;
      if (!piece.endsParagraph || !isShortPiece(bufferLen) || bufferLen >= shortMergeTarget) {
        commitBuffer();
      }
      continue;
    }

    // Merge consecutive short paragraphs (e.g. short 1-line dialog) up to shortMergeTarget
    // without crossing detected language boundaries
    const prevLang = bufferPieces[bufferPieces.length - 1]?.detectedLang;
    if (
      piece.endsParagraph &&
      isShortPiece(piece.text.length) &&
      (!prevLang || !piece.detectedLang || prevLang === piece.detectedLang) &&
      bufferLen + 1 + piece.text.length <= shortMergeTarget
    ) {
      bufferPieces.push(piece);
      bufferLen += 1 + piece.text.length;
      if (bufferLen >= shortMergeTarget) {
        commitBuffer();
      }
    } else {
      commitBuffer();
      bufferPieces.push(piece);
      bufferLen = piece.text.length;
      if (!piece.endsParagraph || !isShortPiece(bufferLen) || bufferLen >= shortMergeTarget) {
        commitBuffer();
      }
    }
  }
  commitBuffer();

  // No trailing pause needed after the final chunk of a chapter
  if (chunks.length > 0) {
    chunks[chunks.length - 1].pauseAfterMs = 0;
  }

  return chunks;
}

/**
 * Maps a local character index inside a SpeechChunk back to the exact chapter character offset.
 */
export function mapChunkLocalOffsetToChapterOffset(
  chunk: SpeechChunk,
  spokenLocalCharOffset: number
): number {
  const rawLocalOffset = chunk.spokenOffsetMap
    ? mapSpokenOffsetToOriginal(spokenLocalCharOffset, chunk.spokenOffsetMap)
    : spokenLocalCharOffset;
  const clampedLocal = Math.max(0, Math.min(rawLocalOffset, chunk.text.length));
  for (const slice of chunk.slices) {
    if (clampedLocal >= slice.localStartChar && clampedLocal <= slice.localEndChar) {
      const delta = clampedLocal - slice.localStartChar;
      return Math.min(slice.chapterEndChar, slice.chapterStartChar + delta);
    }
  }
  return chunk.chapterStartChar;
}

/**
 * Finds the active sentence & word indices from a chapter character offset.
 */
export function findLocationAtChapterOffset(
  allSentences: SentenceSegment[],
  chapterOffset: number
): { sentenceIndex: number; wordIndex: number; paragraphIndex: number; chapterOffset: number } {
  if (allSentences.length === 0) {
    return { sentenceIndex: 0, wordIndex: 0, paragraphIndex: 0, chapterOffset: 0 };
  }

  // Binary search for sentence containing or nearest after chapterOffset
  let lo = 0;
  let hi = allSentences.length - 1;
  let matchedSentence = allSentences[0];

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = allSentences[mid];
    if (chapterOffset >= s.chapterStartChar && chapterOffset <= s.chapterEndChar) {
      matchedSentence = s;
      break;
    }
    if (chapterOffset < s.chapterStartChar) {
      matchedSentence = s;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  if (chapterOffset > allSentences[allSentences.length - 1].chapterEndChar) {
    matchedSentence = allSentences[allSentences.length - 1];
  }

  const words = matchedSentence.words;
  let wordIndex = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (chapterOffset >= w.chapterStartChar && chapterOffset <= w.chapterEndChar) {
      wordIndex = w.wordIndex;
      break;
    }
    if (chapterOffset < w.chapterStartChar) {
      wordIndex = w.wordIndex;
      break;
    }
    wordIndex = w.wordIndex;
  }

  return {
    sentenceIndex: matchedSentence.globalIndex,
    wordIndex,
    paragraphIndex: matchedSentence.paragraphIndex,
    chapterOffset: Math.max(0, chapterOffset),
  };
}

/**
 * Resolves the starting character offset of the sentence that contains `chapterOffset`.
 * Used for clean sentence-aligned resume after pause/stop if desired.
 */
export function findSentenceStartForOffset(
  allSentences: SentenceSegment[],
  chapterOffset: number
): number {
  const loc = findLocationAtChapterOffset(allSentences, chapterOffset);
  return allSentences[loc.sentenceIndex]?.chapterStartChar ?? 0;
}

/**
 * Estimates total spoken duration (ms) of a speech chunk at a given rate (0.5x - 3.0x),
 * used strictly as a non-intrusive visual highlight fallback when boundary events are absent.
 */
export function estimateChunkDurationMs(text: string, rate: number): number {
  const safeRate = Math.max(0.5, Math.min(3.5, rate || 1));
  const chars = Math.max(1, text.trim().length);
  // Average natural Indonesian/English speech ~14.5 chars/sec at 1.0x
  const baseMs = (chars / 14.5) * 1000;
  return Math.max(350, Math.round(baseMs / safeRate));
}

export function detectLikelySourceLanguage(text: string, bookLangHint?: string): string {
  const normalizedHint = bookLangHint ? normalizeBookLocale(bookLangHint) : '';
  const hint = normalizedHint.toLowerCase().split('-')[0];
  const sample = ` ${text.toLowerCase()} `;

  const idHits = (
    sample.match(/\b(yang|dan|di|ke|dari|ini|itu|dengan|untuk|tidak|adalah|pada|saya|aku|mereka|akan|sudah)\b/g) || []
  ).length;
  const enHits = (
    sample.match(/\b(the|and|of|to|in|is|it|that|was|for|with|as|his|her|they|you|are|this)\b/g) || []
  ).length;

  if (idHits > enHits && idHits > 0) return 'id';
  if (enHits > idHits && enHits > 0) return 'en';
  if (hint && hint !== 'und' && hint.length === 2) return hint;
  return 'en';
}
