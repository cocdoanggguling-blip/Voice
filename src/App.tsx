import { useCallback, useEffect, useState } from 'react';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { parseEpubMetadata } from './services/epubService';
import { ensureSampleBooksSeeded } from './services/sampleBooks';
import {
  deleteBook,
  listBooks,
  loadReaderSettings,
  loadTtsSettings,
  saveBook,
  saveReaderSettings,
  saveTtsSettings,
} from './services/storageService';
import type { BookMetadata, ReaderSettings, TtsSettings } from './types/reader';

export default function App() {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [activeBook, setActiveBook] = useState<BookMetadata | null>(null);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(() => loadTtsSettings());

  // Sync theme class on <html> cleanly
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'theme-dark', 'theme-sepia');
    if (readerSettings.theme === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else if (readerSettings.theme === 'sepia') {
      root.classList.add('theme-sepia');
    }
  }, [readerSettings.theme]);

  const refreshLibrary = useCallback(async () => {
    setIsLoadingLibrary(true);
    try {
      await ensureSampleBooksSeeded();
      const loaded = await listBooks();
      setBooks(loaded);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const handleUpdateReaderSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setReaderSettings((prev) => {
      const next = { ...prev, ...patch };
      saveReaderSettings(next);
      return next;
    });
  }, []);

  const handleUpdateTtsSettings = useCallback((patch: Partial<TtsSettings>) => {
    setTtsSettings((prev) => {
      const next = { ...prev, ...patch };
      saveTtsSettings(next);
      return next;
    });
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    setImportError(null);
    if (!file.name.toLowerCase().endsWith('.epub') && file.type !== 'application/epub+zip') {
      setImportError('Format berkas tidak didukung. Pilih file dengan ekstensi .epub.');
      return;
    }

    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const metadata = await parseEpubMetadata(buffer, file.name);
      await saveBook(metadata, buffer);
      const updated = await listBooks();
      setBooks(updated);
      setActiveBook(metadata);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? `Gagal membaca file EPUB: ${err.message}`
          : 'Gagal membaca file EPUB. Pastikan berkas tidak rusak atau terenkripsi DRM.'
      );
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handleDeleteBook = useCallback(async (bookId: string) => {
    await deleteBook(bookId);
    setBooks((prev) => prev.filter((b) => b.id !== bookId));
  }, []);

  const handleBookProgressUpdated = useCallback((updated: BookMetadata) => {
    setBooks((prev) => {
      const next = prev.map((b) => (b.id === updated.id ? updated : b));
      return next.sort((a, b) => b.lastReadAt - a.lastReadAt);
    });
    setActiveBook((prev) => (prev && prev.id === updated.id ? updated : prev));
  }, []);

  if (activeBook) {
    return (
      <ReaderView
        bookMeta={activeBook}
        readerSettings={readerSettings}
        ttsSettings={ttsSettings}
        onUpdateReaderSettings={handleUpdateReaderSettings}
        onUpdateTtsSettings={handleUpdateTtsSettings}
        onBookProgressUpdated={handleBookProgressUpdated}
        onBackToLibrary={() => {
          setActiveBook(null);
          void listBooks().then(setBooks);
        }}
      />
    );
  }

  return (
    <LibraryView
      books={books}
      theme={readerSettings.theme}
      isLoading={isLoadingLibrary}
      isImporting={isImporting}
      importError={importError}
      onImportFile={(file) => void handleImportFile(file)}
      onOpenBook={(book) => setActiveBook(book)}
      onDeleteBook={(id) => void handleDeleteBook(id)}
      onChangeTheme={(theme) => handleUpdateReaderSettings({ theme })}
    />
  );
}
