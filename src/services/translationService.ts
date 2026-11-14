import type {
  TargetLanguageCode,
  TranslationProvider,
  TranslationResult,
} from '../types/reader';
import { detectLikelySourceLanguage } from '../utils/textSegmentation';
import { getCachedTranslation, setCachedTranslation } from './storageService';

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
}

function buildCacheKey(
  provider: TranslationProvider,
  sourceLang: string,
  targetLang: string,
  text: string
): string {
  return `${provider}|${sourceLang}|${targetLang}|${text.trim().toLowerCase()}`;
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

/**
 * Translates selected word, sentence, or paragraph using switchable keyless
 * providers (MyMemory or LibreTranslate) with persistent IndexedDB caching
 * and strict online/offline handling.
 */
export async function translateText(
  rawText: string,
  targetLang: TargetLanguageCode,
  bookLangHint?: string,
  options: TranslateOptions = {}
): Promise<TranslationResult> {
  const provider: TranslationProvider = options.provider ?? 'mymemory';
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text) {
    return {
      ok: false,
      translatedText: '',
      sourceLang: 'en',
      targetLang,
      fromCache: false,
      provider,
      error: 'Teks kosong.',
    };
  }

  const sourceLang = detectLikelySourceLanguage(text, bookLangHint);
  const effectiveSource =
    sourceLang === targetLang ? (targetLang === 'id' ? 'en' : 'id') : sourceLang;

  const cacheKey = buildCacheKey(provider, effectiveSource, targetLang, text);
  const cached = await getCachedTranslation(cacheKey);
  if (cached) {
    return {
      ok: true,
      translatedText: cached,
      sourceLang: effectiveSource,
      targetLang,
      fromCache: true,
      provider,
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
      error: 'Sedang offline — terjemahan membutuhkan koneksi internet.',
    };
  }

  try {
    const chunks = splitForApiLimit(text, provider === 'mymemory' ? 450 : 1400);
    const translatedParts: string[] = [];

    for (const chunk of chunks) {
      const abortController = new AbortController();
      const timer = window.setTimeout(() => abortController.abort(), 7000);
      try {
        const part =
          provider === 'libretranslate'
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
      error: isOfflineNow
        ? 'Sedang offline — terjemahan membutuhkan koneksi internet.'
        : err instanceof Error
          ? `Gagal menerjemahkan: ${err.message}`
          : 'Gagal terhubung ke layanan terjemahan.',
    };
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
