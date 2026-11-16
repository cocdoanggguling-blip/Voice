import type { TranslationProvider } from '../types/reader';

export interface GeminiModelOption {
  id: string;
  label: string;
  tierLabel: string;
  isFreeTier: boolean;
  description: string;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

/**
 * Deprecated Gemini models strictly prohibited per model guidelines.
 */
export const PROHIBITED_DEPRECATED_GEMINI_MODELS = new Set<string>([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
]);

/**
 * Supported Gemini translation models covering free-tier options, latest aliases,
 * and Pro/Argon models for literary prose translation.
 */
export const GEMINI_TRANSLATION_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-flash-latest',
    label: 'Gemini Flash Latest',
    tierLabel: 'Gratis',
    isFreeTier: true,
    description: 'Alias Flash terbaru — cepat, gratis, dan seimbang untuk terjemahan novel.',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    tierLabel: 'Gratis',
    isFreeTier: true,
    description: 'Model generasi 2.5 gratis yang stabil dan akurat.',
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash-Lite',
    tierLabel: 'Gratis · Cepat',
    isFreeTier: true,
    description: 'Model ringan super cepat dengan kuota gratis lebih longgar.',
  },
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen (Flash)',
    tierLabel: 'Gratis',
    isFreeTier: true,
    description: 'Model Flash generasi ke-4 untuk respons cepat dan hemat kuota.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    tierLabel: 'Gratis · Ringan',
    isFreeTier: true,
    description: 'Varian ringan seri 3.1 untuk terjemahan paragraf instan.',
  },
  {
    id: 'gemini-pro-latest',
    label: 'Gemini Pro Latest',
    tierLabel: 'Pro · Nuansa Sastra',
    isFreeTier: true,
    description: 'Alias Pro terbaru untuk tata bahasa sastra & dialog novel yang lebih alami.',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon (Pro)',
    tierLabel: 'Pro · Berbayar',
    isFreeTier: false,
    description: 'Model penalaran tinggi untuk konteks cerita kompleks (butuh API key berbayar).',
  },
];

export function isPresetGeminiModel(modelId?: string): boolean {
  if (!modelId) return false;
  return GEMINI_TRANSLATION_MODELS.some((m) => m.id === modelId);
}

export function getGeminiModelInfo(modelId?: string): GeminiModelOption | undefined {
  if (!modelId) return undefined;
  return GEMINI_TRANSLATION_MODELS.find((m) => m.id === modelId);
}

export function normalizeGeminiModelId(rawModel?: string): string {
  const cleaned = (rawModel || '').trim().replace(/^models\//i, '');
  if (!cleaned || PROHIBITED_DEPRECATED_GEMINI_MODELS.has(cleaned.toLowerCase())) {
    return DEFAULT_GEMINI_MODEL;
  }
  return cleaned;
}

export function buildGeminiEndpoint(modelId: string): string {
  const safeModel = normalizeGeminiModelId(modelId);
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(safeModel)}:generateContent`;
}

const LANGUAGE_NAME_MAP: Record<string, string> = {
  id: 'Indonesian',
  en: 'English',
  ms: 'Malay',
  jv: 'Javanese',
  ar: 'Arabic',
  ja: 'Japanese',
  'zh-CN': 'Simplified Chinese',
  zh: 'Chinese',
};

export function getLanguageDisplayName(code: string): string {
  return LANGUAGE_NAME_MAP[code] || code;
}

/**
 * Builds a clean generateContent REST request body without deprecated or
 * Gemini-4-restricted sampling fields (temperature, topP, topK, candidateCount).
 */
export function buildGeminiGenerateContentRequest(
  text: string,
  sourceLang: string,
  targetLang: string
): {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: 'user'; parts: Array<{ text: string }> }>;
} {
  const targetName = getLanguageDisplayName(targetLang);
  const sourceName =
    sourceLang && sourceLang !== 'auto'
      ? getLanguageDisplayName(sourceLang)
      : 'the source language';

  const systemPrompt = [
    `You are a professional literary novel translator.`,
    `Translate the user's text from ${sourceName} into natural, fluent ${targetName}.`,
    `Preserve tone, dialogue punctuation, paragraph flow, and proper names.`,
    `Return ONLY the translated text with no explanations, no markdown formatting, and no surrounding quotation marks unless they belong to the original text.`,
  ].join(' ');

  return {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
  };
}

interface GeminiCandidateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export function extractGeminiTranslatedText(payload: unknown): string {
  const data = payload as GeminiCandidateResponse | null | undefined;
  if (!data) {
    throw new Error('Respons Gemini kosong.');
  }
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Permintaan diblokir filter keamanan (${data.promptFeedback.blockReason}).`);
  }

  const firstCandidate = data.candidates?.[0];
  const parts = firstCandidate?.content?.parts || [];
  const combined = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();

  if (!combined) {
    const reason = firstCandidate?.finishReason;
    if (reason && reason !== 'STOP') {
      throw new Error(`Gemini tidak menghasilkan terjemahan (${reason}).`);
    }
    throw new Error('Respons terjemahan Gemini kosong.');
  }

  return combined;
}

export function mapGeminiHttpError(status: number, rawBody: string, modelId: string): string {
  let apiMessage = '';
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
    apiMessage = parsed.error?.message?.trim() || '';
  } catch {
    apiMessage = rawBody.trim();
  }

  const lower = apiMessage.toLowerCase();
  if (status === 400 && (lower.includes('api key') || lower.includes('api_key'))) {
    return 'API Key Gemini tidak valid. Periksa kembali kunci Anda di Setelan.';
  }
  if (status === 401 || status === 403) {
    return 'Akses API Key Gemini ditolak (403). Pastikan kunci aktif dan tidak dibatasi.';
  }
  if (status === 404) {
    return `Model "${modelId}" tidak ditemukan atau belum tersedia untuk API key Anda. Coba pilih model lain (mis. gemini-flash-latest atau gemini-2.5-flash).`;
  }
  if (status === 429) {
    return 'Kuota / batas permintaan gratis Gemini tercapai (429). Tunggu beberapa saat atau ganti ke model Flash-Lite.';
  }
  if (status >= 500) {
    return `Server Gemini sedang sibuk (${status}). Silakan coba lagi sebentar lagi.`;
  }

  return apiMessage
    ? `Gemini HTTP ${status}: ${apiMessage}`
    : `Gemini HTTP ${status}`;
}

export function buildTranslationCacheKey(
  provider: TranslationProvider,
  sourceLang: string,
  targetLang: string,
  text: string,
  geminiModel?: string
): string {
  const providerScope =
    provider === 'gemini'
      ? `gemini:${normalizeGeminiModelId(geminiModel)}`
      : provider;
  return `${providerScope}|${sourceLang}|${targetLang}|${text.trim().toLowerCase()}`;
}
