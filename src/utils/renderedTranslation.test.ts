import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildParagraphTranslationSlotKey,
  buildRenderedChapterModel,
  mapRenderedOffsetToOriginalOffset,
  mapSentenceCursorAcrossRender,
} from './renderedTranslation';
import { buildSpeechChunksFromOffset, segmentParagraphs } from './textSegmentation';

function makeSampleChapter() {
  return segmentParagraphs(
    [
      { tag: 'h1', text: 'Chapter 1: The Glass Conservatory' },
      {
        tag: 'p',
        text: 'Rain tapped gently against the tall glass panes. Julian studied the old map.',
      },
      {
        tag: 'blockquote',
        text: '"Every city keeps hidden rivers," murmured Elena.',
        inlineFormats: [{ start: 0, end: 50, italic: true }],
      },
    ],
    'en'
  );
}

test('buildRenderedChapterModel returns original paragraphs unmodified when translation is OFF', () => {
  const orig = makeSampleChapter();
  const model = buildRenderedChapterModel(orig.paragraphs, orig.allSentences, {
    translateEnabled: false,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: () => 'Seharusnya tidak tampil',
  });

  assert.equal(model.paragraphs, orig.paragraphs);
  assert.equal(model.allSentences, orig.allSentences);
  assert.deepEqual(model.translatedParagraphFlags, [false, false, false]);
  assert.equal(model.renderedLocale, 'en');
});

test('Readest-style ON replaces original text in place, falls back cleanly when pending, and restores 100% when OFF', () => {
  const orig = makeSampleChapter();
  const originalSnapshot = orig.paragraphs.map((p) => p.rawText);

  const translations: Record<string, string> = {
    'p-0': 'Bab 1: Rumah Kaca',
    'p-1': 'Hujan mengetuk kaca tinggi itu dengan lembut. Julian mempelajari peta tua tersebut.',
    // p-2 intentionally missing to test original fallback
  };

  const onModel = buildRenderedChapterModel(orig.paragraphs, orig.allSentences, {
    translateEnabled: true,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: (para) => translations[para.id] ?? null,
  });

  // Paragraph count & structure preserved without duplication
  assert.equal(onModel.paragraphs.length, 3);
  assert.equal(onModel.paragraphs[0].tag, 'h1');
  assert.equal(onModel.paragraphs[0].rawText, 'Bab 1: Rumah Kaca');
  assert.equal(onModel.paragraphs[1].tag, 'p');
  assert.equal(
    onModel.paragraphs[1].rawText,
    'Hujan mengetuk kaca tinggi itu dengan lembut. Julian mempelajari peta tua tersebut.'
  );
  assert.ok(!onModel.paragraphs[1].rawText.includes('Rain tapped'));
  // Pending paragraph falls back to original text cleanly
  assert.equal(onModel.paragraphs[2].rawText, '"Every city keeps hidden rivers," murmured Elena.');
  assert.deepEqual(onModel.translatedParagraphFlags, [true, true, false]);
  assert.equal(onModel.renderedLocale, 'id');

  // Original data stays untouched (source of truth)
  assert.deepEqual(
    orig.paragraphs.map((p) => p.rawText),
    originalSnapshot
  );

  // Turning OFF restores exact original text
  const offModel = buildRenderedChapterModel(orig.paragraphs, orig.allSentences, {
    translateEnabled: false,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: (para) => translations[para.id] ?? null,
  });
  assert.deepEqual(
    offModel.paragraphs.map((p) => p.rawText),
    originalSnapshot
  );
});

test('TTS queue built from renderedModel reads ONLY translated text when ON (with fallback) and ONLY original when OFF', () => {
  const orig = makeSampleChapter();
  const translations: Record<string, string> = {
    'p-0': 'Bab Satu: Taman Kaca',
    'p-1': 'Hujan turun perlahan di kaca taman. Julian membuka peta tua.',
  };

  const renderedOn = buildRenderedChapterModel(orig.paragraphs, orig.allSentences, {
    translateEnabled: true,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: (p) => translations[p.id] ?? null,
  });

  const chunksOn = buildSpeechChunksFromOffset(renderedOn.paragraphs, 0, {
    readingMode: 'flowing',
    chunkSizeChars: 800,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
    readChapterTitle: true,
  });

  const spokenJoinedOn = chunksOn.map((c) => c.speakText).join(' ');
  assert.ok(spokenJoinedOn.includes('Bab Satu: Taman Kaca'));
  assert.ok(spokenJoinedOn.includes('Hujan turun perlahan di kaca taman.'));
  // Must NOT speak original English for translated paragraphs!
  assert.equal(spokenJoinedOn.includes('Rain tapped gently'), false);
  assert.equal(spokenJoinedOn.includes('Chapter 1'), false);
  // Untranslated p-2 must fall back to original text
  assert.ok(spokenJoinedOn.includes('Every city keeps hidden rivers'));

  // Switch back OFF -> TTS reverts to original English
  const renderedOff = buildRenderedChapterModel(orig.paragraphs, orig.allSentences, {
    translateEnabled: false,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: (p) => translations[p.id] ?? null,
  });
  const chunksOff = buildSpeechChunksFromOffset(renderedOff.paragraphs, 0, {
    readingMode: 'flowing',
    chunkSizeChars: 800,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
    readChapterTitle: true,
  });
  const spokenJoinedOff = chunksOff.map((c) => c.speakText).join(' ');
  assert.ok(spokenJoinedOff.includes('Rain tapped gently'));
  assert.equal(spokenJoinedOff.includes('Hujan turun perlahan'), false);
});

test('mapSentenceCursorAcrossRender preserves active paragraph & relative sentence position across toggles', () => {
  const orig = makeSampleChapter();
  const translated = buildRenderedChapterModel(orig.paragraphs, orig.allSentences, {
    translateEnabled: true,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: (p) =>
      p.id === 'p-0'
        ? 'Bab Satu'
        : p.id === 'p-1'
          ? 'Hujan mengetuk kaca tinggi. Julian membuka peta tua.'
          : '"Setiap kota menyimpan sungai tersembunyi," bisik Elena.',
  });

  // User is on second sentence of p-1 in original English ("Julian studied the old map.", globalIndex 2)
  const mappedToId = mapSentenceCursorAcrossRender(
    orig.allSentences,
    2,
    translated.paragraphs,
    translated.allSentences
  );
  assert.equal(mappedToId.paragraphIndex, 1);
  assert.equal(translated.allSentences[mappedToId.sentenceIndex].text, 'Julian membuka peta tua.');

  // And mapping back to original offset resolves cleanly to original paragraph 1
  const origOffset = mapRenderedOffsetToOriginalOffset(
    translated.allSentences,
    mappedToId.sentenceIndex,
    orig.paragraphs
  );
  assert.equal(origOffset, orig.paragraphs[1].chapterStartChar);
});

test('buildParagraphTranslationSlotKey isolates chapters, languages, providers, and Gemini models', () => {
  const k1 = buildParagraphTranslationSlotKey(0, 'p-1', 'Hello', 'id', 'gemini', 'gemini-flash-latest');
  const k2 = buildParagraphTranslationSlotKey(1, 'p-1', 'Hello', 'id', 'gemini', 'gemini-flash-latest');
  const k3 = buildParagraphTranslationSlotKey(0, 'p-1', 'Hello', 'ja', 'gemini', 'gemini-flash-latest');
  const k4 = buildParagraphTranslationSlotKey(0, 'p-1', 'Hello', 'id', 'gemini', 'gemini-4-argon');
  assert.equal(new Set([k1, k2, k3, k4]).size, 4);
});
