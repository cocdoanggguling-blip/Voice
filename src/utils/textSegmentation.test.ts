import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectLikelySourceLanguage,
  estimateWordDurationMs,
  findWordIndexAtCharOffset,
  segmentParagraphs,
  splitIntoSentences,
  splitSentenceIntoCommaChunks,
  tokenizeWords,
} from './textSegmentation';

test('splitIntoSentences respects abbreviations, decimals, and closing quotes', () => {
  const text =
    'Dr. Aris membaca halaman 3.14 dengan tenang. "Apakah kapal sudah berlabuh?" tanya Nara! Ya, mereka tiba pukul 18.00.';
  const sentences = splitIntoSentences(text);

  assert.equal(sentences.length, 3);
  assert.equal(sentences[0], 'Dr. Aris membaca halaman 3.14 dengan tenang.');
  assert.equal(sentences[1], '"Apakah kapal sudah berlabuh?" tanya Nara!');
  assert.equal(sentences[2], 'Ya, mereka tiba pukul 18.00.');
});

test('splitSentenceIntoCommaChunks splits commas with natural pause and exact char offsets', () => {
  const sentence = 'Di dermaga tua, angin berhembus pelan; lampu mercusuar menyala.';
  const chunks = splitSentenceIntoCommaChunks(sentence, 200);

  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].text, 'Di dermaga tua,');
  assert.equal(chunks[0].pauseAfterMs, 200);
  assert.equal(
    sentence.slice(chunks[0].startCharOffset, chunks[0].endCharOffset),
    'Di dermaga tua,'
  );

  assert.equal(chunks[1].text, 'angin berhembus pelan;');
  assert.equal(chunks[1].pauseAfterMs, 200);
  assert.equal(
    sentence.slice(chunks[1].startCharOffset, chunks[1].endCharOffset),
    'angin berhembus pelan;'
  );

  assert.equal(chunks[2].text, 'lampu mercusuar menyala.');
  assert.equal(chunks[2].pauseAfterMs, 0);
  assert.equal(
    sentence.slice(chunks[2].startCharOffset, chunks[2].endCharOffset),
    'lampu mercusuar menyala.'
  );
});

test('splitSentenceIntoCommaChunks supports resuming mid-sentence by word index', () => {
  const sentence = 'Pagi itu cerah, burung bernyanyi, dan ombak tenang.';
  const words = tokenizeWords(sentence);
  // Resume from word index 3 ("burung")
  const chunks = splitSentenceIntoCommaChunks(sentence, 180, 3);

  assert.equal(words[3].text, 'burung');
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].text, 'burung bernyanyi,');
  assert.equal(
    sentence.slice(chunks[0].startCharOffset, chunks[0].endCharOffset),
    'burung bernyanyi,'
  );
  assert.equal(findWordIndexAtCharOffset(words, chunks[0].startCharOffset), 3);
});

test('findWordIndexAtCharOffset maps boundary events back to exact word tokens', () => {
  const sentence = 'Gelombang senja menyentuh lambung perahu.';
  const words = tokenizeWords(sentence);

  assert.equal(findWordIndexAtCharOffset(words, 0), 0); // Gelombang
  assert.equal(findWordIndexAtCharOffset(words, 10), 1); // senja
  assert.equal(findWordIndexAtCharOffset(words, 16), 2); // menyentuh
  assert.equal(findWordIndexAtCharOffset(words, 999), 4); // clamped last word
});

test('segmentParagraphs preserves global sentence indexing across paragraphs', () => {
  const { paragraphs, allSentences } = segmentParagraphs([
    { tag: 'h2', text: 'Bab Pertama.' },
    { tag: 'p', text: 'Kalimat satu. Kalimat dua!' },
  ]);

  assert.equal(paragraphs.length, 2);
  assert.equal(allSentences.length, 3);
  assert.equal(allSentences[0].globalIndex, 0);
  assert.equal(allSentences[1].globalIndex, 1);
  assert.equal(allSentences[2].globalIndex, 2);
  assert.equal(allSentences[2].paragraphIndex, 1);
});

test('estimateWordDurationMs scales inversely with speech rate', () => {
  const normal = estimateWordDurationMs('pelabuhan,', 1.0);
  const fast = estimateWordDurationMs('pelabuhan,', 2.0);
  assert.ok(normal > fast);
});

test('detectLikelySourceLanguage identifies Indonesian vs English accurately', () => {
  assert.equal(
    detectLikelySourceLanguage('Angin laut berhembus dengan lembut di dermaga ini.', 'en'),
    'id'
  );
  assert.equal(
    detectLikelySourceLanguage('The old lighthouse stood against the evening tide.', 'id'),
    'en'
  );
});
