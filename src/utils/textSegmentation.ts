import type { CommaChunk, ParsedParagraph, SentenceSegment, WordToken } from '../types/reader';

const ABBREVIATIONS = new Set([
  'dr.',
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
  'yth.',
  'a.n.',
  's.h.',
  's.kom.',
  'st.',
  'vs.',
  'e.g.',
  'i.e.',
  'etc.',
]);

/**
 * Splits prose into sentences at terminal punctuation (., !, ?) including
 * trailing closing quotes or parentheses, while avoiding splits inside common
 * abbreviations and decimal numbers.
 */
export function splitIntoSentences(input: string): string[] {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;

    // Skip ellipsis continuation dots until final dot
    if (ch === '.' && normalized[i + 1] === '.') continue;

    // Skip decimal numbers like 3.14
    if (ch === '.' && i > 0 && /\d/.test(normalized[i - 1]) && /\d/.test(normalized[i + 1] ?? '')) {
      continue;
    }

    // Check abbreviation ending with dot
    if (ch === '.') {
      const sliceBefore = normalized.slice(start, i + 1);
      const lastWordMatch = sliceBefore.match(/([A-Za-zÀ-ÿ.]+)$/);
      if (lastWordMatch && ABBREVIATIONS.has(lastWordMatch[1].toLowerCase())) {
        continue;
      }
    }

    // Advance past any closing quote / bracket immediately following punctuation
    let endIdx = i + 1;
    let sawClosingQuote = false;
    while (endIdx < normalized.length && /["”’')\]»]/.test(normalized[endIdx])) {
      if (/["”’'»]/.test(normalized[endIdx])) {
        sawClosingQuote = true;
      }
      endIdx++;
    }

    const nextChar = normalized[endIdx];
    const isAtEnd = endIdx >= normalized.length;
    const followedBySpace = nextChar === ' ';

    // Keep dialogue attribution like `"Sudah siap?" tanya Nara.` as one sentence
    if (sawClosingQuote && followedBySpace && endIdx + 1 < normalized.length) {
      const nextWordStart = normalized[endIdx + 1];
      if (/[a-zà-ÿ]/.test(nextWordStart)) {
        continue;
      }
    }

    if (isAtEnd || followedBySpace) {
      const piece = normalized.slice(start, endIdx).trim();
      if (piece) {
        sentences.push(piece);
      }
      start = endIdx;
      while (start < normalized.length && normalized[start] === ' ') {
        start++;
      }
      i = Math.max(i, start - 1);
    }
  }

  if (start < normalized.length) {
    const tail = normalized.slice(start).trim();
    if (tail) sentences.push(tail);
  }

  return sentences;
}

/**
 * Tokenizes a sentence into words with exact UTF-16 character offsets
 * so TTS range/boundary events map cleanly to highlighted words.
 */
export function tokenizeWords(sentence: string): WordToken[] {
  const tokens: WordToken[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(sentence)) !== null) {
    tokens.push({
      wordIndex: idx++,
      text: match[0],
      startChar: match.index,
      endChar: match.index + match[0].length,
    });
  }

  return tokens;
}

/**
 * Splits a sentence into comma/semicolon/colon segments so TTS can insert
 * natural micro-pauses (0-500ms) while preserving exact character offsets
 * relative to the parent sentence.
 */
export function splitSentenceIntoCommaChunks(
  sentence: string,
  commaPauseMs: number,
  startFromWordIndex = 0
): CommaChunk[] {
  const words = tokenizeWords(sentence);
  let effectiveStartOffset = 0;

  if (startFromWordIndex > 0 && words.length > 0) {
    const clampedIndex = Math.min(startFromWordIndex, words.length - 1);
    effectiveStartOffset = words[clampedIndex].startChar;
  }

  const sliced = sentence.slice(effectiveStartOffset);
  if (!sliced.trim()) return [];

  const chunks: CommaChunk[] = [];
  // Split after [,;:] followed by whitespace, keeping punctuation with preceding clause
  const boundaryRegex = /([,;:])(?=\s+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boundaryRegex.exec(sliced)) !== null) {
    const splitPoint = match.index + match[0].length;
    const rawSegment = sliced.slice(lastIndex, splitPoint);
    const leadingSpaces = rawSegment.length - rawSegment.trimStart().length;
    const trimmed = rawSegment.trim();

    if (trimmed) {
      chunks.push({
        chunkIndex: chunks.length,
        text: trimmed,
        startCharOffset: effectiveStartOffset + lastIndex + leadingSpaces,
        endCharOffset: effectiveStartOffset + lastIndex + leadingSpaces + trimmed.length,
        pauseAfterMs: Math.max(0, Math.min(500, commaPauseMs)),
      });
    }
    lastIndex = splitPoint;
  }

  if (lastIndex < sliced.length) {
    const rawTail = sliced.slice(lastIndex);
    const leadingSpaces = rawTail.length - rawTail.trimStart().length;
    const trimmedTail = rawTail.trim();
    if (trimmedTail) {
      chunks.push({
        chunkIndex: chunks.length,
        text: trimmedTail,
        startCharOffset: effectiveStartOffset + lastIndex + leadingSpaces,
        endCharOffset: effectiveStartOffset + lastIndex + leadingSpaces + trimmedTail.length,
        pauseAfterMs: 0,
      });
    }
  }

  // Ensure the final chunk never waits for a comma pause
  if (chunks.length > 0) {
    chunks[chunks.length - 1].pauseAfterMs = 0;
  }

  return chunks;
}

/**
 * Maps a character offset within a sentence back to the matching word index.
 */
export function findWordIndexAtCharOffset(words: WordToken[], charOffset: number): number {
  if (words.length === 0) return 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (charOffset >= w.startChar && charOffset < w.endChar) {
      return w.wordIndex;
    }
    if (charOffset < w.startChar) {
      return Math.max(0, i);
    }
  }
  return words.length - 1;
}

/**
 * Fallback duration estimator per word (in ms) when native onRangeStart /
 * WebSpeech onboundary events are not emitted by the active TTS engine.
 */
export function estimateWordDurationMs(word: string, rate: number): number {
  const safeRate = Math.max(0.5, Math.min(2.5, rate || 1));
  const cleanLen = Math.max(1, word.replace(/[^\p{L}\p{N}]/gu, '').length);
  const baseMs = 155 + cleanLen * 36;
  const punctuationBonus = /[,;:]$/.test(word) ? 110 : /[.!?]$/.test(word) ? 140 : 0;
  return Math.round((baseMs + punctuationBonus) / safeRate);
}

/**
 * Segments clean paragraph entries into structured paragraphs and a flat
 * array of sentences indexed globally across the chapter.
 */
export function segmentParagraphs(
  entries: Array<{ tag: ParsedParagraph['tag']; text: string }>
): { paragraphs: ParsedParagraph[]; allSentences: SentenceSegment[] } {
  const paragraphs: ParsedParagraph[] = [];
  const allSentences: SentenceSegment[] = [];

  for (const entry of entries) {
    const cleanText = entry.text.replace(/\s+/g, ' ').trim();
    if (!cleanText) continue;

    const pIndex = paragraphs.length;
    const rawSentences = splitIntoSentences(cleanText);
    const sentenceSegments: SentenceSegment[] = rawSentences.map((sentenceText) => {
      const globalIndex = allSentences.length;
      const seg: SentenceSegment = {
        globalIndex,
        paragraphIndex: pIndex,
        text: sentenceText,
        words: tokenizeWords(sentenceText),
      };
      allSentences.push(seg);
      return seg;
    });

    paragraphs.push({
      id: `p-${pIndex}`,
      index: pIndex,
      tag: entry.tag,
      rawText: cleanText,
      sentences: sentenceSegments,
    });
  }

  return { paragraphs, allSentences };
}

/**
 * Lightweight language heuristic for keyless MyMemory API (which expects an
 * explicit source language rather than 'auto').
 */
export function detectLikelySourceLanguage(text: string, bookLangHint?: string): string {
  const hint = (bookLangHint || '').toLowerCase().split('-')[0];
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
