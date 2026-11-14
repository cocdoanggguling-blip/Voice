import React from 'react';
import { X } from 'lucide-react';
import type { TocItem } from '../types/reader';

interface TocDrawerProps {
  open: boolean;
  bookTitle: string;
  toc: TocItem[];
  currentChapterIndex: number;
  onSelectChapter: (chapterIndex: number) => void;
  onClose: () => void;
}

export const TocDrawer: React.FC<TocDrawerProps> = ({
  open,
  bookTitle,
  toc,
  currentChapterIndex,
  onSelectChapter,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Daftar Isi"
      className="fixed inset-0 z-50 flex justify-start bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-sm flex-col border-r border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-4 py-3.5 pt-safe">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-bold">Daftar Isi</h2>
            <p className="truncate text-xs text-[var(--nv-muted)]">{bookTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup daftar isi"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {toc.map((item) => {
            const isActive = item.chapterIndex === currentChapterIndex;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectChapter(item.chapterIndex);
                  onClose();
                }}
                style={{ paddingLeft: `${16 + Math.min(3, item.level) * 16}px` }}
                className={`flex min-h-[48px] w-full items-center justify-between border-b border-[var(--nv-border)]/60 pr-4 py-2.5 text-left text-sm transition-colors ${
                  isActive
                    ? 'bg-[var(--nv-accent-soft)] font-semibold text-[var(--nv-accent)]'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="line-clamp-2">{item.label}</span>
                <span className="ml-3 shrink-0 text-xs text-[var(--nv-muted)] tabular-nums">
                  Bab {item.chapterIndex + 1}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
