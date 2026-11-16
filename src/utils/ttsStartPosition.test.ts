import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRenderedChapterModel } from './renderedTranslation';
import { segmentParagraphs } from './textSegmentation';
import {
  buildTtsLastPositionSnapshot,
  findTopmostVisibleParagraphIndex,
  resolveStartFromViewportTarget,
  resolveTtsResumeTarget,
} from './ttsStartPosition';

function makeSampleChapter() {
  return segmentParagraphs(
    [
      { tag: 'h1', text: 'Chapter One' },
      { tag: 'p', text: 'Rain fell softly. The street was empty.' },
      { tag: 'p', text: 'Julian opened the heavy wooden door.' },
      { tag: 'p', text: 'Inside the hall, candles flickered. He paused to listen.' },
    ],
    'en'
  );
}

test('findTopmostVisibleParagraphIndex returns first meaningfully visible paragraph below sticky header', () => {
  const rects = [
    { paragraphIndex: 0, top: -220, bottom: -40 },
    // Scrolled past except 8px sliver peeking under header at y=108
    { paragraphIndex: 1, top: -30, bottom: 116 },
    // Topmost meaningfully visible paragraph
    { paragraphIndex: 2, top: 130, bottom: 260 },
    { paragraphIndex: 3, top: 274, bottom: 420 },
  ];

  assert.equal(findTopmostVisibleParagraphIndex(rects, 108, 844), 2);
});

test('findTopmostVisibleParagraphIndex uses scrolled-to paragraph when user scrolls down before pressing Play', () => {
  const rects = [
    { paragraphIndex: 0, top: -480, bottom: -410 },
    { paragraphIndex: 1, top: -390, bottom: -210 },
    { paragraphIndex: 2, top: -190, bottom: -40 },
    { paragraphIndex: 3, top: 96, bottom: 320 },
  ];

  assert.equal(findTopmostVisibleParagraphIndex(rects, 108, 844), 3);
  // Large paragraph starting just slightly above header still dominates top of viewport
  assert.equal(
    findTopmostVisibleParagraphIndex(
      [
        { paragraphIndex: 2, top: 60, bottom: 220 },
        { paragraphIndex: 3, top: 234, bottom: 390 },
      ],
      108,
      844
    ),
    2
  );
});

test('resolveStartFromViewportTarget resolves first sentence of topmost paragraph in original and translated text', () => {
  const { paragraphs, allSentences } = makeSampleChapter();

  const origStart = resolveStartFromViewportTarget(2, paragraphs, allSentences);
  assert.equal(origStart.paragraphIndex, 2);
  assert.equal(allSentences[origStart.sentenceIndex].text, 'Julian opened the heavy wooden door.');

  const translatedModel = buildRenderedChapterModel(paragraphs, allSentences, {
    translateEnabled: true,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: (p) =>
      p.index === 2 ? 'Julian membuka pintu kayu yang berat itu.' : null,
  });

  const transStart = resolveStartFromViewportTarget(
    2,
    translatedModel.paragraphs,
    translatedModel.allSentences
  );
  assert.equal(transStart.paragraphIndex, 2);
  assert.equal(
    translatedModel.allSentences[transStart.sentenceIndex].text,
    'Julian membuka pintu kayu yang berat itu.'
  );
});

test('buildTtsLastPositionSnapshot and resolveTtsResumeTarget preserve exact paused spot across toggles and page changes', () => {
  const { paragraphs, allSentences } = makeSampleChapter();
  // Sentence 5 = "He paused to listen." (paragraph 3, sentenceInParagraph 1)
  const targetSent = allSentences[5];
  assert.equal(targetSent.paragraphIndex, 3);
  assert.equal(targetSent.text, 'He paused to listen.');

  const snapshot = buildTtsLastPositionSnapshot({
    bookId: 'book-1',
    chapterIndex: 0,
    chapterTitle: 'Bab 1',
    activeSentenceIndex: targetSent.globalIndex,
    activeWordIndex: 2,
    renderedParagraphs: paragraphs,
    renderedSentences: allSentences,
    originalParagraphs: paragraphs,
    updatedAt: 123456,
  });

  assert.ok(snapshot);
  assert.equal(snapshot.chapterIndex, 0);
  assert.equal(snapshot.paragraphIndex, 3);
  assert.equal(snapshot.sentenceInParagraph, 1);
  assert.equal(snapshot.paragraphSentenceCount, 2);

  // Resume on translated text even if user toggled translation ON after pausing
  const translatedModel = buildRenderedChapterModel(paragraphs, allSentences, {
    translateEnabled: true,
    targetLanguage: 'id',
    bookLocale: 'en',
    getTranslatedText: (p) =>
      p.index === 3 ? 'Di dalam aula, lilin berkedip. Ia berhenti untuk mendengarkan.' : p.rawText,
  });

  const resumedTranslated = resolveTtsResumeTarget(
    snapshot,
    translatedModel.paragraphs,
    translatedModel.allSentences
  );
  assert.equal(resumedTranslated.paragraphIndex, 3);
  assert.equal(
    translatedModel.allSentences[resumedTranslated.sentenceIndex].text,
    'Ia berhenti untuk mendengarkan.'
  );

  // Resume back on original text restores exact original sentence
  const resumedOriginal = resolveTtsResumeTarget(snapshot, paragraphs, allSentences);
  assert.equal(resumedOriginal.paragraphIndex, 3);
  assert.equal(allSentences[resumedOriginal.sentenceIndex].text, 'He paused to listen.');
});
