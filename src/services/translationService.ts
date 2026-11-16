import type {
  TargetLanguageCode,
  TranslationProvider,
  TranslationResult,
} from '../types/reader';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_TRANSLATION_MODELS,
  buildGeminiEndpoint,
  buildGeminiGenerateContentRequest,
  buildTranslationCacheKey,
  extractGeminiTranslatedText,
  mapGeminiHttpError,
  normalizeGeminiModelId,
} from '../utils/geminiTranslation';
import { detectLikelySourceLanguage } from '../utils/textSegmentation';
import { getCachedTranslation, setCachedTranslation } from './storageService';

export { DEFAULT_GEMINI_MODEL, GEMINI_TRANSLATION_MODELS };

export const TARGET_LANGUAGES: Array<{ code: TargetLanguageCode; label: string }> = [
  { code: 'id', label: 'Indonesia' },
  { code: 'en', label: 'Inggris' },
  { code: 'ms', label: 'Melayu' },
  { code: 'jv', label: 'Jawa' },
  { code: 'ar', label: 'Arab' },
  { code: 'ja', label: 'Jepang' },
  { code: 'zh-CN', label: 'Mandarin' },
];

export interface TranslateOptions {
  provider?: TranslationProvider;
  libreTranslateUrl?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}

async function translateViaMyMemory(
  chunk: string,
  effectiveSource: string,
  targetLang: string,
  signal: AbortSignal
): Promise<string> {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', chunk);
  url.searchParams.set('langpair', `${effectiveSource}|${targetLang}`);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
    responseDetails?: string;
  };

  const translated = data.responseData?.translatedText?.trim();
  if (!translated || data.responseStatus === 403) {
    throw new Error(data.responseDetails || 'Terjemahan MyMemory tidak tersedia saat ini.');
  }
  return translated;
}

async function translateViaLibreTranslate(
  chunk: string,
  effectiveSource: string,
  targetLang: string,
  endpointUrl: string,
  signal: AbortSignal
): Promise<string> {
  const normalizedTarget = targetLang.toLowerCase().startsWith('zh') ? 'zh' : targetLang;
  const res = await fetch(endpointUrl || 'https://libretranslate.com/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      q: chunk,
      source: 'auto',
      target: normalizedTarget,
      format: 'text',
      alternatives: 0,
      api_key: '',
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`LibreTranslate HTTP ${res.status}`);
  }

  const data = (await res.json()) as { translatedText?: string; error?: string };
  const translated = data.translatedText?.trim();
  if (!translated) {
    throw new Error(data.error || 'Respons LibreTranslate kosong.');
  }
  return translated;
}

async function translateViaGemini(
  chunk: string,
  effectiveSource: string,
  targetLang: string,
  apiKey: string,
  modelId: string,
  signal: AbortSignal
): Promise<string> {
  const normalizedModel = normalizeGeminiModelId(modelId);
  const endpoint = buildGeminiEndpoint(normalizedModel);
  const payload = buildGeminiGenerateContentRequest(chunk, effectiveSource, targetLang);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey.trim(),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '');
    throw new Error(mapGeminiHttpError(res.status, rawBody, normalizedModel));
  }

  const json = (await res.json()) as unknown;
  return extractGeminiTranslatedText(json);
}

/**
 * Translates selected word, sentence, or paragraph using switchable providers
 * (MyMemory, LibreTranslate, or BYOK Gemini AI) with persistent IndexedDB caching
 * and strict online/offline handling.
 */
export async function translateText(
  rawText: string,
  targetLang: TargetLanguageCode,
  bookLangHint?: string,
  options: TranslateOptions = {}
): Promise<TranslationResult> {
  const provider: TranslationProvider = options.provider ?? 'mymemory';
  const normalizedGeminiModel = normalizeGeminiModelId(options.geminiModel);
  const geminiApiKey = (options.geminiApiKey || '').trim();
  const text = rawText.replace(/\s+/g, ' ').trim();

  if (!text) {
    return {
      ok: false,
      translatedText: '',
      sourceLang: 'en',
      targetLang,
      fromCache: false,
      provider,
      model: provider === 'gemini' ? normalizedGeminiModel : undefined,
      error: 'Teks kosong.',
    };
  }

  const sourceLang = detectLikelySourceLanguage(text, bookLangHint);
  const effectiveSource =
    sourceLang === targetLang ? (targetLang === 'id' ? 'en' : 'id') : sourceLang;

  if (provider === 'gemini' && !geminiApiKey) {
    return {
      ok: false,
      translatedText: '',
      sourceLang: effectiveSource,
      targetLang,
      fromCache: false,
      provider,
      model: normalizedGeminiModel,
      error: 'API Key Gemini belum diisi. Masukkan kunci API di Setelan -> Terjemahan Langsung.',
    };
  }

  const cacheKey = buildTranslationCacheKey(
    provider,
    effectiveSource,
    targetLang,
    text,
    provider === 'gemini' ? normalizedGeminiModel : undefined
  );
  const cached = await getCachedTranslation(cacheKey);
  if (cached) {
    return {
      ok: true,
      translatedText: cached,
      sourceLang: effectiveSource,
      targetLang,
      fromCache: true,
      provider,
      model: provider === 'gemini' ? normalizedGeminiModel : undefined,
    };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      offline: true,
      translatedText: '',
      sourceLang: effectiveSource,
      targetLang,
      fromCache: false,
      provider,
      model: provider === 'gemini' ? normalizedGeminiModel : undefined,
      error: 'Sedang offline — terjemahan membutuhkan koneksi internet.',
    };
  }

  try {
    const chunkMaxLen = provider === 'gemini' ? 2800 : provider === 'mymemory' ? 450 : 1400;
    const timeoutMs = provider === 'gemini' ? 18000 : 7000;
    const chunks = splitForApiLimit(text, chunkMaxLen);
    const translatedParts: string[] = [];

    for (const chunk of chunks) {
      const abortController = new AbortController();
      const timer = window.setTimeout(() => abortController.abort(), timeoutMs);
      try {
        const part =
          provider === 'gemini'
            ? await translateViaGemini(
                chunk,
                effectiveSource,
                targetLang,
                geminiApiKey,
                normalizedGeminiModel,
                abortController.signal
              )
            : provider === 'libretranslate'
              ? await translateViaLibreTranslate(
                  chunk,
                  effectiveSource,
                  targetLang,
                  options.libreTranslateUrl || 'https://libretranslate.com/translate',
                  abortController.signal
                )
              : await translateViaMyMemory(chunk, effectiveSource, targetLang, abortController.signal);
        translatedParts.push(part);
      } finally {
        window.clearTimeout(timer);
      }
    }

    const combined = translatedParts.join(' ');
    await setCachedTranslation(cacheKey, combined, effectiveSource, targetLang);

    return {
      ok: true,
      translatedText: combined,
      sourceLang: effectiveSource,
      targetLang,
      fromCache: false,
      provider,
      model: provider === 'gemini' ? normalizedGeminiModel : undefined,
    };
  } catch (err) {
    const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;
    return {
      ok: false,
      offline: isOfflineNow,
      translatedText: '',
      sourceLang: effectiveSource,
      targetLang,
      fromCache: false,
      provider,
      model: provider === 'gemini' ? normalizedGeminiModel : undefined,
      error: isOfflineNow
        ? 'Sedang offline — terjemahan membutuhkan koneksi internet.'
        : err instanceof Error
          ? err.name === 'AbortError'
            ? 'Permintaan terjemahan melebihi batas waktu. Coba lagi.'
            : provider === 'gemini'
              ? err.message
              : `Gagal menerjemahkan: ${err.message}`
          : 'Gagal terhubung ke layanan terjemahan.',
    };
  }
}

/**
 * Validates the user's BYOK Gemini API key and selected model directly from Settings.
 */
export async function testGeminiTranslationKey(
  apiKey: string,
  modelId: string
): Promise<{ ok: boolean; message: string; sampleOutput?: string }> {
  const cleanedKey = apiKey.trim();
  const normalizedModel = normalizeGeminiModelId(modelId);

  if (!cleanedKey) {
    return {
      ok: false,
      message: 'Masukkan API Key Gemini terlebih dahulu.',
    };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      message: 'Perangkat sedang offline. Sambungkan internet untuk menguji API key.',
    };
  }

  const abortController = new AbortController();
  const timer = window.setTimeout(() => abortController.abort(), 15000);
  try {
    const sample = await translateViaGemini(
      'The night was quiet.',
      'en',
      'id',
      cleanedKey,
      normalizedModel,
      abortController.signal
    );
    return {
      ok: true,
      sampleOutput: sample,
      message: `Terhubung! Model ${normalizedModel} siap digunakan (contoh: "${sample}").`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Koneksi ke Gemini melebihi batas waktu.'
            : err.message
          : 'Gagal menghubungi API Gemini.',
    };
  } finally {
    window.clearTimeout(timer);
  }
}

function splitForApiLimit(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const words = text.split(' ');
  const out: string[] = [];
  let current = '';

  for (const w of words) {
    if ((current ? current.length + 1 : 0) + w.length > maxLen) {
      if (current) out.push(current);
      current = w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  if (current) out.push(current);
  return out;
}
