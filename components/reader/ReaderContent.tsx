import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReadingPreferences } from '../../store/reading-prefs.tsx';
import { cn } from '../../lib/utils.ts';

type ContentMode = 'text' | 'pdf';

interface ReaderContentProps {
  content: string;
  contentMode?: ContentMode;

  onTap: (zone: 'left' | 'center' | 'right') => void;
  onSelectText: (text: string, rect: DOMRect) => void;
  onScrollChange: (percent: number) => void;
  onPagesCalculated: (totalPages: number) => void;
  onPageChange: (page: number) => void;

  currentPage: number;
  initialScrollPercent?: number;
}

const ReaderContent: React.FC<ReaderContentProps> = ({
  content,
  contentMode = 'text',
  onTap,
  onSelectText,
  onScrollChange,
  onPagesCalculated,
  onPageChange,
  currentPage,
  initialScrollPercent,
}) => {
  const { readingMode, fontSize, theme, fontStyle } = useReadingPreferences();
  const contentRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [isCalculating, setIsCalculating] = useState(true);

  // Selection State
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  // Typography Settings Map matching Tailwind config
  const TYPOGRAPHY = {
    xs: { size: 'text-sm', leading: 'leading-6', tracking: 'tracking-normal', maxWidth: 'max-w-2xl' },
    sm: { size: 'text-base', leading: 'leading-7', tracking: 'tracking-normal', maxWidth: 'max-w-2xl' },
    md: { size: 'text-lg', leading: 'leading-8', tracking: 'tracking-normal', maxWidth: 'max-w-3xl' },
    lg: { size: 'text-xl', leading: 'leading-9', tracking: 'tracking-wide', maxWidth: 'max-w-3xl' },
    xl: { size: 'text-2xl', leading: 'leading-10', tracking: 'tracking-wide', maxWidth: 'max-w-4xl' },
  };

  const currentType = TYPOGRAPHY[fontSize];
  const fontClass = fontStyle === 'dyslexic' ? 'font-sans' : 'font-serif';

  const themeColors = {
    light: 'text-slate-900 selection:bg-yellow-200',
    dark: 'text-slate-200 selection:bg-sky-900',
    sepia: 'text-[#433422] selection:bg-[#D6CDB8]',
  };

  // ------------------------------------------------------------
  // PDF MODE: render iframe + disable text selection/pagination
  // ------------------------------------------------------------
  useEffect(() => {
    if (contentMode !== 'pdf') return;

    setIsCalculating(false);
    setPages([]);
    onPagesCalculated(1);
    onPageChange(1);
    onScrollChange(0);
    // selection disabled implicitly by not wiring pointer handlers for PDF
  }, [contentMode, onPagesCalculated, onPageChange, onScrollChange]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (contentMode !== 'text') return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (contentMode !== 'text') return;

    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';

    const isDrag =
      pointerDownPos.current &&
      (Math.abs(e.clientX - pointerDownPos.current.x) > 10 ||
        Math.abs(e.clientY - pointerDownPos.current.y) > 10);

    if (text && isDrag && text.length > 0) {
      const range = selection!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      onSelectText(text, rect);
    } else {
      if (!isDrag) {
        onSelectText('', new DOMRect());
        const { clientX, currentTarget } = e;
        const { left, width } = currentTarget.getBoundingClientRect();
        const third = width / 3;

        if (clientX < left + third) onTap('left');
        else if (clientX > left + 2 * third) onTap('right');
        else onTap('center');
      }
    }
    pointerDownPos.current = null;
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (contentMode !== 'text') return;
    if (readingMode !== 'scroll') return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const percent = scrollTop / (scrollHeight - clientHeight);
    onScrollChange(isNaN(percent) ? 0 : percent);
  };

  // --- Pagination Logic (TEXT ONLY) ---
  useLayoutEffect(() => {
    if (contentMode !== 'text') {
      setIsCalculating(false);
      return;
    }

    if (readingMode !== 'page' || !contentRef.current) {
      setIsCalculating(false);
      return;
    }

    setIsCalculating(true);
    const container = contentRef.current;

    const measureDiv = document.createElement('div');
    measureDiv.style.visibility = 'hidden';
    measureDiv.style.position = 'absolute';
    measureDiv.style.whiteSpace = 'pre-wrap';
    measureDiv.style.width = `${container.clientWidth - 48}px`;
    measureDiv.className = `${currentType.size} ${currentType.leading} ${currentType.tracking} ${fontClass}`;
    document.body.appendChild(measureDiv);

    const testString = 'The quick brown fox jumps over the lazy dog. ';
    measureDiv.textContent = testString;
    const lineHeight = measureDiv.clientHeight;
    const containerHeight = container.clientHeight - 80;

    const linesPerPage = Math.floor(containerHeight / (lineHeight || 24));
    const charsPerLine = Math.floor(container.clientWidth / 10);
    const charsPerPage = Math.floor(linesPerPage * charsPerLine * 1.8);

    document.body.removeChild(measureDiv);

    if (charsPerPage <= 0) {
      setPages([content]);
      onPagesCalculated(1);
      setIsCalculating(false);
      return;
    }

    const newPages: string[] = [];
    let remainingText = content;

    while (remainingText.length > 0) {
      if (remainingText.length <= charsPerPage) {
        newPages.push(remainingText);
        break;
      }

      let sliceIndex = charsPerPage;
      const nextPara = remainingText.indexOf('\n\n', sliceIndex - 100);
      if (nextPara !== -1 && nextPara < sliceIndex + 100) {
        sliceIndex = nextPara + 2;
      } else {
        const lastSpace = remainingText.lastIndexOf(' ', sliceIndex);
        if (lastSpace > 0) sliceIndex = lastSpace;
      }

      newPages.push(remainingText.substring(0, sliceIndex));
      remainingText = remainingText.substring(sliceIndex).trim();
    }

    setPages(newPages);
    onPagesCalculated(newPages.length);
    setIsCalculating(false);
  }, [contentMode, readingMode, content, fontSize, theme, fontStyle, onPagesCalculated]);

  // Initial Scroll Restoration (TEXT ONLY)
  useEffect(() => {
    if (contentMode !== 'text') return;
    if (readingMode === 'scroll' && initialScrollPercent && contentRef.current) {
      const { scrollHeight, clientHeight } = contentRef.current;
      contentRef.current.scrollTop = initialScrollPercent * (scrollHeight - clientHeight);
    }
  }, [contentMode, readingMode]);

  // ------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------
  if (contentMode === 'pdf') {
    return (
      <main className={cn('flex-grow overflow-hidden relative transition-colors duration-300', themeColors[theme])}>
        <iframe
          title="Book PDF"
          src={content}
          className="w-full h-full border-0"
          loading="eager"
        />
      </main>
    );
  }

  return (
    <main
      className={cn(
        'flex-grow overflow-hidden relative cursor-text select-text transition-colors duration-300',
        themeColors[theme]
      )}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {readingMode === 'scroll' ? (
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className={cn(
            'h-full overflow-y-auto px-6 md:px-12 py-8 mx-auto scroll-smooth',
            currentType.size,
            currentType.leading,
            currentType.tracking,
            fontClass,
            currentType.maxWidth
          )}
        >
          {content.split('\n').map((paragraph, i) => (
            <p key={i} className="mb-6 indent-8">
              {paragraph}
            </p>
          ))}
          <div className="h-32" />
        </div>
      ) : (
        <div ref={contentRef} className="h-full w-full relative overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={cn(
                'absolute inset-0 px-6 md:px-16 py-8 mx-auto',
                currentType.size,
                currentType.leading,
                currentType.tracking,
                fontClass,
                currentType.maxWidth
              )}
            >
              {!isCalculating &&
                pages[currentPage - 1]?.split('\n').map((paragraph, i) => (
                  <p key={i} className="mb-6 indent-8">
                    {paragraph}
                  </p>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </main>
  );
};

export default ReaderContent;