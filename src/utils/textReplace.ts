import type {
  FindReplaceDefaultSettings,
  InlineFormatSpan,
  PronunciationRule,
  ReplaceScope,
  SpokenOffsetSegment,
  TextReplaceRule,
} from '../types/reader';

export interface BookReplaceContext {
  bookId: string;
  sha1?: string;
  seriesKey?: string;
}

export const DEFAULT_FIND_REPLACE_SETTINGS: FindReplaceDefaultSettings = {
  defaultScope: 'book',
  defaultCaseSensitive: false,
  defaultWholeWord: false,
  defaultPreserveCase: false,
  applyToToc: true,
};

export const SCOPE_LABELS: Record<ReplaceScope, string> = {
  onlyThis: 'Hanya yang ini',
  chapter: 'Bab ini',
  fromHereToEnd: 'Dari sini sampai akhir buku',
  book: 'Semua kemunculan di buku ini',
  series: 'Semua buku di seri ini',
  global: 'Semua buku (global)',
};

export const SCOPE_PRIORITY_ORDER: Record<ReplaceScope, number> = {
  onlyThis: 0,
  chapter: 1,
  fromHereToEnd: 2,
  book: 3,
  series: 4,
  global: 5,
};

const MAX_REGEX_LENGTH = 400;
const MAX_MATCHES_PER_BLOCK = 1000;
const WORD_CHAR_REGEX = /[\p{L}\p{N}_]/u;

export function isUnicodeWordChar(ch: string): boolean {
  if (!ch) return false;
  return WORD_CHAR_REGEX.test(ch);
}

export function escapeRegExpLiteral(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks whether a regex contains nested quantifiers or ambiguous repeated
 * alternations that can trigger catastrophic backtracking (ReDoS).
 */
function hasCatastrophicQuantifierNesting(pattern: string): boolean {
  const groupStack: Array<{ hasQuantifier: boolean; hasAlternation: boolean }> = [];
  let inCharClass = false;
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (inCharClass) {
      if (ch === ']') inCharClass = false;
      i++;
      continue;
    }
    if (ch === '[') {
      inCharClass = true;
      i++;
      continue;
    }
    if (ch === '(') {
      groupStack.push({ hasQuantifier: false, hasAlternation: false });
      // Skip group prefix markers like (?:, (?=, (?!, (?<=, (?<!, (?<name>
      if (pattern[i + 1] === '?') {
        if (pattern[i + 2] === '<' && pattern[i + 3] && pattern[i + 3] !== '=' && pattern[i + 3] !== '!') {
          const closeAngle = pattern.indexOf('>', i + 3);
          if (closeAngle !== -1) i = closeAngle;
        }
      }
      i++;
      continue;
    }
    if (ch === ')') {
      const top = groupStack.pop();
      // Check if closing group is immediately followed by a quantifier
      const next = pattern[i + 1];
      const nextIsQuantifier =
        next === '+' ||
        next === '*' ||
        (next === '{' && /^\{\d*,?\d*\}/.test(pattern.slice(i + 1)));
      if (top && nextIsQuantifier && (top.hasQuantifier || top.hasAlternation)) {
        return true;
      }
      if (top && nextIsQuantifier && groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasQuantifier = true;
      }
      i++;
      continue;
    }
    if (ch === '|' && groupStack.length > 0) {
      groupStack[groupStack.length - 1].hasAlternation = true;
      i++;
      continue;
    }
    if ((ch === '+' || ch === '*' || ch === '{') && groupStack.length > 0) {
      const isQuant = ch !== '{' || /^\{\d+(?:,\d*)?\}/.test(pattern.slice(i));
      if (isQuant) {
        groupStack[groupStack.length - 1].hasQuantifier = true;
      }
    }
    i++;
  }

  return false;
}

export function validateReplacePattern(
  pattern: string,
  isRegex: boolean
): { valid: boolean; error?: string } {
  if (!pattern) {
    return { valid: false, error: 'Teks atau pola yang dicari tidak boleh kosong.' };
  }

  if (!isRegex) {
    return { valid: true };
  }

  if (pattern.length > MAX_REGEX_LENGTH) {
    return {
      valid: false,
      error: `Pola regex terlalu panjang (maksimal ${MAX_REGEX_LENGTH} karakter).`,
    };
  }

  if (hasCatastrophicQuantifierNesting(pattern)) {
    return {
      valid: false,
      error: 'Pola regex berisiko menyebabkan loop/lambat (nested quantifier seperti (a+)+ tidak diizinkan).',
    };
  }

  try {
    const compiled = new RegExp(pattern, 'u');
    if (compiled.test('')) {
      return {
        valid: false,
        error: 'Pola regex tidak boleh cocok dengan teks kosong (berisiko loop tak terbatas).',
      };
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Pola regex tidak valid: ${err instanceof Error ? err.message : 'sintaks salah'}`,
    };
  }
}

export function applyPreserveCase(matched: string, replacement: string): string {
  if (!replacement) return '';
  const hasLower = matched !== matched.toUpperCase();
  const hasUpper = matched !== matched.toLowerCase();

  if (hasUpper && !hasLower && matched.length > 0) {
    return replacement.toUpperCase();
  }

  const chars = Array.from(matched);
  const first = chars[0] || '';
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    const repChars = Array.from(replacement);
    if (repChars.length > 0) {
      repChars[0] = repChars[0].toUpperCase();
      return repChars.join('');
    }
  }

  if (hasLower && !hasUpper) {
    return replacement.toLowerCase();
  }

  return replacement;
}

export function expandRegexReplacement(template: string, match: RegExpExecArray): string {
  return template.replace(/\$\$|\$&|\$(\d{1,2})/g, (token, groupNum?: string) => {
    if (token === '$$') return '$';
    if (token === '$&') return match[0];
    if (groupNum) {
      const idx = Number.parseInt(groupNum, 10);
      return idx >= 1 && idx < match.length ? (match[idx] ?? '') : '';
    }
    return token;
  });
}

export interface TextMatchResult {
  start: number;
  end: number;
  matched: string;
  replaced: string;
}

function getPrevChar(text: string, index: number): string {
  if (index <= 0) return '';
  const code = text.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index >= 2) {
    return text.slice(index - 2, index);
  }
  return text[index - 1];
}

function getNextChar(text: string, index: number): string {
  if (index >= text.length) return '';
  const code = text.charCodeAt(index);
  if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
    return text.slice(index, index + 2);
  }
  return text[index];
}

export type ReplaceMatcherRule = Pick<
  TextReplaceRule,
  'pattern' | 'replacement' | 'caseSensitive' | 'wholeWord' | 'preserveCase' | 'isRegex'
>;

export function findMatchesInText(text: string, rule: ReplaceMatcherRule): TextMatchResult[] {
  if (!text || !rule.pattern) return [];

  const check = validateReplacePattern(rule.pattern, rule.isRegex);
  if (!check.valid) return [];

  const source = rule.isRegex ? rule.pattern : escapeRegExpLiteral(rule.pattern);
  const flags = rule.caseSensitive ? 'gu' : 'giu';
  let regex: RegExp;
  try {
    regex = new RegExp(source, flags);
  } catch {
    return [];
  }

  const results: TextMatchResult[] = [];
  let match: RegExpExecArray | null;
  let guardCount = 0;

  while ((match = regex.exec(text)) !== null) {
    if (++guardCount > MAX_MATCHES_PER_BLOCK) break;
    const matched = match[0];
    if (matched.length === 0) {
      regex.lastIndex += 1;
      if (regex.lastIndex > text.length) break;
      continue;
    }

    const start = match.index;
    const end = start + matched.length;

    if (rule.wholeWord) {
      const chars = Array.from(matched);
      const firstMatchChar = chars[0] || '';
      const lastMatchChar = chars[chars.length - 1] || '';
      const prevChar = getPrevChar(text, start);
      const nextChar = getNextChar(text, end);

      if (isUnicodeWordChar(firstMatchChar) && isUnicodeWordChar(prevChar)) {
        continue;
      }
      if (isUnicodeWordChar(lastMatchChar) && isUnicodeWordChar(nextChar)) {
        continue;
      }
    }

    let rep = rule.isRegex
      ? expandRegexReplacement(rule.replacement, match)
      : rule.replacement;

    if (rule.preserveCase) {
      rep = applyPreserveCase(matched, rep);
    }

    results.push({ start, end, matched, replaced: rep });
  }

  return results;
}

export function doesRuleApplyToBook(rule: TextReplaceRule, ctx: BookReplaceContext): boolean {
  if (!rule.enabled) return false;
  if (rule.scope === 'global') return true;
  if (rule.scope === 'series') {
    if (!rule.seriesKey || !ctx.seriesKey) return false;
    return rule.seriesKey.trim().toLowerCase() === ctx.seriesKey.trim().toLowerCase();
  }
  // onlyThis, chapter, fromHereToEnd, book
  if (rule.bookSha1 && ctx.sha1) {
    return rule.bookSha1 === ctx.sha1;
  }
  return Boolean(rule.bookId && rule.bookId === ctx.bookId);
}

export function filterAndSortRulesForChapter(
  rules: TextReplaceRule[],
  ctx: BookReplaceContext,
  chapterIndex: number,
  ttsOnlyFilter: boolean
): TextReplaceRule[] {
  return rules
    .filter((r) => {
      if (r.ttsOnly !== ttsOnlyFilter) return false;
      if (!doesRuleApplyToBook(r, ctx)) return false;
      if (r.scope === 'onlyThis' || r.scope === 'chapter') {
        return r.targetChapterIndex === chapterIndex;
      }
      if (r.scope === 'fromHereToEnd') {
        return chapterIndex >= (r.targetChapterIndex ?? 0);
      }
      return true;
    })
    .sort((a, b) => {
      const sa = SCOPE_PRIORITY_ORDER[a.scope] ?? 99;
      const sb = SCOPE_PRIORITY_ORDER[b.scope] ?? 99;
      if (sa !== sb) return sa - sb;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });
}

export function makeMatchExclusionKey(
  chapterIndex: number,
  paragraphIndex: number,
  startChar: number
): string {
  return `${chapterIndex}:${paragraphIndex}:${startChar}`;
}

interface OffsetEdit {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

function buildOffsetMapper(edits: OffsetEdit[]) {
  return (oldPos: number, isEnd: boolean): number => {
    let shift = 0;
    for (const e of edits) {
      if (oldPos < e.oldStart) {
        return oldPos + shift;
      }
      if (oldPos <= e.oldEnd) {
        if (oldPos === e.oldStart) return e.newStart;
        if (oldPos === e.oldEnd) return e.newEnd;
        return isEnd ? e.newEnd : e.newStart;
      }
      shift += (e.newEnd - e.newStart) - (e.oldEnd - e.oldStart);
    }
    return oldPos + shift;
  };
}

function applySingleRuleToParagraphText(
  text: string,
  inlineFormats: InlineFormatSpan[] | undefined,
  rule: TextReplaceRule,
  chapterIndex: number,
  paragraphIndex: number,
  paragraphChapterStartChar: number
): {
  text: string;
  inlineFormats: InlineFormatSpan[] | undefined;
  appliedCount: number;
  skippedCount: number;
} {
  let candidates = findMatchesInText(text, rule);
  if (candidates.length === 0) {
    return { text, inlineFormats, appliedCount: 0, skippedCount: 0 };
  }

  if (rule.scope === 'onlyThis') {
    if (
      rule.targetParagraphIndex !== undefined &&
      rule.targetParagraphIndex !== paragraphIndex
    ) {
      return { text, inlineFormats, appliedCount: 0, skippedCount: 0 };
    }
    const targetOffset = rule.targetCharOffset ?? 0;
    let best: TextMatchResult | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const absStart = paragraphChapterStartChar + c.start;
      const dist = Math.abs(absStart - targetOffset);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    candidates = best ? [best] : [];
  } else if (
    rule.scope === 'fromHereToEnd' &&
    chapterIndex === (rule.targetChapterIndex ?? 0)
  ) {
    const minOffset = rule.targetCharOffset ?? 0;
    candidates = candidates.filter((c) => paragraphChapterStartChar + c.end > minOffset);
  }

  if (rule.excludedMatchKeys && rule.excludedMatchKeys.length > 0) {
    const excluded = new Set(rule.excludedMatchKeys);
    candidates = candidates.filter(
      (c) => !excluded.has(makeMatchExclusionKey(chapterIndex, paragraphIndex, c.start))
    );
  }

  if (candidates.length === 0) {
    return { text, inlineFormats, appliedCount: 0, skippedCount: 0 };
  }

  let out = '';
  let cursor = 0;
  const edits: OffsetEdit[] = [];

  for (const m of candidates) {
    out += text.slice(cursor, m.start);
    const newStart = out.length;
    out += m.replaced;
    const newEnd = out.length;
    edits.push({
      oldStart: m.start,
      oldEnd: m.end,
      newStart,
      newEnd,
    });
    cursor = m.end;
  }
  out += text.slice(cursor);

  let nextFormats = inlineFormats;
  if (inlineFormats && inlineFormats.length > 0) {
    const mapPos = buildOffsetMapper(edits);
    nextFormats = inlineFormats
      .map((span) => ({
        ...span,
        start: mapPos(span.start, false),
        end: mapPos(span.end, true),
      }))
      .filter((span) => span.end > span.start);
  }

  return {
    text: out,
    inlineFormats: nextFormats,
    appliedCount: candidates.length,
    skippedCount: 0,
  };
}

export function applyTextReplaceRulesToParagraph(params: {
  text: string;
  inlineFormats?: InlineFormatSpan[];
  chapterIndex: number;
  paragraphIndex: number;
  paragraphChapterStartChar: number;
  rules: TextReplaceRule[];
  bookCtx: BookReplaceContext;
  ttsOnly?: boolean;
}): {
  text: string;
  inlineFormats: InlineFormatSpan[] | undefined;
  appliedCount: number;
  skippedCount: number;
} {
  const ordered = filterAndSortRulesForChapter(
    params.rules,
    params.bookCtx,
    params.chapterIndex,
    Boolean(params.ttsOnly)
  );
  if (ordered.length === 0) {
    return {
      text: params.text,
      inlineFormats: params.inlineFormats,
      appliedCount: 0,
      skippedCount: 0,
    };
  }

  let currentText = params.text;
  let currentFormats = params.inlineFormats;
  let totalApplied = 0;
  let totalSkipped = 0;

  for (const rule of ordered) {
    const res = applySingleRuleToParagraphText(
      currentText,
      currentFormats,
      rule,
      params.chapterIndex,
      params.paragraphIndex,
      params.paragraphChapterStartChar
    );
    currentText = res.text;
    currentFormats = res.inlineFormats;
    totalApplied += res.appliedCount;
    totalSkipped += res.skippedCount;
  }

  return {
    text: currentText,
    inlineFormats: currentFormats,
    appliedCount: totalApplied,
    skippedCount: totalSkipped,
  };
}

export function applyNonTtsRulesToPlainText(
  rawText: string,
  rules: TextReplaceRule[],
  bookCtx: BookReplaceContext,
  chapterIndex = 0
): string {
  if (!rawText || rules.length === 0) return rawText;
  const res = applyTextReplaceRulesToParagraph({
    text: rawText,
    chapterIndex,
    paragraphIndex: 0,
    paragraphChapterStartChar: 0,
    rules,
    bookCtx,
    ttsOnly: false,
  });
  return res.text;
}

interface TrackedCharOrigin {
  char: string;
  origStart: number;
  origEnd: number;
}

function applyTrackedRegexPass(
  tracked: TrackedCharOrigin[],
  findMatches: (str: string) => Array<{ start: number; end: number; replaced: string }>
): TrackedCharOrigin[] {
  const str = tracked.map((c) => c.char).join('');
  const matches = findMatches(str);
  if (matches.length === 0) return tracked;

  const out: TrackedCharOrigin[] = [];
  let cursor = 0;

  for (const m of matches) {
    for (let i = cursor; i < m.start; i++) {
      out.push(tracked[i]);
    }
    const origStart = tracked[m.start]?.origStart ?? (out[out.length - 1]?.origEnd ?? 0);
    const origEnd =
      m.end > m.start
        ? (tracked[m.end - 1]?.origEnd ?? origStart)
        : origStart;
    for (let j = 0; j < m.replaced.length; j++) {
      out.push({
        char: m.replaced[j],
        origStart,
        origEnd,
      });
    }
    cursor = m.end;
  }

  for (let i = cursor; i < tracked.length; i++) {
    out.push(tracked[i]);
  }
  return out;
}

/**
 * Applies "Hanya untuk TTS" TextReplaceRules, pronunciationDict, and speech filters
 * while preserving a compact offset mapping table from spoken string indices back
 * to original rawText UTF-16 character offsets so TTS highlights never drift.
 */
export function buildTtsSpokenTransform(
  rawText: string,
  options: {
    ttsOnlyRules?: TextReplaceRule[];
    pronunciationDict?: PronunciationRule[];
    skipParentheses?: boolean;
    skipSymbolsAndQuotes?: boolean;
    chapterIndex?: number;
    bookCtx?: BookReplaceContext;
  }
): {
  spokenText: string;
  offsetMap: SpokenOffsetSegment[];
} {
  if (!rawText) {
    return { spokenText: '', offsetMap: [] };
  }

  let tracked: TrackedCharOrigin[] = [];
  for (let i = 0; i < rawText.length; i++) {
    tracked.push({ char: rawText[i], origStart: i, origEnd: i + 1 });
  }

  // 1. Apply active "Hanya untuk TTS" TextReplaceRules (chapter/book/series/global)
  if (options.ttsOnlyRules && options.ttsOnlyRules.length > 0 && options.bookCtx) {
    const ordered = filterAndSortRulesForChapter(
      options.ttsOnlyRules,
      options.bookCtx,
      options.chapterIndex ?? 0,
      true
    );
    for (const rule of ordered) {
      tracked = applyTrackedRegexPass(tracked, (s) =>
        findMatchesInText(s, rule).map((m) => ({
          start: m.start,
          end: m.end,
          replaced: m.replaced,
        }))
      );
    }
  }

  // 2. Skip Parentheses if enabled
  if (options.skipParentheses) {
    tracked = applyTrackedRegexPass(tracked, (s) => {
      const hits: Array<{ start: number; end: number; replaced: string }> = [];
      const parenRe = /\([^()]*\)|\[[^\[\]]*\]/g;
      let m: RegExpExecArray | null;
      while ((m = parenRe.exec(s)) !== null) {
        hits.push({ start: m.index, end: m.index + m[0].length, replaced: ' ' });
      }
      return hits;
    });
  }

  // 3. Apply Kamus Pelafalan (pronunciationDict)
  if (options.pronunciationDict && options.pronunciationDict.length > 0) {
    for (const pr of options.pronunciationDict) {
      const pat = pr.pattern.trim();
      if (!pat) continue;
      tracked = applyTrackedRegexPass(tracked, (s) => {
        const isWordLike = /^[\p{L}\p{N}_-]+$/u.test(pat);
        return findMatchesInText(s, {
          pattern: pat,
          replacement: pr.replacement,
          caseSensitive: Boolean(pr.caseSensitive),
          wholeWord: isWordLike,
          preserveCase: false,
          isRegex: false,
        }).map((m) => ({ start: m.start, end: m.end, replaced: m.replaced }));
      });
    }
  }

  // 4. Skip extra quotes/symbols if enabled
  if (options.skipSymbolsAndQuotes) {
    tracked = applyTrackedRegexPass(tracked, (s) => {
      const hits: Array<{ start: number; end: number; replaced: string }> = [];
      const symRe = /["“”‘’«»`*#_~^|<>\\\/]+/g;
      let m: RegExpExecArray | null;
      while ((m = symRe.exec(s)) !== null) {
        hits.push({ start: m.index, end: m.index + m[0].length, replaced: ' ' });
      }
      return hits;
    });
  }

  // 5. Collapse whitespace runs & trim ends while keeping origin tracking exact
  const collapsed: TrackedCharOrigin[] = [];
  let prevWasSpace = true;
  for (const item of tracked) {
    if (/\s/.test(item.char)) {
      if (!prevWasSpace) {
        collapsed.push({ char: ' ', origStart: item.origStart, origEnd: item.origEnd });
        prevWasSpace = true;
      }
    } else {
      collapsed.push(item);
      prevWasSpace = false;
    }
  }
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].char === ' ') {
    collapsed.pop();
  }

  const spokenText = collapsed.map((c) => c.char).join('');
  const offsetMap: SpokenOffsetSegment[] = [];

  for (let i = 0; i < collapsed.length; i++) {
    const item = collapsed[i];
    const last = offsetMap[offsetMap.length - 1];
    if (
      last &&
      last.spokenEnd === i &&
      last.origEnd === item.origStart &&
      last.origEnd - last.origStart === last.spokenEnd - last.spokenStart &&
      item.origEnd - item.origStart === 1
    ) {
      // Extend contiguous 1:1 run
      last.spokenEnd = i + 1;
      last.origEnd = item.origEnd;
    } else if (
      last &&
      last.spokenEnd === i &&
      last.origStart === item.origStart &&
      last.origEnd === item.origEnd
    ) {
      // Extend same replaced span
      last.spokenEnd = i + 1;
    } else {
      offsetMap.push({
        spokenStart: i,
        spokenEnd: i + 1,
        origStart: item.origStart,
        origEnd: item.origEnd,
      });
    }
  }

  return { spokenText, offsetMap };
}

/**
 * Maps a character index in the spoken utterance back to the corresponding
 * UTF-16 offset in the original pre-TTS-transform string.
 */
export function mapSpokenOffsetToOriginal(
  spokenOffset: number,
  offsetMap?: SpokenOffsetSegment[]
): number {
  if (!offsetMap || offsetMap.length === 0) return Math.max(0, spokenOffset);
  if (spokenOffset <= 0) return offsetMap[0].origStart;

  for (const seg of offsetMap) {
    if (spokenOffset >= seg.spokenStart && spokenOffset < seg.spokenEnd) {
      const spokenLen = seg.spokenEnd - seg.spokenStart;
      const origLen = seg.origEnd - seg.origStart;
      if (spokenLen === origLen) {
        return seg.origStart + (spokenOffset - seg.spokenStart);
      }
      // Replaced text: anchor to start of the original replaced word/phrase
      return seg.origStart;
    }
  }

  const last = offsetMap[offsetMap.length - 1];
  return last.origEnd;
}

export interface PreviewMatchItem {
  key: string;
  chapterIndex: number;
  chapterTitle: string;
  paragraphIndex: number;
  startChar: number;
  beforeSnippet: string;
  afterSnippet: string;
  matched: string;
  replaced: string;
  skippedReason?: string;
}

export interface ChapterParagraphInput {
  chapterIndex: number;
  chapterTitle: string;
  paragraphs: Array<{
    paragraphIndex: number;
    text: string;
    chapterStartChar: number;
  }>;
}

/**
 * Scans candidate matches across chapters for a draft rule so the user can
 * inspect live occurrence counts and selectively exclude individual hits.
 */
export function scanPreviewMatches(
  chapters: ChapterParagraphInput[],
  draftRule: Omit<TextReplaceRule, 'id' | 'priority' | 'enabled' | 'createdAt' | 'updatedAt'>,
  maxPreviewItems = 150
): {
  totalMatches: number;
  skippedCount: number;
  items: PreviewMatchItem[];
} {
  let totalMatches = 0;
  let skippedCount = 0;
  const items: PreviewMatchItem[] = [];

  for (const chap of chapters) {
    if (
      (draftRule.scope === 'onlyThis' || draftRule.scope === 'chapter') &&
      chap.chapterIndex !== draftRule.targetChapterIndex
    ) {
      continue;
    }
    if (
      draftRule.scope === 'fromHereToEnd' &&
      chap.chapterIndex < (draftRule.targetChapterIndex ?? 0)
    ) {
      continue;
    }

    for (const para of chap.paragraphs) {
      if (
        draftRule.scope === 'onlyThis' &&
        draftRule.targetParagraphIndex !== undefined &&
        para.paragraphIndex !== draftRule.targetParagraphIndex
      ) {
        continue;
      }

      let hits = findMatchesInText(para.text, draftRule);
      if (hits.length === 0) continue;

      if (draftRule.scope === 'onlyThis') {
        const targetOff = draftRule.targetCharOffset ?? 0;
        let best: TextMatchResult | null = null;
        let bestDist = Infinity;
        for (const h of hits) {
          const dist = Math.abs(para.chapterStartChar + h.start - targetOff);
          if (dist < bestDist) {
            bestDist = dist;
            best = h;
          }
        }
        hits = best ? [best] : [];
      } else if (
        draftRule.scope === 'fromHereToEnd' &&
        chap.chapterIndex === (draftRule.targetChapterIndex ?? 0)
      ) {
        const minOff = draftRule.targetCharOffset ?? 0;
        hits = hits.filter((h) => para.chapterStartChar + h.end > minOff);
      }

      for (const h of hits) {
        totalMatches += 1;
        if (items.length < maxPreviewItems) {
          const snipStart = Math.max(0, h.start - 28);
          const snipEnd = Math.min(para.text.length, h.end + 28);
          const prefix = snipStart > 0 ? '…' : '';
          const suffix = snipEnd < para.text.length ? '…' : '';
          const beforeCore = para.text.slice(snipStart, snipEnd);
          const afterCore =
            para.text.slice(snipStart, h.start) +
            h.replaced +
            para.text.slice(h.end, snipEnd);

          items.push({
            key: makeMatchExclusionKey(chap.chapterIndex, para.paragraphIndex, h.start),
            chapterIndex: chap.chapterIndex,
            chapterTitle: chap.chapterTitle,
            paragraphIndex: para.paragraphIndex,
            startChar: h.start,
            beforeSnippet: `${prefix}${beforeCore}${suffix}`,
            afterSnippet: `${prefix}${afterCore}${suffix}`,
            matched: h.matched,
            replaced: h.replaced,
          });
        }
      }
    }
  }

  return { totalMatches, skippedCount, items };
}

/**
 * Applies active non-TTS rules in memory to pre-extracted raw chapters
 * so Find & Replace preview and Manage Rules match counts stay exact and instant.
 */
export function buildEffectiveChaptersForPreview(
  rawChapters: ChapterParagraphInput[],
  rules: TextReplaceRule[],
  bookCtx: BookReplaceContext,
  options?: {
    excludeRuleId?: string;
    onlyRulesBeforeRule?: TextReplaceRule;
  }
): ChapterParagraphInput[] {
  const precedingRules = rules.filter((r) => {
    if (!r.enabled || r.ttsOnly) return false;
    if (options?.excludeRuleId && r.id === options.excludeRuleId) return false;
    if (options?.onlyRulesBeforeRule) {
      const target = options.onlyRulesBeforeRule;
      if (target.ttsOnly) return true;
      const sa = SCOPE_PRIORITY_ORDER[r.scope] ?? 99;
      const st = SCOPE_PRIORITY_ORDER[target.scope] ?? 99;
      if (sa !== st) return sa < st;
      if (r.priority !== target.priority) return r.priority < target.priority;
      return r.createdAt < target.createdAt;
    }
    return true;
  });

  if (precedingRules.length === 0) return rawChapters;

  return rawChapters.map((chap) => {
    let cursor = 0;
    const paragraphs = chap.paragraphs
      .map((para) => {
        const res = applyTextReplaceRulesToParagraph({
          text: para.text,
          chapterIndex: chap.chapterIndex,
          paragraphIndex: para.paragraphIndex,
          paragraphChapterStartChar: para.chapterStartChar,
          rules: precedingRules,
          bookCtx,
          ttsOnly: false,
        });
        const nextStart = cursor;
        if (res.text.trim()) {
          cursor += res.text.length + 2;
        }
        return {
          paragraphIndex: para.paragraphIndex,
          text: res.text,
          chapterStartChar: nextStart,
        };
      })
      .filter((p) => p.text.trim().length > 0);

    return {
      chapterIndex: chap.chapterIndex,
      chapterTitle: chap.chapterTitle,
      paragraphs,
    };
  });
}
