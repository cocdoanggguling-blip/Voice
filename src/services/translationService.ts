import type { TargetLanguageCode, TranslationResult } from '../types/reader';
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

function buildCacheKey(sourceLang: string, targetLang: string, text: string): string {
  return `${sourceLang}|${targetLang}|${text.trim().toLowerCase()}`;
}

/**
 * Translates selected word, sentence, or paragraph using keyless MyMemory API
 * with persistent IndexedDB caching and strict online/offline handling.
 */
export async function translateText(
  rawText: string,
  targetLang: TargetLanguageCode,
  bookLangHint?: string
): Promise<TranslationResult> {
  const text = rawText.replace(/\s+/g, ' ').trim();
  if (!text) {
    return {
      ok: false,
      translatedText: '',
      sourceLang: 'en',
      targetLang,
      fromCache: false,
      error: 'Teks kosong.',
    };
  }

  const sourceLang = detectLikelySourceLanguage(text, bookLangHint);
  const effectiveSource =
    sourceLang === targetLang ? (targetLang === 'id' ? 'en' : 'id') : sourceLang;

  const cacheKey = buildCacheKey(effectiveSource, targetLang, text);
  const cached = await getCachedTranslation(cacheKey);
  if (cached) {
    return {
      ok: true,
      translatedText: cached,
      sourceLang: effectiveSource,
      targetLang,
      fromCache: true,
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
      error: 'Sedang offline — terjemahan membutuhkan koneksi internet.',
    };
  }

  // MyMemory supports up to 500 chars per query cleanly; split long paragraphs if needed
  try {
    const chunks = splitForApiLimit(text, 450);
    const translatedParts: string[] = [];

    for (const chunk of chunks) {
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', chunk);
      url.searchParams.set('langpair', `${effectiveSource}|${targetLang}`);

      const abortController = new AbortController();
      const timer = window.setTimeout(() => abortController.abort(), 6000);
      let res: Response;
      try {
        res = await fetch(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: abortController.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }

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
        throw new Error(data.responseDetails || 'Terjemahan tidak tersedia saat ini.');
      }
      translatedParts.push(translated);
    }

    const combined = translatedParts.join(' ');
    await setCachedTranslation(cacheKey, combined, effectiveSource, targetLang);

    return {
      ok: true,
      translatedText: combined,
      sourceLang: effectiveSource,
      targetLang,
      fromCache: false,
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
