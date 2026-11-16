import React, { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Sparkles, XCircle } from 'lucide-react';
import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_TRANSLATION_MODELS,
  TARGET_LANGUAGES,
  testGeminiTranslationKey,
} from '../services/translationService';
import { getGeminiModelInfo, isPresetGeminiModel } from '../utils/geminiTranslation';
import type {
  ReaderSettings,
  TargetLanguageCode,
  TranslationProvider,
} from '../types/reader';

interface GeminiTranslationConfigProps {
  settings: ReaderSettings;
  onUpdate: (patch: Partial<ReaderSettings>) => void;
  /** 'chrome' matches MainSettingsModal; 'sheet' matches Reader AppearanceSheet */
  surface?: 'chrome' | 'sheet';
  idPrefix?: string;
}

const CUSTOM_MODEL_SENTINEL = '__custom__';

export const GeminiTranslationConfig: React.FC<GeminiTranslationConfigProps> = ({
  settings,
  onUpdate,
  surface = 'chrome',
  idPrefix = 'nv-trans',
}) => {
  const [showKey, setShowKey] = useState(false);
  const [customModelMode, setCustomModelMode] = useState(
    () => Boolean(settings.geminiModel && !isPresetGeminiModel(settings.geminiModel))
  );
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const isChrome = surface === 'chrome';
  const inputBg = isChrome
    ? 'border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] text-[var(--nv-chrome-text)]'
    : 'border-[var(--nv-border)] bg-[var(--nv-bg)] text-[var(--nv-text)]';
  const subCardBg = isChrome
    ? 'border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] text-[var(--nv-chrome-text)]'
    : 'border-[var(--nv-border)] bg-[var(--nv-sheet-card)] text-[var(--nv-text)]';
  const mutedText = isChrome ? 'text-[var(--nv-chrome-muted)]' : 'text-[var(--nv-muted)]';

  const currentModel = settings.geminiModel || DEFAULT_GEMINI_MODEL;
  const usingCustomInput = customModelMode || !isPresetGeminiModel(currentModel);
  const selectedPresetInfo = getGeminiModelInfo(currentModel);

  const handleModelSelectChange = (val: string) => {
    setTestResult(null);
    if (val === CUSTOM_MODEL_SENTINEL) {
      setCustomModelMode(true);
      if (isPresetGeminiModel(currentModel)) {
        onUpdate({ geminiModel: '' });
      }
      return;
    }
    setCustomModelMode(false);
    onUpdate({ geminiModel: val });
  };

  const handleTestKey = async () => {
    setTestingKey(true);
    setTestResult(null);
    const res = await testGeminiTranslationKey(
      settings.geminiApiKey || '',
      currentModel || DEFAULT_GEMINI_MODEL
    );
    setTestResult({ ok: res.ok, message: res.message });
    setTestingKey(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={`mb-1 block text-xs font-medium ${mutedText}`}>Bahasa Tujuan</span>
          <select
            id={`${idPrefix}-target-lang`}
            aria-label="Bahasa tujuan terjemahan"
            value={settings.targetLanguage}
            onChange={(e) =>
              onUpdate({ targetLanguage: e.target.value as TargetLanguageCode })
            }
            className={`min-h-[40px] w-full rounded-[4px] border px-3 text-xs ${inputBg}`}
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={`mb-1 block text-xs font-medium ${mutedText}`}>
            Penyedia Terjemahan
          </span>
          <select
            id={`${idPrefix}-provider`}
            aria-label="Penyedia terjemahan"
            value={settings.translationProvider}
            onChange={(e) => {
              setTestResult(null);
              onUpdate({ translationProvider: e.target.value as TranslationProvider });
            }}
            className={`min-h-[40px] w-full rounded-[4px] border px-3 text-xs ${inputBg}`}
          >
            <option value="mymemory">MyMemory (Gratis Tanpa Key)</option>
            <option value="libretranslate">LibreTranslate</option>
            <option value="gemini">Gemini AI (Kunci API Sendiri)</option>
          </select>
        </label>
      </div>

      {settings.translationProvider === 'libretranslate' && (
        <label className="block">
          <span className={`mb-1 block text-xs font-medium ${mutedText}`}>
            Endpoint LibreTranslate
          </span>
          <input
            type="url"
            value={settings.libreTranslateUrl}
            onChange={(e) => onUpdate({ libreTranslateUrl: e.target.value })}
            placeholder="https://libretranslate.com/translate"
            className={`min-h-[40px] w-full rounded-[4px] border px-3 text-xs ${inputBg}`}
          />
        </label>
      )}

      {settings.translationProvider === 'gemini' && (
        <div className={`space-y-3 rounded-[6px] border p-3 ${subCardBg}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden="true" />
              <span className="text-xs font-semibold">Konfigurasi Gemini AI</span>
            </div>
            <span className="text-[11px] font-medium text-[var(--nv-cyan)]">
              Kunci API Sendiri
            </span>
          </div>

          {/* API Key Input with Show/Hide toggle */}
          <div>
            <label
              htmlFor={`${idPrefix}-gemini-key`}
              className={`mb-1 flex items-center gap-1 text-xs font-medium ${mutedText}`}
            >
              <KeyRound className="h-3 w-3" aria-hidden="true" />
              <span>Gemini API Key</span>
            </label>
            <div className="flex gap-1.5">
              <input
                id={`${idPrefix}-gemini-key`}
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={settings.geminiApiKey || ''}
                onChange={(e) => {
                  setTestResult(null);
                  onUpdate({ geminiApiKey: e.target.value });
                }}
                placeholder="AIzaSy... (masukkan API key dari Google AI Studio)"
                className={`min-h-[40px] min-w-0 flex-1 rounded-[4px] border px-3 text-xs ${inputBg}`}
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                aria-label={showKey ? 'Sembunyikan API Key Gemini' : 'Tampilkan API Key Gemini'}
                className={`inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-[4px] border hover:brightness-110 ${inputBg}`}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className={`mt-1 text-[11px] leading-snug ${mutedText}`}>
              API key hanya disimpan di perangkat Anda. Model tier gratis bisa dibuat di Google AI
              Studio tanpa kartu kredit.
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label
              htmlFor={`${idPrefix}-gemini-model`}
              className={`mb-1 block text-xs font-medium ${mutedText}`}
            >
              Model Gemini
            </label>
            <select
              id={`${idPrefix}-gemini-model`}
              aria-label="Pilih model Gemini"
              value={usingCustomInput ? CUSTOM_MODEL_SENTINEL : currentModel}
              onChange={(e) => handleModelSelectChange(e.target.value)}
              className={`min-h-[40px] w-full rounded-[4px] border px-3 text-xs ${inputBg}`}
            >
              {GEMINI_TRANSLATION_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.tierLabel})
                </option>
              ))}
              <option value={CUSTOM_MODEL_SENTINEL}>Model Kustom (ketik ID model lain)...</option>
            </select>

            {usingCustomInput && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-2">
                  <input
                    id={`${idPrefix}-gemini-custom-model`}
                    type="text"
                    aria-label="ID model Gemini kustom"
                    value={settings.geminiModel || ''}
                    onChange={(e) => {
                      setTestResult(null);
                      onUpdate({ geminiModel: e.target.value });
                    }}
                    placeholder="Contoh: gemini-2.5-flash atau gemini-4-hydrogen"
                    className={`min-h-[38px] min-w-0 flex-1 rounded-[4px] border px-3 text-xs ${inputBg}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomModelMode(false);
                      onUpdate({ geminiModel: DEFAULT_GEMINI_MODEL });
                    }}
                    className={`min-h-[38px] shrink-0 rounded-[4px] border px-2.5 text-[11px] font-medium hover:brightness-110 ${inputBg}`}
                  >
                    Preset
                  </button>
                </div>
              </div>
            )}

            {selectedPresetInfo && (
              <p className={`mt-1 text-[11px] leading-snug ${mutedText}`}>
                ID: <span className="font-mono text-[10px]">{selectedPresetInfo.id}</span> ·{' '}
                {selectedPresetInfo.description}
              </p>
            )}
          </div>

          {/* Key & Model Test Button */}
          <div className="flex flex-col gap-2 pt-0.5">
            <button
              type="button"
              disabled={testingKey}
              onClick={() => void handleTestKey()}
              className="inline-flex min-h-[38px] w-full items-center justify-center gap-2 rounded-[4px] border border-[var(--nv-ui-accent)]/50 bg-[var(--nv-ui-accent)]/15 px-3 text-xs font-semibold text-[var(--nv-cyan)] hover:bg-[var(--nv-ui-accent)]/25 disabled:opacity-60"
            >
              {testingKey ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Menguji koneksi Gemini...</span>
                </>
              ) : (
                <span>Uji Kunci &amp; Model Gemini</span>
              )}
            </button>

            {testResult && (
              <div
                role="status"
                className={`flex items-start gap-2 rounded-[4px] border px-3 py-2 text-[11px] leading-snug ${
                  testResult.ok
                    ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                    : 'border-red-400/40 bg-red-950/30 text-red-300'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
