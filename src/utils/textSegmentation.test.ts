import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOptionalSsml,
  buildSpeechChunksFromOffset,
  detectLikelySourceLanguage,
  estimateChunkDurationMs,
  findLocationAtChapterOffset,
  findSentenceStartForOffset,
  mapChunkLocalOffsetToChapterOffset,
  normalizeBookLocale,
  preprocessSpeechText,
  segmentParagraphs,
  splitIntoSentences,
} from './textSegmentation';

test('splitIntoSentences protects Tn., Dr., decimals (3.5), ellipses (…), and dialog quotes', () => {
  const text =
    'Tn. Bima dan Dr. Sari mengukur suhu 3.5 derajat… lalu berjalan pelan. "Apakah kapal sudah tiba?" tanya Nara! Mereka menunggu di dermaga.';
  const sentences = splitIntoSentences(text, 'id');

  assert.equal(sentences.length, 3);
  assert.equal(sentences[0], 'Tn. Bima dan Dr. Sari mengukur suhu 3.5 derajat… lalu berjalan pelan.');
  assert.equal(sentences[1], '"Apakah kapal sudah tiba?" tanya Nara!');
  assert.equal(sentences[2], 'Mereka menunggu di dermaga.');
});

test('flowing mode sends whole paragraphs without splitting at periods or commas', () => {
  const { paragraphs, allSentences } = segmentParagraphs([
    {
      tag: 'p',
      text: 'Kalimat pertama, dengan jeda koma, tetap utuh. Kalimat kedua menyusul langsung! Kalimat ketiga menutup paragraf ini.',
    },
  ]);

  const chunks = buildSpeechChunksFromOffset(paragraphs, 0, {
    readingMode: 'flowing',
    chunkSizeChars: 800,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
  });

  // 3 sentences inside 1 paragraph -> 1 single flowing speech chunk (0 inter-sentence gaps!)
  assert.equal(allSentences.length, 3);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, paragraphs[0].rawText);
  assert.equal(chunks[0].pauseAfterMs, 0); // Last chunk of chapter has no trailing pause
});

test('flowing mode merges very short dialog paragraphs (300-600 chars) and keeps longer paragraph pauses', () => {
  const { paragraphs } = segmentParagraphs([
    { tag: 'p', text: '"Sudah siap?" tanya Nara.' },
    { tag: 'p', text: '"Sebentar lagi, Nak," jawab penjaga dermaga.' },
    { tag: 'p', text: '"Angin timur mulai bertiup kencang malam ini."' },
    {
      tag: 'p',
      text: 'Kapal kayu itu pun perlahan meninggalkan dermaga batu, membelah ombak gelap menuju garis cakrawala yang samar di bawah cahaya bulan purnama. Para awak memeriksa tali layar dengan sigap sementara lentera badai bergoyang lembut di haluan kapal.',
    },
  ]);

  const chunks = buildSpeechChunksFromOffset(paragraphs, 0, {
    readingMode: 'flowing',
    chunkSizeChars: 800,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
  });

  // First 3 short dialog lines (< 300-480 chars combined) merge into 1 flowing unit!
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].slices.length, 3);
  assert.equal(chunks[0].pauseAfterMs, 300);
  assert.equal(chunks[1].slices.length, 1);
});

test('long paragraphs split ONLY at nearest sentence boundary before chunkSizeChars', () => {
  const s1 = 'Kalimat satu berisi deskripsi panjang tentang pelabuhan tua dan angin sore yang sejuk.';
  const s2 = 'Kalimat dua menceritakan suara ombak yang menghantam tiang dermaga kayu.';
  const s3 = 'Kalimat tiga menggambarkan cahaya mercusuar yang mulai menyala di kejauhan.';
  const { paragraphs } = segmentParagraphs([{ tag: 'p', text: `${s1} ${s2} ${s3}` }]);

  const chunks = buildSpeechChunksFromOffset(paragraphs, 0, {
    readingMode: 'flowing',
    chunkSizeChars: 300,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
  });

  // Total is ~236 chars <= 300 -> 1 chunk. Now test with smaller maxEngineInputLength of 170:
  const splitChunks = buildSpeechChunksFromOffset(paragraphs, 0, {
    readingMode: 'flowing',
    chunkSizeChars: 800,
    maxEngineInputLength: 170,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
  });

  assert.equal(splitChunks.length, 2);
  assert.equal(splitChunks[0].text, `${s1} ${s2}`);
  assert.equal(splitChunks[1].text, s3);
  assert.equal(chunks.length, 1);
});

test('character offset mapping derives exact active word and sentence across merged chunks', () => {
  const { paragraphs, allSentences } = segmentParagraphs([
    { tag: 'p', text: 'Angin laut berhembus pelan.' },
    { tag: 'p', text: 'Perahu kecil mulai berlayar menuju fajar.' },
  ]);

  const chunks = buildSpeechChunksFromOffset(paragraphs, 0, {
    readingMode: 'flowing',
    chunkSizeChars: 800,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
  });

  assert.equal(chunks.length, 1); // Merged short paragraphs
  const localIdx = chunks[0].text.indexOf('berlayar');
  const chapterOff = mapChunkLocalOffsetToChapterOffset(chunks[0], localIdx);
  const loc = findLocationAtChapterOffset(allSentences, chapterOff);

  assert.equal(loc.sentenceIndex, 1);
  assert.equal(loc.paragraphIndex, 1);
  assert.equal(allSentences[loc.sentenceIndex].words[loc.wordIndex].text, 'berlayar');
});

test('10x pause/resume and mid-playback speed change always rebuild queue from exact offset', () => {
  const { paragraphs, allSentences } = segmentParagraphs([
    {
      tag: 'p',
      text: 'Satu dua tiga empat lima. Enam tujuh delapan sembilan sepuluh. Sebelas dua belas tiga belas.',
    },
    {
      tag: 'p',
      text: 'Empat belas lima belas enam belas. Tujuh belas delapan belas.',
    },
  ]);

  const baseOpts = {
    readingMode: 'flowing' as const,
    chunkSizeChars: 800,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 0,
    sentencePauseMs: 0,
    ssmlSupported: false,
  };

  // Simulate 10 pause/resume points across the chapter
  const checkpoints = [0, 12, 27, 45, 65, 80, 96, 110, 125, 140];
  for (const cp of checkpoints) {
    const resumeOffset = findSentenceStartForOffset(allSentences, cp);
    const rebuilt = buildSpeechChunksFromOffset(paragraphs, resumeOffset, baseOpts);
    assert.ok(rebuilt.length >= 1);
    assert.equal(rebuilt[0].chapterStartChar, resumeOffset);
  }

  // Verify speed estimation scales accurately across 1x, 2x, 3x
  const dur1x = estimateChunkDurationMs(paragraphs[0].rawText, 1.0);
  const dur2x = estimateChunkDurationMs(paragraphs[0].rawText, 2.0);
  const dur3x = estimateChunkDurationMs(paragraphs[0].rawText, 3.0);
  assert.ok(dur1x > dur2x && dur2x > dur3x);
});

test('SSML break tags are injected ONLY when ssmlSupported is true', () => {
  const plain = 'Angin bertiup, ombak tenang. Matahari terbit.';
  const unsupported = buildOptionalSsml(plain, 200, 400, false);
  assert.equal(unsupported.isSsml, false);
  assert.equal(unsupported.speakText, plain);

  const supported = buildOptionalSsml(plain, 200, 400, true);
  assert.equal(supported.isSsml, true);
  assert.ok(supported.speakText.includes('<break time="200ms"/>'));
  assert.ok(supported.speakText.includes('<break time="400ms"/>'));
});

test('detectLikelySourceLanguage detects Indonesian vs English', () => {
  assert.equal(
    detectLikelySourceLanguage('Angin laut berhembus dengan lembut di dermaga ini.', 'en'),
    'id'
  );
  assert.equal(
    detectLikelySourceLanguage('The old lighthouse stood against the evening tide.', 'id'),
    'en'
  );
});

test('preprocessSpeechText applies pronunciation dict, skips parentheses, and strips symbols', () => {
  const raw = '“Kapal S.H. itu (lihat catatan 1) berlayar* cepat!”';
  const out = preprocessSpeechText(raw, {
    skipParentheses: true,
    skipSymbolsAndQuotes: true,
    pronunciationDict: [{ id: '1', pattern: 'S.H.', replacement: 'Sarjana Hukum' }],
  });
  assert.equal(out, 'Kapal Sarjana Hukum itu berlayar cepat!');
});

test('commaPauseMs splits comma clauses in sentence mode when SSML is unsupported while preserving chapter offsets', () => {
  const { paragraphs, allSentences } = segmentParagraphs([
    { tag: 'h1', text: 'Bab 1: Dermaga' },
    { tag: 'p', text: 'Angin pagi bertiup, ombak tenang; perahu pun melaju.' },
    { tag: 'p', text: '[1] Catatan kaki pelabuhan.', isFootnote: true },
  ]);

  const chunks = buildSpeechChunksFromOffset(paragraphs, 0, {
    readingMode: 'sentence',
    chunkSizeChars: 800,
    maxEngineInputLength: 3500,
    paragraphPauseMs: 300,
    commaPauseMs: 200,
    sentencePauseMs: 0,
    ssmlSupported: false,
    readChapterTitle: false,
    readFootnotes: false,
  });

  // Chapter title (h1) and footnote are skipped; single sentence splits into 3 comma segments
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].pauseAfterMs, 200);
  assert.equal(chunks[1].pauseAfterMs, 200);
  assert.equal(chunks[2].pauseAfterMs, 0);
  const loc = findLocationAtChapterOffset(allSentences, chunks[2].chapterStartChar);
  assert.equal(loc.sentenceIndex, 1);
});

test('normalizeBookLocale converts invalid or human-readable EPUB language tags like "bahasa Indonesia" safely', () => {
  assert.equal(normalizeBookLocale('bahasa Indonesia'), 'id');
  assert.equal(normalizeBookLocale('Bahasa Indonesia'), 'id');
  assert.equal(normalizeBookLocale('Indonesian'), 'id');
  assert.equal(normalizeBookLocale('ind'), 'id');
  assert.equal(normalizeBookLocale('in-ID'), 'id-ID');
  assert.equal(normalizeBookLocale('Bahasa Melayu'), 'ms');
  assert.equal(normalizeBookLocale('English'), 'en');
  assert.equal(normalizeBookLocale('en_US'), 'en-US');
  assert.equal(normalizeBookLocale('unknown-garbage-tag-999'), 'id');
  assert.equal(normalizeBookLocale(''), 'id');

  // Verify splitIntoSentences & segmentParagraphs never throw RangeError on 'bahasa Indonesia'
  const sentences = splitIntoSentences('Halo dunia. Ini bab kedua!', 'bahasa Indonesia');
  assert.equal(sentences.length, 2);
  const seg = segmentParagraphs([{ tag: 'p', text: 'Kalimat satu. Kalimat dua.' }], 'bahasa Indonesia');
  assert.equal(seg.allSentences.length, 2);
});

test('every character offset inside a period-to-period sentence resolves strictly to that whole sentence', () => {
  const { allSentences } = segmentParagraphs(
    [
      {
        tag: 'p',
        text: 'Tn. Bima berjalan menuju dermaga tua sebelum fajar tiba. Angin laut bertiup kencang membawa aroma garam. Kapal kayu segera melepas sauh.',
      },
      {
        tag: 'p',
        text: 'Di kejauhan, mercusuar berkedip tenang menembus kabut pagi.',
      },
    ],
    'id'
  );

  assert.equal(allSentences.length, 4);
  for (const sentence of allSentences) {
    for (let offset = sentence.chapterStartChar; offset <= sentence.chapterEndChar; offset++) {
      const loc = findLocationAtChapterOffset(allSentences, offset);
      assert.equal(
        loc.sentenceIndex,
        sentence.globalIndex,
        `Offset ${offset} inside "${sentence.text}" must resolve to sentence ${sentence.globalIndex}`
      );
    }
  }
});


