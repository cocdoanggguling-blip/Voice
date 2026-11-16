import { useCallback, useEffect, useState } from 'react';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { parseEpubMetadata } from './services/epubService';
import { ensureSampleBooksSeeded } from './services/sampleBooks';
import {
  DEFAULT_READER_SETTINGS,
  DEFAULT_TTS_SETTINGS,
  deleteBook,
  deleteCustomFont,
  exportBackupJson,
  findDuplicateBookBySha1,
  importBackupJson,
  listBooks,
  listCustomFonts,
  loadReaderPresets,
  loadReaderSettings,
  loadTtsSettings,
  saveBook,
  saveCustomFont,
  saveReaderPresets,
  saveReaderSettings,
  saveTtsSettings,
  updateBookMetadata,
} from './services/storageService';
import { consumePendingAndroidOpenEpub } from './services/ttsBridge';
import { buildUiThemeVars, hexToRgb, normalizeHexColor } from './utils/uiTheme';
import type {
  BookMetadata,
  CustomFontRecord,
  ReaderPreset,
  ReaderSettings,
  TtsSettings,
} from './types/reader';

async function registerCustomFontFace(font: CustomFontRecord): Promise<void> {
  if (typeof FontFace === 'undefined') return;
  try {
    const face = new FontFace(font.familyName, `url(${font.dataUrl})`);
    const loaded = await face.load();
    document.fonts.add(loaded);
  } catch {
    // Ignore malformed font face
  }
}

export default function App() {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [activeBook, setActiveBook] = useState<BookMetadata | null>(null);
  const [autoStartTts, setAutoStartTts] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);

  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() => loadReaderSettings());
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(() => loadTtsSettings());
  const [customFonts, setCustomFonts] = useState<CustomFontRecord[]>([]);
  const [presets, setPresets] = useState<ReaderPreset[]>(() => loadReaderPresets());

  // Sync theme classes and custom CSS variables on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(
      'dark',
      'theme-dark',
      'theme-sepia',
      'theme-twilight',
      'theme-amoled',
      'theme-custom'
    );
    const managedVars = [
      '--nv-bg',
      '--nv-surface',
      '--nv-text',
      '--nv-muted',
      '--nv-accent',
      '--nv-accent-soft',
      '--nv-teal',
      '--nv-teal-deep',
      '--nv-teal-text',
      '--nv-gold',
      '--nv-cyan',
      '--nv-ui-accent',
      '--nv-ui-accent-text',
      '--nv-ui-bar-highlight',
      '--nv-ui-bar-highlight-text',
      '--nv-chrome-bg',
      '--nv-chrome-card',
      '--nv-chrome-border',
      '--nv-sheet-row-active',
    ];
    for (const v of managedVars) {
      root.style.removeProperty(v);
    }

    if (readerSettings.theme === 'dark') {
      root.classList.add('dark', 'theme-dark');
    } else if (readerSettings.theme === 'twilight') {
      root.classList.add('dark', 'theme-twilight');
    } else if (readerSettings.theme === 'amoled') {
      root.classList.add('dark', 'theme-amoled');
    } else if (readerSettings.theme === 'sepia') {
      root.classList.add('theme-sepia');
    } else if (readerSettings.theme === 'custom') {
      root.classList.add('theme-custom');
      const customAccentRgb = hexToRgb(normalizeHexColor(readerSettings.customAccent));
      root.style.setProperty('--nv-bg', readerSettings.customBg);
      root.style.setProperty('--nv-surface', readerSettings.customBg);
      root.style.setProperty('--nv-text', readerSettings.customText);
      root.style.setProperty('--nv-muted', readerSettings.customText);
      root.style.setProperty('--nv-accent', readerSettings.customAccent);
      root.style.setProperty(
        '--nv-accent-soft',
        `rgba(${customAccentRgb.r}, ${customAccentRgb.g}, ${customAccentRgb.b}, 0.2)`
      );
    }

    const uiVars = buildUiThemeVars(
      readerSettings.uiColor,
      readerSettings.theme,
      readerSettings.customBg
    );
    for (const [key, value] of Object.entries(uiVars)) {
      if (
        readerSettings.theme === 'custom' &&
        (key === '--nv-accent' || key === '--nv-accent-soft')
      ) {
        continue;
      }
      root.style.setProperty(key, value);
    }
  }, [
    readerSettings.customAccent,
    readerSettings.customBg,
    readerSettings.customText,
    readerSettings.theme,
    readerSettings.uiColor,
  ]);

  const handleImportFiles = useCallback(async (rawFiles: FileList | File[]) => {
    setImportError(null);
    setImportInfo(null);

    const epubFiles = Array.from(rawFiles).filter(
      (f) => f.name.toLowerCase().endsWith('.epub') || f.type === 'application/epub+zip'
    );

    if (epubFiles.length === 0) {
      setImportError('Format berkas tidak didukung. Pilih satu atau lebih file .epub.');
      return;
    }

    setIsImporting(true);
    let addedCount = 0;
    let duplicateCount = 0;
    let lastAddedOrMatched: BookMetadata | null = null;

    try {
      for (const file of epubFiles) {
        const buffer = await file.arrayBuffer();
        const relativePath =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const metadata = await parseEpubMetadata(
          buffer,
          file.name,
          undefined,
          false,
          relativePath
        );
        const duplicate = metadata.sha1 ? await findDuplicateBookBySha1(metadata.sha1) : undefined;
        if (duplicate) {
          duplicateCount++;
          lastAddedOrMatched = duplicate;
          continue;
        }
        await saveBook(metadata, buffer);
        addedCount++;
        lastAddedOrMatched = metadata;
      }

      const updated = await listBooks();
      setBooks(updated);

      if (epubFiles.length === 1 && lastAddedOrMatched) {
        if (duplicateCount > 0) {
          setImportInfo(
            `"${lastAddedOrMatched.title}" sudah ada di rak buku (SHA-1 sama). Membuka buku yang tersimpan.`
          );
        }
        setAutoStartTts(false);
        setActiveBook(lastAddedOrMatched);
      } else {
        setImportInfo(
          `Impor selesai: ${addedCount} buku baru ditambahkan${
            duplicateCount > 0 ? `, ${duplicateCount} duplikat dilewati` : ''
          }.`
        );
      }
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

  const refreshLibrary = useCallback(async () => {
    setIsLoadingLibrary(true);
    try {
      await ensureSampleBooksSeeded();
      const [loadedBooks, loadedFonts] = await Promise.all([listBooks(), listCustomFonts()]);
      await Promise.all(loadedFonts.map(registerCustomFontFace));
      setBooks(loadedBooks);
      setCustomFonts(loadedFonts);
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary().then(async () => {
      const pendingFile = await consumePendingAndroidOpenEpub();
      if (pendingFile) {
        await handleImportFiles([pendingFile]);
      }
    });

    const checkOnResume = () => {
      if (document.visibilityState === 'visible') {
        void consumePendingAndroidOpenEpub().then((pending) => {
          if (pending) void handleImportFiles([pending]);
        });
      }
    };
    document.addEventListener('visibilitychange', checkOnResume);
    return () => document.removeEventListener('visibilitychange', checkOnResume);
  }, [handleImportFiles, refreshLibrary]);

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

  const handleResetAllSettings = useCallback(() => {
    saveReaderSettings(DEFAULT_READER_SETTINGS);
    saveTtsSettings(DEFAULT_TTS_SETTINGS);
    setReaderSettings(DEFAULT_READER_SETTINGS);
    setTtsSettings(DEFAULT_TTS_SETTINGS);
    setImportInfo('Semua setelan tampilan dan TTS dikembalikan ke bawaan.');
  }, []);

  const handleImportCustomFont = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith('.ttf') && !lower.endsWith('.otf')) {
        setImportError('Format font harus .ttf atau .otf.');
        return;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const id = `font_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const cleanName = file.name.replace(/\.(ttf|otf)$/i, '').trim() || 'Font Kustom';
      const record: CustomFontRecord = {
        id,
        name: cleanName,
        familyName: `NovelVoiceCustom_${id}`,
        dataUrl,
        addedAt: Date.now(),
      };
      await saveCustomFont(record);
      await registerCustomFontFace(record);
      setCustomFonts((prev) => [...prev, record]);
      handleUpdateReaderSettings({ font: `custom:${record.id}` });
    },
    [handleUpdateReaderSettings]
  );

  const handleDeleteCustomFont = useCallback(
    async (fontId: string) => {
      await deleteCustomFont(fontId);
      setCustomFonts((prev) => prev.filter((f) => f.id !== fontId));
      if (readerSettings.font === `custom:${fontId}`) {
        handleUpdateReaderSettings({ font: 'literata' });
      }
    },
    [handleUpdateReaderSettings, readerSettings.font]
  );

  const handleSavePreset = useCallback(
    (name: string) => {
      const nextPreset: ReaderPreset = {
        id: `preset_${Date.now()}`,
        name,
        settings: {
          theme: readerSettings.theme,
          uiColor: readerSettings.uiColor,
          customBg: readerSettings.customBg,
          customText: readerSettings.customText,
          customAccent: readerSettings.customAccent,
          font: readerSettings.font,
          fontSize: readerSettings.fontSize,
          fontWeight: readerSettings.fontWeight,
          lineHeight: readerSettings.lineHeight,
          lineHeightPercent: readerSettings.lineHeightPercent,
          textAlign: readerSettings.textAlign,
          twoPageSpread: readerSettings.twoPageSpread,
          pageGapBorder: readerSettings.pageGapBorder,
          margins: readerSettings.margins,
          paragraphSpacingPx: readerSettings.paragraphSpacingPx,
        },
      };
      const next = [...presets, nextPreset];
      setPresets(next);
      saveReaderPresets(next);
    },
    [presets, readerSettings]
  );

  const handleApplyPreset = useCallback(
    (preset: ReaderPreset) => {
      handleUpdateReaderSettings(preset.settings);
    },
    [handleUpdateReaderSettings]
  );

  const handleDeletePreset = useCallback(
    (id: string) => {
      const next = presets.filter((p) => p.id !== id);
      setPresets(next);
      saveReaderPresets(next);
    },
    [presets]
  );

  const handleUpdateBookMetadata = useCallback(async (updated: BookMetadata) => {
    await updateBookMetadata(updated);
    setBooks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setActiveBook((prev) => (prev && prev.id === updated.id ? updated : prev));
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

  const handleExportBackup = useCallback(async () => {
    const json = await exportBackupJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `novelvoice_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setImportInfo('Cadangan JSON berhasil diekspor.');
  }, []);

  const handleImportBackup = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const stats = await importBackupJson(text);
        setReaderSettings(loadReaderSettings());
        setTtsSettings(loadTtsSettings());
        setPresets(loadReaderPresets());
        const updatedBooks = await listBooks();
        setBooks(updatedBooks);
        setImportInfo(
          `Pemulihan selesai: ${stats.restoredPositions} posisi baca, ${stats.restoredBookmarks} penanda, ${stats.restoredHighlights} kutipan, dan ${stats.restoredRules} aturan ganti teks dipulihkan.`
        );
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Gagal membaca file cadangan JSON.');
      }
    },
    []
  );

  if (activeBook) {
    return (
      <ReaderView
        bookMeta={activeBook}
        autoStartTts={autoStartTts}
        readerSettings={readerSettings}
        ttsSettings={ttsSettings}
        customFonts={customFonts}
        presets={presets}
        onUpdateReaderSettings={handleUpdateReaderSettings}
        onUpdateTtsSettings={handleUpdateTtsSettings}
        onImportCustomFont={handleImportCustomFont}
        onDeleteCustomFont={handleDeleteCustomFont}
        onSavePreset={handleSavePreset}
        onApplyPreset={handleApplyPreset}
        onDeletePreset={handleDeletePreset}
        onBookProgressUpdated={handleBookProgressUpdated}
        onBackToLibrary={() => {
          setActiveBook(null);
          setAutoStartTts(false);
          void listBooks().then(setBooks);
        }}
      />
    );
  }

  return (
    <LibraryView
      books={books}
      theme={readerSettings.theme}
      uiColor={readerSettings.uiColor}
      readerSettings={readerSettings}
      ttsSettings={ttsSettings}
      customFonts={customFonts}
      presets={presets}
      isLoading={isLoadingLibrary}
      isImporting={isImporting}
      importError={importError}
      importInfo={importInfo}
      onImportFiles={handleImportFiles}
      onOpenBook={(book, startTts) => {
        setAutoStartTts(Boolean(startTts));
        setActiveBook(book);
      }}
      onUpdateBookMetadata={handleUpdateBookMetadata}
      onDeleteBook={(id) => void handleDeleteBook(id)}
      onChangeTheme={(theme) => handleUpdateReaderSettings({ theme })}
      onChangeUiColor={(uiColor) => handleUpdateReaderSettings({ uiColor })}
      onUpdateReaderSettings={handleUpdateReaderSettings}
      onUpdateTtsSettings={handleUpdateTtsSettings}
      onImportCustomFont={handleImportCustomFont}
      onDeleteCustomFont={handleDeleteCustomFont}
      onSavePreset={handleSavePreset}
      onApplyPreset={handleApplyPreset}
      onDeletePreset={handleDeletePreset}
      onResetAllSettings={handleResetAllSettings}
      onExportBackup={handleExportBackup}
      onImportBackup={handleImportBackup}
    />
  );
}
