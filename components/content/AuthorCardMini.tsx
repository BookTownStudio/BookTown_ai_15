import React, { useState } from 'react';
import { Author } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useToast } from '../../store/toast.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import { ensureCanonicalAuthor } from '../../lib/authors/ensureCanonicalAuthor.ts';

interface AuthorCardMiniProps {
    author: Author;
    mode?: 'navigate' | 'select';
    onSelect?: (author: Author) => void;
}

const AuthorCardMini: React.FC<AuthorCardMiniProps> = ({ author, mode = 'navigate', onSelect }) => {
    const { lang, isRTL } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { showToast } = useToast();
    const [isResolving, setIsResolving] = useState(false);

    const handlePress = async () => {
        if (mode === 'select') {
            onSelect?.(author);
            return;
        }

        if (isResolving) {
            return;
        }

        let authorId = author.id;

        if (author.requiresCanonicalization && author.providerSource && author.providerExternalId) {
            setIsResolving(true);
            try {
                const resolution = await ensureCanonicalAuthor({
                    providerExternalId: author.providerExternalId,
                    source: author.providerSource,
                    rawAuthor: {
                        nameEn: author.nameEn,
                        nameAr: author.nameAr,
                        avatarUrl: author.avatarUrl,
                        bioEn: author.bioEn,
                        bioAr: author.bioAr,
                        lifespan: author.lifespan,
                    },
                });

                const canonicalAuthorId =
                    typeof resolution?.canonicalAuthorId === 'string' && resolution.canonicalAuthorId.trim().length > 0
                        ? resolution.canonicalAuthorId.trim()
                        : '';

                if (!canonicalAuthorId) {
                    throw new Error('CANONICAL_AUTHOR_RESOLUTION_FAILED');
                }

                authorId = canonicalAuthorId;
            } catch (error) {
                console.error('[AUTHOR_CARD_MINI][OPEN_FAILED]', error);
                showToast(lang === 'en' ? 'Failed to open this author.' : 'تعذر فتح هذا المؤلف.');
                return;
            } finally {
                setIsResolving(false);
            }
        }

        navigate({ type: 'immersive', id: 'authorDetails', params: { authorId, from: currentView } });
    };

    return (
        <button type="button" onClick={() => void handlePress()} className="w-full text-left" disabled={isResolving}>
            <GlassCard className="!p-3 hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-200">
                <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''} ${isResolving ? 'opacity-70' : ''}`}>
                    <img src={author.avatarUrl} alt={lang === 'en' ? author.nameEn : author.nameAr} className="h-14 w-14 rounded-full flex-shrink-0" />
                    <div className="flex-grow overflow-hidden">
                        <BilingualText className="font-bold truncate">
                            {lang === 'en' ? author.nameEn : author.nameAr}
                        </BilingualText>
                        <BilingualText role="Caption" className="mt-1 line-clamp-2">
                            {lang === 'en' ? author.bioEn : author.bioAr}
                        </BilingualText>
                    </div>
                </div>
            </GlassCard>
        </button>
    );
};

export default AuthorCardMini;
