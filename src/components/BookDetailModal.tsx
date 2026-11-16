import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Library as LibraryIcon,
  MoreVertical,
  Pencil,
  Share2,
  Star,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { BookMetadata } from '../types/reader';
import { formatFileSizeId, formatIndoTimestamp } from '../utils/bookMetrics';
import { normalizeBookLocale } from '../utils/textSegmentation';

interface BookDetailModalProps {
  book: BookMetadata | null;
  allCollections: string[];
  onClose: () => void;
  onReadBook: (book: BookMetadata) => void;
  onReadWithTts: (book: BookMetadata) => void;
  onUpdateMetadata: (updated: BookMetadata) => Promise<void> | void;
  onDeleteBook: (bookId: string) => void;
}

function formatLanguageDisplay(lang: string): string {
  const norm = (lang || 'id').toLowerCase();
  if (norm.startsWith('id')) return 'Indonesia';
  if (norm.startsWith('en')) return 'Inggris';
  return (lang || 'id').toUpperCase();
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
  const [fileDetailsExpanded, setFileDetailsExpanded] = useState(true);
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
    setFileDetailsExpanded(true);
    setPathMenuOpen(false);
    setConfirmDelete(false);
    setFeedback(null);
  }, [book]);

  if (!book) return null;

  const finished = book.isFinished || book.progressPercent >= 100;

  const notify = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 2600);
  };

  const handleSaveEdit = async () => {
    const updated: BookMetadata = {
      ...book,
      title: title.trim() || book.title,
      author: author.trim() || book.author,
      language: normalizeBookLocale(language.trim() || book.language),
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
    const nextFinished = !finished;
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
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[var(--nv-chrome-bg)] text-[var(--nv-chrome-text)]"
    >
      {/* Deep Teal Top AppBar */}
      <header className="sticky top-0 z-20 flex h-13 items-center justify-between bg-[var(--nv-teal)] px-2 text-[var(--nv-teal-text)] shadow-md pt-safe sm:px-4">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            aria-label="Kembali ke perpustakaan"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="truncate text-base font-medium tracking-tight">Tentang Dokumen</h1>
        </div>

        {/* Primary BACA | Speaker CTA */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onReadBook(book)}
            className="inline-flex min-h-[44px] items-center px-3 text-sm font-bold tracking-wider text-[var(--nv-ui-bar-highlight)] hover:bg-white/10 whitespace-nowrap"
          >
            BACA
          </button>
          <span className="h-5 w-px bg-white/25" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onReadWithTts(book)}
            aria-label="Bacakan buku ini dengan suara TTS"
            title="Langsung Dengarkan (TTS)"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-[var(--nv-ui-bar-highlight)] hover:bg-white/10"
          >
            <Volume2 className="h-5 w-5 fill-current" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-5 py-5 pb-16 sm:px-8">
        {feedback && (
          <div className="rounded-[4px] border border-[var(--nv-gold)]/40 bg-[var(--nv-chrome-card)] px-4 py-2.5 text-xs font-medium">
            {feedback}
          </div>
        )}

        {/* Cover + Title + Toolbar */}
        <div className="space-y-4">
          <div className="w-48 sm:w-52 overflow-hidden rounded-[2px] bg-stone-800 shadow-lg aspect-[2/3]">
            {book.coverDataUrl ? (
              <img
                src={book.coverDataUrl}
                alt={`Sampul ${book.title}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#0e3a47] to-[#081f26] p-4 text-stone-100">
                <span className="text-[11px] uppercase tracking-wider opacity-70">EPUB</span>
                <p className="font-reader-literata text-base font-bold leading-snug line-clamp-5">
                  {book.title}
                </p>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--nv-chrome-muted)]">
                  Judul Buku
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--nv-chrome-muted)]">
                    Pengarang
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--nv-chrome-muted)]">
                    Bahasa (mis. id, en)
                  </label>
                  <input
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--nv-chrome-muted)]">
                  Seri (opsional)
                </label>
                <input
                  type="text"
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                  placeholder="Contoh: Kisah Nusantara"
                  className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--nv-chrome-muted)]">
                  Anotasi / Sinopsis
                </label>
                <textarea
                  rows={4}
                  value={annotation}
                  onChange={(e) => setAnnotation(e.target.value)}
                  placeholder="Tulis sinopsis atau catatan buku..."
                  className="w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] p-3 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="min-h-[38px] rounded-[4px] border border-[var(--nv-chrome-border)] px-4 text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  className="min-h-[38px] rounded-[4px] bg-[var(--nv-ui-accent)] px-4 text-xs font-bold text-[var(--nv-ui-accent-text)]"
                >
                  Simpan
                </button>
              </div>
            </div>
          ) : (
            <h2 className="text-[22px] font-normal leading-snug tracking-tight sm:text-2xl">
              {book.title}
            </h2>
          )}

          {/* 7 Flat Monochrome ReadEra Action Icons */}
          <div className="flex items-center gap-1 sm:gap-2 border-b border-[var(--nv-chrome-border)] pb-2">
            <button
              type="button"
              onClick={handleToggleFavorite}
              aria-label={book.isFavorite ? 'Hapus dari favorit' : 'Tandai favorit'}
              title="Favorit"
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
                book.isFavorite
                  ? 'text-[var(--nv-gold)]'
                  : 'text-[var(--nv-chrome-muted)] hover:bg-white/5 hover:text-[var(--nv-chrome-text)]'
              }`}
            >
              <Star className={`h-5 w-5 ${book.isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onReadBook(book)}
              aria-label="Buka dan lanjutkan baca"
              title="Baca Sekarang"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--nv-chrome-muted)] transition-colors hover:bg-white/5 hover:text-[var(--nv-chrome-text)]"
            >
              <Clock className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleToggleFinished}
              aria-label="Tandai sudah selesai"
              title="Selesai"
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
                finished
                  ? 'text-emerald-400'
                  : 'text-[var(--nv-chrome-muted)] hover:bg-white/5 hover:text-[var(--nv-chrome-text)]'
              }`}
            >
              <CheckCheck className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setShowCollectionPicker((v) => !v)}
              aria-label="Kelola koleksi buku"
              title="Koleksi"
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
                showCollectionPicker
                  ? 'text-[var(--nv-gold)]'
                  : 'text-[var(--nv-chrome-muted)] hover:bg-white/5 hover:text-[var(--nv-chrome-text)]'
              }`}
            >
              <LibraryIcon className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => void handleShare()}
              aria-label="Bagikan ringkasan buku"
              title="Bagikan"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--nv-chrome-muted)] transition-colors hover:bg-white/5 hover:text-[var(--nv-chrome-text)]"
            >
              <Share2 className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Hapus buku"
              title="Hapus"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-[var(--nv-chrome-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setIsEditing((v) => !v)}
              aria-label="Edit info dokumen"
              title="Edit Info"
              className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full transition-colors ${
                isEditing
                  ? 'text-[var(--nv-gold)]'
                  : 'text-[var(--nv-chrome-muted)] hover:bg-white/5 hover:text-[var(--nv-chrome-text)]'
              }`}
            >
              <Pencil className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Collection Picker */}
        {showCollectionPicker && (
          <div className="space-y-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[var(--nv-chrome-muted)]">
                Koleksi / Rak Buku
              </p>
              <button
                type="button"
                onClick={() => setShowCollectionPicker(false)}
                aria-label="Tutup pemilih koleksi"
                className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {mergedCollections.length === 0 ? (
                <p className="text-xs text-[var(--nv-chrome-muted)]">Belum ada koleksi.</p>
              ) : (
                mergedCollections.map((col) => {
                  const active = (book.collections || []).includes(col);
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => handleToggleCollection(col)}
                      className={`min-h-[36px] rounded-[4px] border px-3 text-xs font-medium ${
                        active
                          ? 'border-[var(--nv-gold)] bg-[var(--nv-gold)]/15 text-[var(--nv-gold)]'
                          : 'border-[var(--nv-chrome-border)]'
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
                className="min-h-[40px] flex-1 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-xs"
              />
              <button
                type="submit"
                className="min-h-[40px] rounded-[4px] bg-[var(--nv-ui-accent)] px-4 text-xs font-bold text-[var(--nv-ui-accent-text)]"
              >
                Tambah
              </button>
            </form>
          </div>
        )}

        {/* Unboxed Value-over-Label Metadata Stack (ReadEra Layout) */}
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-[15px] leading-snug">{book.author}</p>
            <p className="mt-0.5 text-xs text-[var(--nv-chrome-muted)]">Pengarang</p>
          </div>

          {book.series && (
            <div>
              <p className="text-[15px] leading-snug">{book.series}</p>
              <p className="mt-0.5 text-xs text-[var(--nv-chrome-muted)]">Seri</p>
            </div>
          )}

          <div>
            <p className="text-[15px] leading-relaxed">
              {book.annotation?.trim() || 'Tidak ada anotasi di metadata dokumen EPUB ini.'}
            </p>
            <p className="mt-0.5 text-xs text-[var(--nv-chrome-muted)]">Anotasi</p>
          </div>

          <div>
            <p className="text-[15px]">{formatLanguageDisplay(book.language)}</p>
            <p className="mt-0.5 text-xs text-[var(--nv-chrome-muted)]">Bahasa dokumen</p>
          </div>

          <div>
            <p className="text-[15px] tabular-nums">
              {Math.round(book.progressPercent)}%, {formatIndoTimestamp(book.lastReadAt)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--nv-chrome-muted)]">
              Penanda sekarang dan waktu terakhir dibaca
            </p>
          </div>

          {/* Collapsible Format & File Details */}
          <div>
            <button
              type="button"
              onClick={() => setFileDetailsExpanded((v) => !v)}
              className="flex w-full items-center justify-between gap-2 py-1 text-left"
            >
              <div>
                <p className="text-[15px] tabular-nums">
                  EPUB, {formatFileSizeId(book.fileSizeBytes)}, Berkas:{' '}
                  {book.fileCount ?? book.totalChapters}
                </p>
                <p className="mt-0.5 text-xs text-[var(--nv-chrome-muted)]">
                  Format berkas dan ukuran · {book.totalChapters} bab
                </p>
              </div>
              {fileDetailsExpanded ? (
                <ChevronUp className="h-5 w-5 shrink-0 text-[var(--nv-chrome-muted)]" />
              ) : (
                <ChevronDown className="h-5 w-5 shrink-0 text-[var(--nv-chrome-muted)]" />
              )}
            </button>

            {fileDetailsExpanded && (
              <div className="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={() => book.sha1 && void handleCopyText(book.sha1, 'SHA-1')}
                  className="block w-full text-left"
                >
                  <p className="text-[15px]">File identifikasi dokumen</p>
                  <p className="mt-0.5 break-all font-reader-mono text-xs text-[var(--nv-chrome-muted)]">
                    SHA-1: {book.sha1 || 'Tidak tersedia'}
                  </p>
                </button>

                <div className="relative flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 pl-4">
                    <p className="text-[15px]">Berkas #1</p>
                    <p className="mt-0.5 break-all text-xs text-[var(--nv-chrome-muted)]">
                      {book.filePath || book.fileName || `${book.title}.epub`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPathMenuOpen((v) => !v)}
                    aria-label="Opsi berkas"
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full text-[var(--nv-chrome-muted)] hover:bg-white/10"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  {pathMenuOpen && (
                    <div className="absolute right-0 top-10 z-20 w-48 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-sheet-bg)] p-1 text-[var(--nv-chrome-text)] shadow-xl">
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyText(
                            book.filePath || book.fileName || book.title,
                            'Lokasi file'
                          );
                          setPathMenuOpen(false);
                        }}
                        className="flex min-h-[40px] w-full items-center rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                      >
                        Salin Lokasi File
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(true);
                          setPathMenuOpen(false);
                        }}
                        className="flex min-h-[40px] w-full items-center rounded px-3 text-left text-xs font-medium hover:bg-white/10"
                      >
                        Edit Metadata Buku
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Delete */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-lg border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-5 text-[var(--nv-chrome-text)] shadow-xl">
            <h2 className="text-base font-bold">Hapus "{book.title}"?</h2>
            <p className="mt-2 text-sm text-[var(--nv-chrome-muted)]">
              Buku beserta penanda, kutipan, dan posisi baca terakhir akan dihapus.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[42px] rounded-[4px] border border-[var(--nv-chrome-border)] px-4 text-sm font-medium"
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
                className="min-h-[42px] rounded-[4px] bg-red-600 px-4 text-sm font-semibold text-white"
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
