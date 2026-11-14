import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Copy,
  Edit3,
  FolderPlus,
  MoreVertical,
  Share2,
  Star,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { BookMetadata } from '../types/reader';
import { formatFileSizeId, formatIndoTimestamp } from '../utils/bookMetrics';

interface BookDetailModalProps {
  book: BookMetadata | null;
  allCollections: string[];
  onClose: () => void;
  onReadBook: (book: BookMetadata) => void;
  onReadWithTts: (book: BookMetadata) => void;
  onUpdateMetadata: (updated: BookMetadata) => Promise<void> | void;
  onDeleteBook: (bookId: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  allCollections,
  onClose,
  onReadBook,
  onReadWithTts,
  onUpdateMetadata,
  onDeleteBook,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState('');
  const [series, setSeries] = useState('');
  const [annotation, setAnnotation] = useState('');
  const [newCollection, setNewCollection] = useState('');
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [pathMenuOpen, setPathMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!book) return;
    setTitle(book.title);
    setAuthor(book.author);
    setLanguage(book.language);
    setSeries(book.series || '');
    setAnnotation(book.annotation || '');
    setIsEditing(false);
    setShowCollectionPicker(false);
    setPathMenuOpen(false);
    setConfirmDelete(false);
    setFeedback(null);
  }, [book]);

  if (!book) return null;

  const notify = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2600);
  };

  const handleSaveEdit = async () => {
    const updated: BookMetadata = {
      ...book,
      title: title.trim() || book.title,
      author: author.trim() || book.author,
      language: language.trim() || book.language,
      series: series.trim() || undefined,
      annotation: annotation.trim(),
    };
    await onUpdateMetadata(updated);
    setIsEditing(false);
    notify('Informasi dokumen disimpan.');
  };

  const handleToggleFavorite = () => {
    void onUpdateMetadata({ ...book, isFavorite: !book.isFavorite });
  };

  const handleToggleFinished = () => {
    const nextFinished = !book.isFinished;
    void onUpdateMetadata({
      ...book,
      isFinished: nextFinished,
      progressPercent: nextFinished ? 100 : book.progressPercent,
    });
  };

  const handleToggleCollection = (colName: string) => {
    const clean = colName.trim();
    if (!clean) return;
    const current = book.collections || [];
    const exists = current.includes(clean);
    const nextCols = exists ? current.filter((c) => c !== clean) : [...current, clean];
    void onUpdateMetadata({ ...book, collections: nextCols });
  };

  const handleShare = async () => {
    const shareText = `${book.title} — ${book.author} (Progres ${Math.round(book.progressPercent)}%)`;
    try {
      if (navigator.share) {
        await navigator.share({ title: book.title, text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      notify('Ringkasan buku disalin ke papan klip.');
    } catch {
      notify('Berbagi dibatalkan.');
    }
  };

  const handleCopyText = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      notify(`${label} disalin.`);
    } catch {
      notify('Gagal menyalin ke papan klip.');
    }
  };

  const mergedCollections = Array.from(
    new Set([...allCollections, ...(book.collections || [])])
  ).sort((a, b) => a.localeCompare(b, 'id'));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tentang Dokumen"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--nv-bg)] text-[var(--nv-text)] overflow-y-auto"
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--nv-border)] bg-[var(--nv-bg)]/95 px-2 py-2.5 backdrop-blur-md pt-safe sm:px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Kembali ke perpustakaan"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="text-base font-bold">Tentang Dokumen</h1>
        </div>

        <button
          type="button"
          onClick={() => (isEditing ? void handleSaveEdit() : setIsEditing(true))}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-3.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
        >
          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isEditing ? 'Simpan' : 'Edit Info'}</span>
        </button>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 pb-16 sm:px-6">
        {feedback && (
          <div className="rounded-xl border border-[var(--nv-accent)]/40 bg-[var(--nv-accent-soft)] px-4 py-2.5 text-xs font-medium text-[var(--nv-text)]">
            {feedback}
          </div>
        )}

        {/* Hero Cover + Primary Actions */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="mx-auto w-36 shrink-0 overflow-hidden rounded-xl border border-[var(--nv-border)] bg-stone-200 shadow-md aspect-[3/4] sm:mx-0 sm:w-44">
            {book.coverDataUrl ? (
              <img
                src={book.coverDataUrl}
                alt={`Sampul ${book.title}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-stone-700 to-stone-900 p-4 text-stone-100">
                <span className="text-[11px] uppercase tracking-wider opacity-75">EPUB</span>
                <p className="font-reader-literata text-sm font-bold leading-snug line-clamp-4">
                  {book.title}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between gap-4">
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--nv-muted)]">
                    Judul Buku
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--nv-muted)]">
                      Pengarang
                    </label>
                    <input
                      type="text"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="min-h-[42px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--nv-muted)]">
                      Bahasa (mis. id, en)
                    </label>
                    <input
                      type="text"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="min-h-[42px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--nv-muted)]">
                    Seri (opsional)
                  </label>
                  <input
                    type="text"
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    placeholder="Contoh: Kisah Nusantara"
                    className="min-h-[42px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div>
                <h2 className="font-reader-literata text-xl font-bold leading-snug sm:text-2xl">
                  {book.title}
                </h2>
                <p className="mt-1 text-sm font-medium text-[var(--nv-muted)]">{book.author}</p>
                {book.series && (
                  <p className="mt-1 text-xs text-[var(--nv-muted)]">Seri: {book.series}</p>
                )}
              </div>
            )}

            {/* Yellow BACA Button + TTS Speaker Button */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onReadBook(book)}
                className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 text-sm font-extrabold tracking-wide text-stone-950 shadow-sm transition-transform hover:bg-amber-300 active:scale-[0.98]"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                <span>BACA</span>
              </button>

              <button
                type="button"
                onClick={() => onReadWithTts(book)}
                aria-label="Bacakan buku ini dengan suara TTS"
                title="Langsung Dengarkan (TTS)"
                className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 text-[var(--nv-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Volume2 className="h-5 w-5 text-[var(--nv-accent)]" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Icon Row */}
        <div className="grid grid-cols-5 gap-2 rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-2">
          <button
            type="button"
            onClick={handleToggleFavorite}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors ${
              book.isFavorite
                ? 'bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                : 'text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Star
              className={`h-4 w-4 ${book.isFavorite ? 'fill-current' : ''}`}
              aria-hidden="true"
            />
            <span>Favorit</span>
          </button>

          <button
            type="button"
            onClick={handleToggleFinished}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium transition-colors ${
              book.isFinished || book.progressPercent >= 100
                ? 'bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                : 'text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            <span>Selesai</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCollectionPicker((v) => !v)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            <span>Koleksi</span>
          </button>

          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            <span>Bagikan</span>
          </button>

          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium text-red-600 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>Hapus</span>
          </button>
        </div>

        {/* Collection Picker */}
        {showCollectionPicker && (
          <div className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--nv-muted)]">Koleksi / Rak Buku</p>
              <button
                type="button"
                onClick={() => setShowCollectionPicker(false)}
                aria-label="Tutup pemilih koleksi"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {mergedCollections.length === 0 ? (
                <p className="text-xs text-[var(--nv-muted)]">Belum ada koleksi.</p>
              ) : (
                mergedCollections.map((col) => {
                  const active = (book.collections || []).includes(col);
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => handleToggleCollection(col)}
                      className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                        active
                          ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                          : 'border-[var(--nv-border)]'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}
                      {col}
                    </button>
                  );
                })
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCollection.trim()) return;
                handleToggleCollection(newCollection);
                setNewCollection('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={newCollection}
                onChange={(e) => setNewCollection(e.target.value)}
                placeholder="Nama koleksi baru..."
                className="min-h-[40px] flex-1 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
              />
              <button
                type="submit"
                className="min-h-[40px] rounded-xl bg-[var(--nv-accent)] px-4 text-xs font-semibold text-white"
              >
                Tambah
              </button>
            </form>
          </div>
        )}

        {/* Annotation / Synopsis */}
        <section className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--nv-muted)]">
            Anotasi / Sinopsis
          </h3>
          {isEditing ? (
            <textarea
              rows={4}
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="Tulis sinopsis atau catatan buku..."
              className="w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3 text-sm"
            />
          ) : (
            <p className="text-sm leading-relaxed text-[var(--nv-text)]">
              {book.annotation?.trim() || 'Tidak ada anotasi di metadata dokumen EPUB ini.'}
            </p>
          )}
        </section>

        {/* Technical Metadata Table */}
        <section className="rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] divide-y divide-[var(--nv-border)]">
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-[var(--nv-muted)]">Status Baca</span>
            <span className="font-medium tabular-nums">
              {Math.round(book.progressPercent)}%, {formatIndoTimestamp(book.lastReadAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-[var(--nv-muted)]">Format &amp; Ukuran</span>
            <span className="font-medium tabular-nums">
              EPUB, {formatFileSizeId(book.fileSizeBytes)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-[var(--nv-muted)]">Jumlah Bab / File</span>
            <span className="font-medium tabular-nums">
              {book.totalChapters} bab · {book.fileCount ?? book.totalChapters} file
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-[var(--nv-muted)]">Bahasa</span>
            <span className="font-medium uppercase">{book.language || 'id'}</span>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-[var(--nv-muted)]">SHA-1</span>
            <button
              type="button"
              onClick={() => book.sha1 && void handleCopyText(book.sha1, 'SHA-1')}
              className="flex min-w-0 items-center gap-1.5 font-reader-mono text-xs text-[var(--nv-muted)] hover:text-[var(--nv-text)]"
            >
              <span className="truncate max-w-[200px] sm:max-w-[300px]">
                {book.sha1 || 'Tidak tersedia'}
              </span>
              {book.sha1 && <Copy className="h-3.5 w-3.5 shrink-0" />}
            </button>
          </div>
          <div className="relative flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--nv-muted)]">Lokasi File</p>
              <p className="truncate font-medium">
                {book.filePath || book.fileName || `${book.title}.epub`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPathMenuOpen((v) => !v)}
              aria-label="Opsi berkas"
              className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {pathMenuOpen && (
              <div className="absolute right-4 top-12 z-20 w-48 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    void handleCopyText(
                      book.filePath || book.fileName || book.title,
                      'Lokasi file'
                    );
                    setPathMenuOpen(false);
                  }}
                  className="flex min-h-[40px] w-full items-center rounded-lg px-3 text-left text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Salin Lokasi File
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setPathMenuOpen(false);
                  }}
                  className="flex min-h-[40px] w-full items-center rounded-lg px-3 text-left text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Edit Metadata Buku
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Confirm Delete */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5 shadow-xl">
            <h2 className="text-base font-bold">Hapus "{book.title}"?</h2>
            <p className="mt-2 text-sm text-[var(--nv-muted)]">
              Buku beserta penanda, kutipan, dan posisi baca terakhir akan dihapus.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[42px] rounded-xl border border-[var(--nv-border)] px-4 text-sm font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteBook(book.id);
                  setConfirmDelete(false);
                  onClose();
                }}
                className="min-h-[42px] rounded-xl bg-red-600 px-4 text-sm font-semibold text-white"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
