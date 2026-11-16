import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_TRANSLATION_MODELS,
  PROHIBITED_DEPRECATED_GEMINI_MODELS,
  buildGeminiEndpoint,
  buildGeminiGenerateContentRequest,
  buildTranslationCacheKey,
  extractGeminiTranslatedText,
  isPresetGeminiModel,
  mapGeminiHttpError,
  normalizeGeminiModelId,
} from './geminiTranslation';

test('GEMINI_TRANSLATION_MODELS includes requested free and Pro/Argon models without deprecated models', () => {
  const ids = GEMINI_TRANSLATION_MODELS.map((m) => m.id);
  assert.ok(ids.includes('gemini-flash-latest'));
  assert.ok(ids.includes('gemini-2.5-flash'));
  assert.ok(ids.includes('gemini-2.5-flash-lite'));
  assert.ok(ids.includes('gemini-4-hydrogen'));
  assert.ok(ids.includes('gemini-3.1-flash-lite'));
  assert.ok(ids.includes('gemini-pro-latest'));
  assert.ok(ids.includes('gemini-4-argon'));

  for (const deprecated of PROHIBITED_DEPRECATED_GEMINI_MODELS) {
    assert.equal(ids.includes(deprecated), false, `Unexpected deprecated model ${deprecated}`);
  }
});

test('normalizeGeminiModelId rejects empty or prohibited deprecated models and strips models/ prefix', () => {
  assert.equal(normalizeGeminiModelId(''), DEFAULT_GEMINI_MODEL);
  assert.equal(normalizeGeminiModelId('gemini-1.5-flash'), DEFAULT_GEMINI_MODEL);
  assert.equal(normalizeGeminiModelId('gemini-2.0-flash'), DEFAULT_GEMINI_MODEL);
  assert.equal(normalizeGeminiModelId('gemini-pro'), DEFAULT_GEMINI_MODEL);
  assert.equal(normalizeGeminiModelId('models/gemini-4-argon'), 'gemini-4-argon');
  assert.equal(normalizeGeminiModelId('  gemini-2.5-flash-lite  '), 'gemini-2.5-flash-lite');
});

test('isPresetGeminiModel distinguishes presets from custom models', () => {
  assert.equal(isPresetGeminiModel('gemini-flash-latest'), true);
  assert.equal(isPresetGeminiModel('gemini-4-argon'), true);
  assert.equal(isPresetGeminiModel('gemini-custom-experimental'), false);
});

test('buildGeminiEndpoint constructs official v1beta generateContent URL', () => {
  assert.equal(
    buildGeminiEndpoint('gemini-4-argon'),
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:generateContent'
  );
});

test('buildGeminiGenerateContentRequest produces clean payload without Gemini-4-restricted sampling keys', () => {
  const req = buildGeminiGenerateContentRequest('Hello dark world.', 'en', 'id');
  assert.match(req.systemInstruction.parts[0].text, /Indonesian/i);
  assert.equal(req.contents[0].role, 'user');
  assert.equal(req.contents[0].parts[0].text, 'Hello dark world.');
  assert.equal('generationConfig' in req, false);
});

test('extractGeminiTranslatedText reads candidate text parts and rejects blocked/empty replies', () => {
  const ok = extractGeminiTranslatedText({
    candidates: [{ content: { parts: [{ text: 'Halo ' }, { text: 'dunia.' }] }, finishReason: 'STOP' }],
  });
  assert.equal(ok, 'Halo dunia.');

  assert.throws(
    () =>
      extractGeminiTranslatedText({
        promptFeedback: { blockReason: 'SAFETY' },
      }),
    /diblokir filter keamanan/i
  );

  assert.throws(() => extractGeminiTranslatedText({ candidates: [] }), /kosong/i);
});

test('mapGeminiHttpError maps 400, 403, 404, 429 cleanly into Indonesian guidance', () => {
  const err400 = mapGeminiHttpError(
    400,
    JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }),
    'gemini-flash-latest'
  );
  assert.match(err400, /API Key Gemini tidak valid/i);

  const err403 = mapGeminiHttpError(403, '', 'gemini-flash-latest');
  assert.match(err403, /ditolak/i);

  const err404 = mapGeminiHttpError(404, '', 'gemini-4-argon');
  assert.match(err404, /gemini-4-argon/);

  const err429 = mapGeminiHttpError(429, '', 'gemini-flash-latest');
  assert.match(err429, /Kuota/i);
});

test('buildTranslationCacheKey isolates cached translations across Gemini models and providers', () => {
  const kFlash = buildTranslationCacheKey('gemini', 'en', 'id', 'Hello world', 'gemini-flash-latest');
  const kArgon = buildTranslationCacheKey('gemini', 'en', 'id', 'Hello world', 'gemini-4-argon');
  const kMyMemory = buildTranslationCacheKey('mymemory', 'en', 'id', 'Hello world');

  assert.notEqual(kFlash, kArgon);
  assert.notEqual(kFlash, kMyMemory);
  assert.match(kFlash, /^gemini:gemini-flash-latest\|/);
  assert.match(kArgon, /^gemini:gemini-4-argon\|/);
});
