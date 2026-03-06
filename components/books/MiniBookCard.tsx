import React, { useMemo, useState } from 'react';

type MiniBookCardProps = {
  bookId: string;
  title: string;
  author: string;
  coverUrl?: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
};

function resolveOpenLibraryFallback(bookId: string): string {
  const normalized = String(bookId || '').trim();
  if (!normalized) return '';

  const extMatch = normalized.match(/^ext_openlibrary_(.+)$/i);
  if (extMatch && extMatch[1]) {
    return `https://covers.openlibrary.org/b/olid/${encodeURIComponent(extMatch[1])}-L.jpg`;
  }

  const olMatch = normalized.match(/^ol_(.+)$/i);
  if (olMatch && olMatch[1]) {
    return `https://covers.openlibrary.org/b/olid/${encodeURIComponent(olMatch[1])}-L.jpg`;
  }

  return '';
}

const MiniBookCard: React.FC<MiniBookCardProps> = ({
  bookId,
  title,
  author,
  coverUrl,
  disabled = false,
  onClick,
}) => {
  const [coverAttempt, setCoverAttempt] = useState(0);

  const coverCandidates = useMemo(() => {
    const candidates = [String(coverUrl || '').trim(), resolveOpenLibraryFallback(bookId)]
      .filter((row) => row.length > 0);
    return Array.from(new Set(candidates));
  }, [bookId, coverUrl]);

  const activeCover = coverCandidates[coverAttempt] || '';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      className="w-[110px] shrink-0 rounded-[0.7rem] bg-white/5 border border-white/10 backdrop-blur-md p-2 text-left transition-all duration-300 ease-in-out hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="w-full aspect-[2/3] rounded-[0.5rem] border border-white/10 bg-white/5 overflow-hidden">
        {activeCover ? (
          <img
            src={activeCover}
            alt={title}
            loading="lazy"
            onError={() => setCoverAttempt((prev) => prev + 1)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center px-2 text-center text-[11px] font-semibold text-white/70 leading-snug">
            {title}
          </div>
        )}
      </div>
      <p className="mt-2 text-xs font-semibold leading-snug line-clamp-2">{title}</p>
      <p className="mt-1 text-[11px] opacity-70 truncate">{author}</p>
    </button>
  );
};

export default MiniBookCard;
