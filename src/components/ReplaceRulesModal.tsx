import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookCopy,
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { ReplaceScope, TextReplaceRule } from '../types/reader';
import {
  buildEffectiveChaptersForPreview,
  doesRuleApplyToBook,
  SCOPE_LABELS,
  scanPreviewMatches,
  type BookReplaceContext,
  type ChapterParagraphInput,
} from '../utils/textReplace';

interface ReplaceRulesModalProps {
  open: boolean;
  initialFilter?: 'all' | 'book' | 'ttsOnly';
  rules: TextReplaceRule[];
  bookCtx: BookReplaceContext;
  bookTitle: string;
  chaptersData: ChapterParagraphInput[] | null;
  onToggleRule: (id: string) => void;
  onDeleteRule: (id: string) => void;
  onMovePriority: (id: string, direction: 'up' | 'down') => void;
  onEditRule: (rule: TextReplaceRule) => void;
  onAddNewRule: (ttsOnly?: boolean) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => Promise<void> | void;
  onExportEditedEpub: () => Promise<{ appliedCount: number; skippedCount: number } | void>;
  onClose: () => void;
}

type RulesFilterMode = 'all' | 'book' | 'ttsOnly' | ReplaceScope;

export const ReplaceRulesModal: React.FC<ReplaceRulesModalProps> = ({
  open,
  initialFilter = 'all',
  rules,
  bookCtx,
  bookTitle,
  chaptersData,
  onToggleRule,
  onDeleteRule,
  onMovePriority,
  onEditRule,
  onAddNewRule,
  onExportJson,
  onImportJson,
  onExportEditedEpub,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<RulesFilterMode>(initialFilter);
  const [exportingEpub, setExportingEpub] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setFilterMode(initialFilter);
      setStatusMsg(null);
    }
  }, [initialFilter, open]);

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt),
    [rules]
  );

  const matchCountByRuleId = useMemo(() => {
    const map = new Map<string, number>();
    if (!open || !chaptersData) return map;
    for (const r of sortedRules) {
      if (!doesRuleApplyToBook({ ...r, enabled: true }, bookCtx)) {
        map.set(r.id, 0);
        continue;
      }
      const effectiveForRule = buildEffectiveChaptersForPreview(chaptersData, sortedRules, bookCtx, {
        excludeRuleId: r.id,
        onlyRulesBeforeRule: r,
      });
      const res = scanPreviewMatches(effectiveForRule, r, 1);
      const excluded = r.excludedMatchKeys?.length ?? 0;
      map.set(r.id, Math.max(0, res.totalMatches - excluded));
    }
    return map;
  }, [bookCtx, chaptersData, open, sortedRules]);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedRules.filter((r) => {
      if (filterMode === 'book') {
        if (!doesRuleApplyToBook({ ...r, enabled: true }, bookCtx)) return false;
      } else if (filterMode === 'ttsOnly') {
        if (!r.ttsOnly) return false;
      } else if (filterMode !== 'all') {
        if (r.scope !== filterMode) return false;
      }

      if (!q) return true;
      return (
        r.pattern.toLowerCase().includes(q) ||
        r.replacement.toLowerCase().includes(q) ||
        SCOPE_LABELS[r.scope].toLowerCase().includes(q)
      );
    });
  }, [bookCtx, filterMode, search, sortedRules]);

  if (!open) return null;

  const handleExportCopy = async () => {
    setExportingEpub(true);
    setStatusMsg(null);
    try {
      const res = await onExportEditedEpub();
      if (res) {
        setStatusMsg(
          `Salinan EPUB diunduh (${res.appliedCount} penggantian diterapkan${
            res.skippedCount > 0 ? `, ${res.skippedCount} dilewati` : ''
          }). Berkas asli tetap utuh.`
        );
      }
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? `Gagal membuat salinan EPUB: ${err.message}` : 'Gagal mengekspor EPUB.'
      );
    } finally {
      setExportingEpub(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await onImportJson(file);
      setStatusMsg('Aturan JSON berhasil diimpor.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Gagal mengimpor JSON aturan.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Kelola Aturan Ganti Teks"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] text-[var(--nv-text)] shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Primary Bar Header */}
        <div className="flex items-center justify-between gap-2 bg-[var(--nv-teal)] px-5 py-3.5 text-[var(--nv-teal-text)]">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-[var(--nv-teal-text)]">Aturan Ganti Teks</h2>
            <p className="truncate text-xs text-[var(--nv-teal-text)]/80">
              {bookTitle} · {sortedRules.length} aturan tersimpan
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAddNewRule(filterMode === 'ttsOnly')}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-[var(--nv-ui-bar-highlight)] px-3 text-xs font-bold text-[var(--nv-ui-bar-highlight-text)] hover:brightness-105 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Tambah</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup kelola aturan"
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[var(--nv-teal-text)] hover:bg-white/10"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Search & Filter Row */}
        <div className="space-y-2 border-b border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-4 py-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nv-muted)]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari pola atau pengganti..."
                className="min-h-[38px] w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] pl-9 pr-3 text-xs focus:border-[var(--nv-cyan)] focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter aturan ganti teks"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as RulesFilterMode)}
              className="min-h-[38px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] px-3 text-xs font-medium"
            >
              <option value="all">Semua Aturan ({sortedRules.length})</option>
              <option value="book">Berlaku di Buku Ini</option>
              <option value="ttsOnly">Hanya untuk TTS</option>
              <option value="onlyThis">Cakupan: Hanya yang ini</option>
              <option value="chapter">Cakupan: Bab ini</option>
              <option value="fromHereToEnd">Cakupan: Dari sini ke akhir</option>
              <option value="series">Cakupan: Seri ini</option>
              <option value="global">Cakupan: Global</option>
            </select>
          </div>

          {statusMsg && (
            <p className="rounded-lg border border-[var(--nv-cyan)]/40 bg-[var(--nv-sheet-bg)] px-3 py-2 text-xs text-[var(--nv-text)]">
              {statusMsg}
            </p>
          )}
        </div>

        {/* Rules List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--nv-border)]">
          {filteredRules.length === 0 ? (
            <div className="px-6 py-12 text-center text-xs text-[var(--nv-muted)]">
              {sortedRules.length === 0
                ? 'Belum ada aturan ganti teks. Pilih kata saat membaca lalu tekan "Ganti teks", atau tekan "Tambah" di atas.'
                : 'Tidak ada aturan yang cocok dengan filter ini.'}
            </div>
          ) : (
            filteredRules.map((rule, idx) => {
              const flags: string[] = [SCOPE_LABELS[rule.scope]];
              if (rule.ttsOnly) flags.push('Hanya TTS');
              if (rule.wholeWord) flags.push('Kata utuh');
              if (rule.caseSensitive) flags.push('Peka kapital');
              if (rule.preserveCase) flags.push('Pertahankan kapital');
              if (rule.isRegex) flags.push('Regex');

              const hitsCount = matchCountByRuleId.get(rule.id);

              return (
                <div
                  key={rule.id}
                  className={`flex items-start justify-between gap-3 px-4 py-3 transition-opacity ${
                    rule.enabled ? '' : 'opacity-55'
                  }`}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-1.5 text-sm">
                      <span className="break-all font-semibold text-[var(--nv-text)]">
                        "{rule.pattern}"
                      </span>
                      <span className="text-[var(--nv-muted)]">→</span>
                      <span className="break-all font-semibold text-[var(--nv-gold)]">
                        {rule.replacement ? `"${rule.replacement}"` : '(hapus teks)'}
                      </span>
                    </div>

                    <p className="text-[11px] leading-relaxed text-[var(--nv-muted)]">
                      {flags.join(' · ')}
                      {hitsCount !== undefined ? ` · ${hitsCount} kemunculan` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => onMovePriority(rule.id, 'up')}
                      aria-label={`Naikkan prioritas aturan ${rule.pattern}`}
                      title="Naikkan prioritas"
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--nv-border)] text-[var(--nv-muted)] hover:bg-white/10 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === filteredRules.length - 1}
                      onClick={() => onMovePriority(rule.id, 'down')}
                      aria-label={`Turunkan prioritas aturan ${rule.pattern}`}
                      title="Turunkan prioritas"
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--nv-border)] text-[var(--nv-muted)] hover:bg-white/10 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onEditRule(rule)}
                      aria-label={`Edit aturan ${rule.pattern}`}
                      title="Edit aturan"
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--nv-border)] text-[var(--nv-muted)] hover:bg-white/10"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label={`${rule.enabled ? 'Nonaktifkan' : 'Aktifkan'} aturan ${rule.pattern}`}
                      onClick={() => onToggleRule(rule.id)}
                      className={`relative mx-0.5 inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors ${
                        rule.enabled ? 'bg-[var(--nv-gold)]/70' : 'bg-stone-500/50'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full shadow transition-transform ${
                          rule.enabled
                            ? 'translate-x-4 bg-[var(--nv-gold)]'
                            : 'translate-x-0 bg-stone-200'
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteRule(rule.id)}
                      aria-label={`Hapus aturan ${rule.pattern}`}
                      title="Hapus aturan"
                      className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--nv-muted)] hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Export/Import JSON + Save Edited EPUB Copy */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-4 py-3 pb-safe">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={sortedRules.length === 0}
              onClick={onExportJson}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] px-3 text-xs font-semibold hover:brightness-110 disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ekspor JSON</span>
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] px-3 text-xs font-semibold hover:brightness-110 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Impor JSON</span>
            </button>
          </div>

          <button
            type="button"
            disabled={exportingEpub}
            onClick={() => void handleExportCopy()}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[var(--nv-ui-accent)] px-3.5 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105 disabled:opacity-50 whitespace-nowrap"
          >
            {exportingEpub ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <BookCopy className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{exportingEpub ? 'Menyimpan EPUB...' : 'Simpan salinan EPUB hasil edit'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
