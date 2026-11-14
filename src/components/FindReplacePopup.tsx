import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Eye,
  Pencil,
  Settings,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type {
  FindReplaceDefaultSettings,
  ReplaceScope,
  TextReplaceRule,
} from '../types/reader';
import {
  SCOPE_LABELS,
  scanPreviewMatches,
  validateReplacePattern,
  type ChapterParagraphInput,
} from '../utils/textReplace';

interface FindReplacePopupProps {
  open: boolean;
  mode: 'selection' | 'manual' | 'edit';
  initialPattern: string;
  editingRule?: TextReplaceRule | null;
  presetTtsOnly?: boolean;
  defaults: FindReplaceDefaultSettings;
  chapterIndex: number;
  paragraphIndex?: number;
  charOffset: number;
  bookId: string;
  bookSha1?: string;
  seriesKey?: string;
  chaptersData: ChapterParagraphInput[] | null;
  scanningChapters: boolean;
  onUpdateDefaults: (patch: Partial<FindReplaceDefaultSettings>) => void;
  onApply: (draft: {
    editingRuleId?: string;
    pattern: string;
    replacement: string;
    caseSensitive: boolean;
    wholeWord: boolean;
    preserveCase: boolean;
    isRegex: boolean;
    ttsOnly: boolean;
    scope: ReplaceScope;
    excludedMatchKeys: string[];
    expectedMatchCount: number;
  }) => void;
  onClose: () => void;
}

const ALL_SCOPES: ReplaceScope[] = [
  'onlyThis',
  'chapter',
  'fromHereToEnd',
  'book',
  'series',
  'global',
];

export const FindReplacePopup: React.FC<FindReplacePopupProps> = ({
  open,
  mode,
  initialPattern,
  editingRule,
  presetTtsOnly = false,
  defaults,
  chapterIndex,
  paragraphIndex,
  charOffset,
  bookId,
  bookSha1,
  seriesKey,
  chaptersData,
  scanningChapters,
  onUpdateDefaults,
  onApply,
  onClose,
}) => {
  const [pattern, setPattern] = useState('');
  const [editingPatternInline, setEditingPatternInline] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(defaults.defaultCaseSensitive);
  const [wholeWord, setWholeWord] = useState(defaults.defaultWholeWord);
  const [preserveCase, setPreserveCase] = useState(defaults.defaultPreserveCase);
  const [isRegex, setIsRegex] = useState(false);
  const [ttsOnly, setTtsOnly] = useState(false);
  const [scope, setScope] = useState<ReplaceScope>(defaults.defaultScope);
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [showDefaultsPanel, setShowDefaultsPanel] = useState(false);

  // Track visualViewport so popup stays above mobile virtual keyboard
  const [viewportBox, setViewportBox] = useState<{ top: number; height: number } | null>(null);
  const replaceInputRef = useRef<HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    if (editingRule) {
      setPattern(editingRule.pattern);
      setReplacement(editingRule.replacement);
      setCaseSensitive(editingRule.caseSensitive);
      setWholeWord(editingRule.wholeWord);
      setPreserveCase(editingRule.preserveCase);
      setIsRegex(editingRule.isRegex);
      setTtsOnly(editingRule.ttsOnly);
      setScope(editingRule.scope);
      setExcludedKeys(new Set(editingRule.excludedMatchKeys || []));
      setEditingPatternInline(true);
    } else {
      setPattern(initialPattern);
      setReplacement('');
      setCaseSensitive(defaults.defaultCaseSensitive);
      setWholeWord(defaults.defaultWholeWord);
      setPreserveCase(defaults.defaultPreserveCase);
      setIsRegex(false);
      setTtsOnly(presetTtsOnly);
      setScope(defaults.defaultScope);
      setExcludedKeys(new Set());
      setEditingPatternInline(mode === 'manual' || !initialPattern.trim());
    }
    setShowPreview(false);
    setShowDefaultsPanel(false);

    const timer = window.setTimeout(() => {
      if (mode === 'manual' && !initialPattern.trim() && findInputRef.current) {
        findInputRef.current.focus({ preventScroll: true });
      } else if (replaceInputRef.current) {
        replaceInputRef.current.focus({ preventScroll: true });
      }
    }, 40);

    return () => window.clearTimeout(timer);
  }, [open, mode, initialPattern, editingRule, presetTtsOnly, defaults]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) {
      setViewportBox(null);
      return;
    }

    const syncViewport = () => {
      setViewportBox({
        top: Math.max(0, vv.offsetTop),
        height: Math.max(240, vv.height),
      });
    };

    syncViewport();
    vv.addEventListener('resize', syncViewport);
    vv.addEventListener('scroll', syncViewport);
    return () => {
      vv.removeEventListener('resize', syncViewport);
      vv.removeEventListener('scroll', syncViewport);
    };
  }, [open]);

  const validation = useMemo(
    () => validateReplacePattern(pattern, isRegex),
    [pattern, isRegex]
  );

  const previewResult = useMemo(() => {
    if (!open || !validation.valid || !chaptersData) {
      return { totalMatches: 0, skippedCount: 0, items: [] };
    }
    return scanPreviewMatches(
      chaptersData,
      {
        pattern,
        replacement,
        caseSensitive,
        wholeWord,
        preserveCase,
        isRegex,
        ttsOnly,
        scope,
        bookId,
        bookSha1,
        seriesKey,
        targetChapterIndex: editingRule?.targetChapterIndex ?? chapterIndex,
        targetParagraphIndex: editingRule?.targetParagraphIndex ?? paragraphIndex,
        targetCharOffset: editingRule?.targetCharOffset ?? charOffset,
      },
      160
    );
  }, [
    open,
    validation.valid,
    chaptersData,
    pattern,
    replacement,
    caseSensitive,
    wholeWord,
    preserveCase,
    isRegex,
    ttsOnly,
    scope,
    bookId,
    bookSha1,
    seriesKey,
    editingRule,
    chapterIndex,
    paragraphIndex,
    charOffset,
  ]);

  // Reset excluded checkboxes if query options fundamentally change (except when editing loaded rule)
  const effectiveMatchCount = useMemo(() => {
    if (!validation.valid) return 0;
    const excludedInPreview = previewResult.items.filter((it) => excludedKeys.has(it.key)).length;
    return Math.max(0, previewResult.totalMatches - excludedInPreview);
  }, [excludedKeys, previewResult.items, previewResult.totalMatches, validation.valid]);

  if (!open) return null;

  const canApply = validation.valid && (editingRule ? true : effectiveMatchCount > 0 || scope === 'series' || scope === 'global' || ttsOnly);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validation.valid) return;
    onApply({
      editingRuleId: editingRule?.id,
      pattern,
      replacement,
      caseSensitive,
      wholeWord,
      preserveCase,
      isRegex,
      ttsOnly,
      scope,
      excludedMatchKeys: Array.from(excludedKeys),
      expectedMatchCount: effectiveMatchCount,
    });
  };

  const toggleExcluded = (key: string) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const ToggleChip = ({
    label,
    checked,
    onToggle,
    icon,
  }: {
    label: string;
    checked: boolean;
    onToggle: () => void;
    icon?: React.ReactNode;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-2.5 text-left text-xs font-medium transition-colors ${
        checked
          ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
          : 'border-[var(--nv-border)] bg-[var(--nv-bg)] text-[var(--nv-text)] hover:bg-black/5 dark:hover:bg-white/5'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
          checked
            ? 'border-[var(--nv-accent)] bg-[var(--nv-accent)] text-white'
            : 'border-[var(--nv-muted)]/60'
        }`}
      >
        {checked ? '✓' : ''}
      </span>
      {icon}
      <span className="leading-tight">{label}</span>
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ganti teks di layar baca"
      style={
        viewportBox
          ? { top: `${viewportBox.top}px`, height: `${viewportBox.height}px` }
          : undefined
      }
      className={`fixed left-0 right-0 z-50 flex items-end justify-center bg-black/45 p-2 backdrop-blur-xs sm:items-center sm:p-4 ${
        viewportBox ? '' : 'inset-y-0'
      }`}
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        style={
          viewportBox
            ? { maxHeight: `${Math.max(220, viewportBox.height - 16)}px` }
            : { maxHeight: '90vh' }
        }
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Row: Selected Text + Defaults Settings Gear + Close */}
        <div className="flex items-start justify-between gap-2 border-b border-[var(--nv-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            {editingPatternInline ? (
              <div className="space-y-1">
                <label
                  htmlFor="fr-find-input"
                  className="block text-[11px] font-semibold text-[var(--nv-muted)]"
                >
                  Cari teks / pola:
                </label>
                <input
                  id="fr-find-input"
                  ref={findInputRef}
                  type="text"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                  placeholder="Ketik kata, frasa, atau regex..."
                  className="min-h-[38px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-sm font-medium text-[var(--nv-accent)] focus:border-[var(--nv-accent)] focus:outline-none"
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs font-semibold text-[var(--nv-muted)]">
                  Teks terpilih:
                </span>
                <span className="break-words text-sm font-bold text-[var(--nv-accent)]">
                  "{pattern}"
                </span>
                <button
                  type="button"
                  onClick={() => setEditingPatternInline(true)}
                  aria-label="Ubah teks yang dicari"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setShowDefaultsPanel((v) => !v)}
              aria-label="Setelan default ganti teks"
              title="Setelan default ganti teks"
              className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl transition-colors ${
                showDefaultsPanel
                  ? 'bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                  : 'text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Settings className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup dialog ganti teks"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* Default Settings Sub-Panel */}
          {showDefaultsPanel && (
            <div className="space-y-2.5 rounded-xl border border-[var(--nv-accent)]/40 bg-[var(--nv-bg)] p-3 text-xs">
              <p className="font-bold text-[var(--nv-accent)]">Setelan Default Ganti Teks</p>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="fr-default-scope" className="text-[var(--nv-muted)]">
                  Cakupan awal:
                </label>
                <select
                  id="fr-default-scope"
                  value={defaults.defaultScope}
                  onChange={(e) =>
                    onUpdateDefaults({ defaultScope: e.target.value as ReplaceScope })
                  }
                  className="min-h-[34px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2 text-xs"
                >
                  {ALL_SCOPES.map((sc) => (
                    <option key={sc} value={sc}>
                      {SCOPE_LABELS[sc]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={defaults.defaultCaseSensitive}
                    onChange={(e) =>
                      onUpdateDefaults({ defaultCaseSensitive: e.target.checked })
                    }
                    className="accent-[var(--nv-accent)]"
                  />
                  <span>Default Peka Kapital</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={defaults.defaultWholeWord}
                    onChange={(e) =>
                      onUpdateDefaults({ defaultWholeWord: e.target.checked })
                    }
                    className="accent-[var(--nv-accent)]"
                  />
                  <span>Default Kata Utuh</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={defaults.defaultPreserveCase}
                    onChange={(e) =>
                      onUpdateDefaults({ defaultPreserveCase: e.target.checked })
                    }
                    className="accent-[var(--nv-accent)]"
                  />
                  <span>Pertahankan Kapital</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={defaults.applyToToc}
                    onChange={(e) => onUpdateDefaults({ applyToToc: e.target.checked })}
                    className="accent-[var(--nv-accent)]"
                  />
                  <span>Terapkan ke Daftar Isi</span>
                </label>
              </div>
            </div>
          )}

          {/* Replace With Input + Quick Apply */}
          <div>
            <label
              htmlFor="fr-replace-input"
              className="mb-1 block text-xs font-semibold text-[var(--nv-muted)]"
            >
              Ganti dengan:
            </label>
            <div className="flex items-stretch gap-2">
              <textarea
                id="fr-replace-input"
                ref={replaceInputRef}
                rows={2}
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Ketik teks pengganti (kosongkan untuk menghapus)..."
                className="min-h-[54px] flex-1 resize-y rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2 text-sm focus:border-[var(--nv-accent)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!canApply}
                className="min-h-[44px] shrink-0 self-end rounded-xl bg-[var(--nv-accent)] px-4 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
              >
                Terapkan
              </button>
            </div>
            {isRegex && (
              <p className="mt-1 text-[11px] text-[var(--nv-muted)]">
                Regex aktif: gunakan <code className="font-mono">$1</code>,{' '}
                <code className="font-mono">$2</code> untuk grup tangkap.
              </p>
            )}
          </div>

          {/* 5 Toggles */}
          <div className="flex flex-wrap gap-1.5">
            <ToggleChip
              label="Peka huruf besar dan kecil"
              checked={caseSensitive}
              onToggle={() => setCaseSensitive((v) => !v)}
            />
            <ToggleChip
              label="Kata utuh"
              checked={wholeWord}
              onToggle={() => setWholeWord((v) => !v)}
            />
            <ToggleChip
              label="Pertahankan huruf kapital"
              checked={preserveCase}
              onToggle={() => setPreserveCase((v) => !v)}
            />
            <ToggleChip
              label="Regex"
              checked={isRegex}
              onToggle={() => setIsRegex((v) => !v)}
            />
            <ToggleChip
              label="Hanya untuk TTS"
              checked={ttsOnly}
              onToggle={() => setTtsOnly((v) => !v)}
              icon={<Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            />
          </div>

          {ttsOnly && (
            <p className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2 text-[11px] text-[var(--nv-muted)]">
              Mode <strong>Hanya untuk TTS</strong>: teks di layar tetap asli; hanya pembacaan suara TTS yang diubah tanpa menggeser highlight.
            </p>
          )}

          {/* Scope Dropdown */}
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="fr-scope-select" className="text-xs font-semibold text-[var(--nv-muted)]">
              Cakupan:
            </label>
            <select
              id="fr-scope-select"
              value={scope}
              onChange={(e) => setScope(e.target.value as ReplaceScope)}
              className="min-h-[40px] flex-1 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs font-medium"
            >
              {ALL_SCOPES.map((sc) => (
                <option key={sc} value={sc}>
                  {SCOPE_LABELS[sc]}
                </option>
              ))}
            </select>
          </div>

          {/* Validation Error OR Live Count + Preview Trigger */}
          {!validation.valid ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{validation.error}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2">
              <div className="min-w-0 text-xs">
                {scanningChapters && !chaptersData ? (
                  <span className="text-[var(--nv-muted)]">Menghitung kemunculan di buku...</span>
                ) : (
                  <span className="font-semibold tabular-nums">
                    Ditemukan {effectiveMatchCount} kemunculan
                    {previewResult.skippedCount > 0
                      ? ` · ${previewResult.skippedCount} kemunculan dilewati`
                      : ''}
                    {(scope === 'series' || scope === 'global') && ' (di buku ini)'}
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={previewResult.items.length === 0}
                onClick={() => setShowPreview((v) => !v)}
                className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-[var(--nv-border)] px-2.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 whitespace-nowrap"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{showPreview ? 'Tutup Pratinjau' : 'Pratinjau'}</span>
              </button>
            </div>
          )}

          {/* Checkable Preview List */}
          {showPreview && previewResult.items.length > 0 && (
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-2">
              <p className="px-1 text-[11px] font-medium text-[var(--nv-muted)]">
                Centang kemunculan yang ingin diganti ({effectiveMatchCount} dipilih):
              </p>
              {previewResult.items.map((item) => {
                const checked = !excludedKeys.has(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleExcluded(item.key)}
                    className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                      checked
                        ? 'border-[var(--nv-border)] bg-[var(--nv-surface)]'
                        : 'border-transparent opacity-55 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nv-accent)]" />
                    ) : (
                      <Square className="mt-0.5 h-4 w-4 shrink-0 text-[var(--nv-muted)]" />
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="truncate text-[10px] font-semibold text-[var(--nv-muted)]">
                        {item.chapterTitle}
                      </p>
                      <p className="line-through decoration-red-500/70 opacity-75">
                        {item.beforeSnippet}
                      </p>
                      <p className="font-medium text-[var(--nv-accent)]">{item.afterSnippet}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--nv-border)] px-4 py-2.5 pb-safe">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] rounded-xl border border-[var(--nv-border)] px-4 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!canApply}
            className="min-h-[42px] rounded-xl bg-[var(--nv-accent)] px-5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
          >
            Terapkan
          </button>
        </div>
      </form>
    </div>
  );
};
