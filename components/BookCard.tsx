import React, { useState } from 'react';
// FIX: Add missing '.ts' extension to the import path.
import { Book } from '../types.ts';

interface BookCardProps {
  book: Book;
  shelfId?: string; // ✅ explicit shelf context
}

const stringToHash = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
};

const BookCard: React.FC<BookCardProps> = ({ book, shelfId }) => {
  const imageSeed = stringToHash(book.title);
  const imageUrl = `https://picsum.photos/seed/${imageSeed}/400/600`;

  const [menuOpen, setMenuOpen] = useState(false);

  // ----------------------------------
  // Menu intents (NO domain logic here)
  // ----------------------------------

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    // 🔒 Intentionally no mutation here
    console.log('Remove book:', book.id, 'from shelf:', shelfId);
  };

  const handleMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    // 🔒 Will open MoveBookModal later
    console.log('Move book:', book.id, 'from shelf:', shelfId);
  };

  return (
    <div className="relative bg-slate-800 rounded-lg shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300 ease-in-out flex flex-col">
      
      {/* Ellipsis Menu — ONLY when shelf context exists */}
      {shelfId && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(v => !v);
            }}
            className="p-1.5 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80"
            aria-label="Book actions"
          >
            <svg
              className="w-4 h-4 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-28 rounded-xl shadow-lg bg-slate-900 border border-white/10 overflow-hidden">
              <button
                onClick={handleRemove}
                className="w-full px-3 py-2 text-xs text-left text-white hover:bg-white/10"
              >
                Remove
              </button>
              <button
                onClick={handleMove}
                className="w-full px-3 py-2 text-xs text-left text-white hover:bg-white/10"
              >
                Move
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cover */}
      <img
        className="w-full h-64 object-cover"
        src={imageUrl}
        alt={`Cover for ${book.title}`}
        loading="lazy"
      />

      {/* Content */}
      <div className="p-6 flex flex-col flex-grow">
        <h3 className="text-xl font-bold text-sky-400 mb-2">
          {book.title}
        </h3>
        <p className="text-md text-slate-400 mb-4">
          by {book.author}
        </p>
        <p className="text-slate-300 text-sm flex-grow">
          {book.description}
        </p>
      </div>
    </div>
  );
};

export default BookCard;