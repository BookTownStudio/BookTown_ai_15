
import React from 'react';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { HamburgerIcon } from '../icons/HamburgerIcon.tsx';

interface LibraryNavProps {
    bookCount: number;
    shelfCount: number;
}

const LibraryNav: React.FC<LibraryNavProps> = ({ bookCount, shelfCount }) => {
  const { isRTL, lang } = useI18n();
  const { openDrawer } = useNavigation();

  return (
    <nav className="fixed top-0 left-0 right-0 z-20 bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
        <div className={`container mx-auto flex h-20 items-center px-4 md:px-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {/* Left Section */}
            <div>
                <button aria-label={lang === 'en' ? 'Open menu' : 'افتح القائمة'} onClick={openDrawer} className="p-2">
                    <HamburgerIcon className="h-6 w-6" />
                </button>
            </div>

            {/* Center Section */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <BilingualText role="H1" className="text-xl">
                    {lang === 'en' ? 'Your Library' : 'مكتبتك'}
                </BilingualText>
                 <BilingualText role="Caption">
                    {lang === 'en' 
                        ? `${bookCount} books across ${shelfCount} shelves`
                        : `${bookCount} كتابًا على ${shelfCount} رفوف`}
                </BilingualText>
            </div>

            {/* Right Section (Placeholder) */}
            <div className="w-10"></div>
        </div>
    </nav>
  );
};

export default LibraryNav;
