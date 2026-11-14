import assert from 'node:assert/strict';
import test from 'node:test';
import type { TextReplaceRule } from '../types/reader';
import {
  applyTextReplaceRulesToParagraph,
  buildEffectiveChaptersForPreview,
  buildTtsSpokenTransform,
  findMatchesInText,
  mapSpokenOffsetToOriginal,
  scanPreviewMatches,
  validateReplacePattern,
} from './textReplace';

function makeRule(partial: Partial<TextReplaceRule>): TextReplaceRule {
  return {
    id: partial.id || 'rule_1',
    pattern: partial.pattern ?? 'slave',
    replacement: partial.replacement ?? 'Budak',
    caseSensitive: partial.caseSensitive ?? false,
    wholeWord: partial.wholeWord ?? true,
    preserveCase: partial.preserveCase ?? false,
    isRegex: partial.isRegex ?? false,
    ttsOnly: partial.ttsOnly ?? false,
    scope: partial.scope ?? 'book',
    bookId: partial.bookId ?? 'book_1',
    bookSha1: partial.bookSha1,
    seriesKey: partial.seriesKey,
    targetChapterIndex: partial.targetChapterIndex,
    targetParagraphIndex: partial.targetParagraphIndex,
    targetCharOffset: partial.targetCharOffset,
    excludedMatchKeys: partial.excludedMatchKeys,
    priority: partial.priority ?? 1,
    enabled: partial.enabled ?? true,
    createdAt: partial.createdAt ?? 1000,
    updatedAt: partial.updatedAt ?? 1000,
  };
}

test('Unicode whole-word matching leaves slavery untouched and respects accented letters', () => {
  const sample = 'The slave endured slavery, unlike résumé and resumé.';
  const rule = makeRule({ pattern: 'slave', replacement: 'Budak', wholeWord: true });
  const matches = findMatchesInText(sample, rule);

  assert.equal(matches.length, 1);
  assert.equal(matches[0].matched, 'slave');

  const accentedMatches = findMatchesInText('Minum café di cafetaria', {
    pattern: 'caf',
    replacement: 'kopi',
    caseSensitive: false,
    wholeWord: true,
    preserveCase: false,
    isRegex: false,
  });
  assert.equal(accentedMatches.length, 0, 'caf must not match inside café or cafetaria');

  const exactAccented = findMatchesInText('Minum café di pagi hari.', {
    pattern: 'café',
    replacement: 'kedai',
    caseSensitive: false,
    wholeWord: true,
    preserveCase: false,
    isRegex: false,
  });
  assert.equal(exactAccented.length, 1);
});

test('Case sensitive and preserveCase work cleanly on slave / Slave / SLAVE', () => {
  const text = 'Slave, slave, dan SLAVE.';
  const preserveRes = applyTextReplaceRulesToParagraph({
    text,
    chapterIndex: 0,
    paragraphIndex: 0,
    paragraphChapterStartChar: 0,
    rules: [
      makeRule({
        pattern: 'slave',
        replacement: 'budak',
        caseSensitive: false,
        wholeWord: true,
        preserveCase: true,
      }),
    ],
    bookCtx: { bookId: 'book_1' },
  });
  assert.equal(preserveRes.text, 'Budak, budak, dan BUDAK.');

  const sensitiveRes = applyTextReplaceRulesToParagraph({
    text,
    chapterIndex: 0,
    paragraphIndex: 0,
    paragraphChapterStartChar: 0,
    rules: [
      makeRule({
        pattern: 'Slave',
        replacement: 'Hamba',
        caseSensitive: true,
        wholeWord: true,
        preserveCase: false,
      }),
    ],
    bookCtx: { bookId: 'book_1' },
  });
  assert.equal(sensitiveRes.text, 'Hamba, slave, dan SLAVE.');
});

test('Regex capture groups $1/$2 work and invalid or ReDoS patterns are rejected', () => {
  const text = 'Bab 12: Awal Perjalanan';
  const res = applyTextReplaceRulesToParagraph({
    text,
    chapterIndex: 0,
    paragraphIndex: 0,
    paragraphChapterStartChar: 0,
    rules: [
      makeRule({
        pattern: 'Bab (\\d+):\\s*(.+)',
        replacement: 'Bagian $1 — $2',
        isRegex: true,
        wholeWord: false,
      }),
    ],
    bookCtx: { bookId: 'book_1' },
  });
  assert.equal(res.text, 'Bagian 12 — Awal Perjalanan');

  const invalid = validateReplacePattern('[abc', true);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.error?.includes('tidak valid'));

  const redos = validateReplacePattern('(a+)+', true);
  assert.equal(redos.valid, false);
  assert.ok(redos.error?.includes('loop'));

  const emptyMatch = validateReplacePattern('a*', true);
  assert.equal(emptyMatch.valid, false);
});

test('Scope precedence applies more specific rule first without infinite looping', () => {
  const res = applyTextReplaceRulesToParagraph({
    text: 'Lord Arthur menemui Lord Arthur lainnya.',
    chapterIndex: 2,
    paragraphIndex: 0,
    paragraphChapterStartChar: 100,
    rules: [
      makeRule({
        id: 'book_rule',
        pattern: 'Arthur',
        replacement: 'Artur',
        scope: 'book',
        wholeWord: true,
      }),
      makeRule({
        id: 'only_this_rule',
        pattern: 'Arthur',
        replacement: 'Baginda',
        scope: 'onlyThis',
        wholeWord: true,
        targetChapterIndex: 2,
        targetParagraphIndex: 0,
        targetCharOffset: 105,
      }),
    ],
    bookCtx: { bookId: 'book_1' },
  });
  assert.equal(res.text, 'Lord Baginda menemui Lord Artur lainnya.');
});

test('Inline formatting spans remap accurately when text length changes', () => {
  const res = applyTextReplaceRulesToParagraph({
    text: 'Dia berkata, "Halo slave tua!" sambil pergi.',
    inlineFormats: [{ start: 13, end: 30, italic: true }],
    chapterIndex: 0,
    paragraphIndex: 0,
    paragraphChapterStartChar: 0,
    rules: [
      makeRule({
        pattern: 'slave',
        replacement: 'tawanan',
        wholeWord: true,
      }),
    ],
    bookCtx: { bookId: 'book_1' },
  });

  assert.equal(res.text, 'Dia berkata, "Halo tawanan tua!" sambil pergi.');
  assert.ok(res.inlineFormats && res.inlineFormats.length === 1);
  assert.equal(
    res.text.slice(res.inlineFormats[0].start, res.inlineFormats[0].end),
    '"Halo tawanan tua!"'
  );
});

test('TTS-only transform preserves exact spoken-to-original offset map with zero drift', () => {
  const orig = 'Sistem TTS ini sangat membantu Dr. Nara.';
  const ttsRule = makeRule({
    pattern: 'TTS',
    replacement: 'Teks ke Suara',
    ttsOnly: true,
    caseSensitive: true,
    wholeWord: true,
  });

  const { spokenText, offsetMap } = buildTtsSpokenTransform(orig, {
    ttsOnlyRules: [ttsRule],
    pronunciationDict: [{ id: 'p1', pattern: 'Dr.', replacement: 'Dokter' }],
    chapterIndex: 0,
    bookCtx: { bookId: 'book_1' },
  });

  assert.equal(spokenText, 'Sistem Teks ke Suara ini sangat membantu Dokter Nara.');

  const idxInsideSpokenTts = spokenText.indexOf('Suara');
  assert.equal(
    mapSpokenOffsetToOriginal(idxInsideSpokenTts, offsetMap),
    orig.indexOf('TTS')
  );

  const idxNaraSpoken = spokenText.indexOf('Nara');
  assert.equal(
    mapSpokenOffsetToOriginal(idxNaraSpoken, offsetMap),
    orig.indexOf('Nara')
  );
});

test('scanPreviewMatches counts occurrences and skips chapters outside fromHereToEnd', () => {
  const preview = scanPreviewMatches(
    [
      {
        chapterIndex: 0,
        chapterTitle: 'Bab 1',
        paragraphs: [{ paragraphIndex: 0, text: 'slave pertama', chapterStartChar: 0 }],
      },
      {
        chapterIndex: 1,
        chapterTitle: 'Bab 2',
        paragraphs: [{ paragraphIndex: 0, text: 'slave kedua dan slave ketiga', chapterStartChar: 0 }],
      },
    ],
    {
      pattern: 'slave',
      replacement: 'Budak',
      caseSensitive: false,
      wholeWord: true,
      preserveCase: false,
      isRegex: false,
      ttsOnly: false,
      scope: 'fromHereToEnd',
      bookId: 'book_1',
      targetChapterIndex: 1,
      targetCharOffset: 10,
    }
  );
  assert.equal(preview.totalMatches, 1);
  assert.equal(preview.items[0].chapterIndex, 1);
});

test('buildEffectiveChaptersForPreview preserves accurate match counts for active rules in Manage Rules', () => {
  const rawChapters = [
    {
      chapterIndex: 0,
      chapterTitle: 'Bab 1',
      paragraphs: [
        { paragraphIndex: 0, text: 'The slave and another slave met TTS.', chapterStartChar: 0 },
      ],
    },
  ];
  const rule1 = makeRule({ id: 'r1', pattern: 'slave', replacement: 'budak', priority: 1 });
  const rule2 = makeRule({
    id: 'r2',
    pattern: 'TTS',
    replacement: 'Teks ke Suara',
    ttsOnly: true,
    priority: 2,
  });

  // For rule1 itself (no earlier rules), scanning effective chapters yields original 2 matches
  const effForRule1 = buildEffectiveChaptersForPreview(rawChapters, [rule1, rule2], { bookId: 'book_1' }, {
    excludeRuleId: rule1.id,
    onlyRulesBeforeRule: rule1,
  });
  assert.equal(scanPreviewMatches(effForRule1, rule1, 1).totalMatches, 2);

  // For a new rule after rule1, 'slave' has already become 'budak'
  const effForNewRule = buildEffectiveChaptersForPreview(rawChapters, [rule1, rule2], { bookId: 'book_1' });
  assert.equal(scanPreviewMatches(effForNewRule, rule1, 1).totalMatches, 0);

  // For TTS rule2, non-TTS rule1 is applied first, TTS matches cleanly
  const effForTts = buildEffectiveChaptersForPreview(rawChapters, [rule1, rule2], { bookId: 'book_1' }, {
    excludeRuleId: rule2.id,
    onlyRulesBeforeRule: rule2,
  });
  assert.equal(scanPreviewMatches(effForTts, rule2, 1).totalMatches, 1);
});
