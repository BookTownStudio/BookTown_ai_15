import React, { useEffect, useRef, useState } from 'react';
import { Shelf, Book } from '../../types/entities.ts';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { ChevronDownIcon } from '../icons/ChevronDownIcon.tsx';
import { VerticalEllipsisIcon } from '../icons/VerticalEllipsisIcon.tsx';
import Button from '../ui/Button.tsx';
import { ShelvesIcon } from '../icons/ShelvesIcon.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import { EditIcon } from '../icons/EditIcon.tsx';
import { BookPlusIcon } from '../icons/BookPlusIcon.tsx';
import { ViewListIcon } from '../icons/ViewListIcon.tsx';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { DuplicateIcon } from '../icons/DuplicateIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { isSystemShelf } from '../../lib/shelves/systemShelves.ts';

interface ShelfHeaderProps {
  shelf: Shelf;
  bookCount: number;
  coverUrl?: string;
  isOpen: boolean;
  onToggle: () => void;

  /* controlled menu */
  isMenuOpen: boolean;
  onToggleMenu: () => void;

  onAddBookRequest?: () => void;
  onEditRequest?: () => void;
  onShareRequest?: () => void;
  onDeleteRequest?: () => void;
  onDuplicateRequest?: (shelf: Shelf) => void;
  onToggleLayout?: () => void;

  isDeletable: boolean;
  isLoading: boolean;
  books?: Book[];
}

const ShelfHeader: React.FC<ShelfHeaderProps> = ({
  shelf,
  bookCount,
  coverUrl,
  isOpen,
  onToggle,
  isMenuOpen,
  onToggleMenu,
  onAddBookRequest,
  onEditRequest,
  onShareRequest,
  onDeleteRequest,
  onDuplicateRequest,
  onToggleLayout,
  isDeletable,
  isLoading,
}) => {
  const { lang, isRTL } = useI18n();
  const [imageError, setImageError] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isProtectedSystemShelf = isSystemShelf(shelf);

  useEffect(() => {
    setImageError(false);
  }, [coverUrl]);

  /* 🔒 Click-outside close (menu stability) */
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onToggleMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, onToggleMenu]);

  const showFallback = !coverUrl || imageError;

  /* 🔒 Canonical action set (Tier-1) */
  const menuItems = [
    onAddBookRequest && {
      labelEn: 'Add Book',
      labelAr: 'إضافة كتاب',
      icon: BookPlusIcon,
      action: onAddBookRequest,
    },

    !isProtectedSystemShelf && onEditRequest && {
      labelEn: 'Edit',
      labelAr: 'تعديل',
      icon: EditIcon,
      action: onEditRequest,
    },

    onDuplicateRequest && {
      labelEn: 'Duplicate',
      labelAr: 'تكرار',
      icon: DuplicateIcon,
      action: () => onDuplicateRequest?.(shelf),
    },

    onToggleLayout && {
      labelEn: 'Toggle Layout',
      labelAr: 'تبديل التخطيط',
      icon: ViewListIcon,
      action: onToggleLayout,
    },

    onShareRequest && {
      labelEn: 'Share',
      labelAr: 'مشاركة',
      icon: ShareIcon,
      action: onShareRequest,
    },

    // 🔒 Delete disabled for system shelves
    !isProtectedSystemShelf && isDeletable && onDeleteRequest && {
      labelEn: 'Delete',
      labelAr: 'حذف',
      icon: TrashIcon,
      action: onDeleteRequest,
      destructive: true,
    },
  ].filter(Boolean) as {
    labelEn: string;
    labelAr: string;
    icon: React.FC<any>;
    action?: () => void;
    destructive?: boolean;
  }[];

  return (
    <div className="relative w-full">
      <GlassCard
        onClick={() => {
          if (!isMenuOpen) onToggle();
        }}
        className={cn(
          'group !p-4 !rounded-xl cursor-pointer transition-all duration-300',
          'bg-white/5 dark:bg-white/5 border border-black/5 dark:border-white/10',
          'hover:bg-white/10 dark:hover:bg-white/10 active:scale-[0.99]',
          isOpen && 'ring-2 ring-primary/20'
        )}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Cover */}
          <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800 flex items-center justify-center border border-white/5 shadow-inner">
            {showFallback ? (
              <ShelvesIcon className="w-6 h-6 text-slate-500" />
            ) : (
              <img
                src={coverUrl}
                alt="Shelf cover"
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            )}
          </div>

          {/* Title */}
          <div className="flex-grow min-w-0">
            <BilingualText className="text-lg font-bold truncate leading-tight">
              {lang === 'en' ? shelf.titleEn : shelf.titleAr}
            </BilingualText>

            {!isLoading && (
              <BilingualText
                role="Caption"
                className="mt-0.5 !text-[11px] uppercase tracking-wider font-bold text-slate-400"
              >
                {bookCount}{' '}
                {lang === 'en'
                  ? bookCount === 1 ? 'book' : 'books'
                  : 'كتاب'}
              </BilingualText>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <ChevronDownIcon
              className={cn(
                'h-5 w-5 transition-transform duration-300',
                isOpen && 'rotate-180',
                'text-slate-500 dark:text-white/40'
              )}
            />

            {menuItems.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleMenu();
                }}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label="Shelf options"
              >
                <VerticalEllipsisIcon className="h-5 w-5 text-slate-400" />
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Action Menu */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className={cn(
            'absolute z-30 mt-2 w-56 animate-fade-in-up',
            isRTL ? 'left-0' : 'right-0'
          )}
        >
          <GlassCard className="!p-1.5 shadow-2xl border-white/10 bg-slate-900/95 backdrop-blur-xl">
            <ul className="space-y-0.5">
              {menuItems.map((item, idx) => (
                <li key={idx}>
                  <button
                    className={cn(
                      'w-full flex items-center justify-start gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
                      item.destructive
                        ? 'text-red-400 hover:bg-red-500/10'
                        : 'text-slate-200 hover:bg-white/10'
                    )}
                    onClick={(e) => {
                      e.stopPropagation(); // 🔒 critical
                      item.action?.();
                      onToggleMenu();
                    }}
                  >
                    <item.icon className="h-4 w-4 opacity-70" />
                    <span className="font-medium">
                      {lang === 'en' ? item.labelEn : item.labelAr}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

export default ShelfHeader;
