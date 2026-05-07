
import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useDrafts, useDeleteDraft } from '../../lib/hooks/useDrafts.ts';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import Button from '../../components/ui/Button.tsx';
import { TrashIcon } from '../../components/icons/TrashIcon.tsx';
import { DraftIcon } from '../../components/icons/DraftIcon.tsx';
import { PostAttachment } from '../../types/entities.ts';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { QuoteIcon } from '../../components/icons/QuoteIcon.tsx';
import { MediaIcon } from '../../components/icons/MediaIcon.tsx';
import { ShelvesIcon } from '../../components/icons/ShelvesIcon.tsx';
import { AuthorsIcon } from '../../components/icons/AuthorsIcon.tsx';
import { VenuesIcon } from '../../components/icons/VenuesIcon.tsx';

const AttachmentIcon: React.FC<{ attachment?: PostAttachment }> = ({ attachment }) => {
    if (!attachment) return null;
    let Icon = DraftIcon;
    if (attachment.type === 'book') Icon = BookIcon;
    if (attachment.type === 'publication') Icon = BookIcon;
    if (attachment.type === 'quote') Icon = QuoteIcon;
    if (attachment.type === 'media') Icon = MediaIcon;
    if (attachment.type === 'shelf') Icon = ShelvesIcon;
    if (attachment.type === 'author') Icon = AuthorsIcon;
    if (attachment.type === 'venue') Icon = VenuesIcon;

    return <Icon className="h-4 w-4 text-accent" />;
}

const DraftsScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { data: drafts, isLoading } = useDrafts();
    const { mutate: deleteDraft, isPending: isDeleting } = useDeleteDraft();

    const handleBack = () => {
        navigate(currentView.params?.from || { type: 'tab', id: 'social' });
    };

    const handleDraftClick = (draftId: string) => {
        navigate({ 
            type: 'immersive', 
            id: 'postComposer', 
            params: { draftId, from: currentView } 
        });
    };

    const handleDelete = (e: React.MouseEvent, draftId: string) => {
        e.stopPropagation();
        if (confirm(lang === 'en' ? 'Delete this draft?' : 'حذف هذه المسودة؟')) {
            deleteDraft(draftId);
        }
    };

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Drafts" titleAr="المسودات" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-20">
                <div className="container mx-auto px-4 md:px-8">
                    {isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
                    
                    {!isLoading && drafts && drafts.length === 0 && (
                        <div className="text-center py-16">
                            <DraftIcon className="h-12 w-12 text-slate-600 mx-auto mb-4 opacity-50" />
                            <BilingualText className="text-white/60">
                                {lang === 'en' ? 'No drafts saved.' : 'لا توجد مسودات محفوظة.'}
                            </BilingualText>
                        </div>
                    )}

                    <div className="divide-y divide-white/10">
                        {drafts?.map(draft => (
                            <button 
                                key={draft.id}
                                onClick={() => handleDraftClick(draft.id)}
                                className="w-full text-left py-4 flex items-center justify-between group transition-colors hover:bg-white/5 px-2 rounded-lg -mx-2"
                            >
                                <div className="flex-grow min-w-0 pr-4">
                                    <p className="text-white text-base line-clamp-2 break-words">
                                        {draft.content || (
                                            <span className="text-white/40 italic">
                                                {lang === 'en' ? 'No text...' : 'بلا نص...'}
                                            </span>
                                        )}
                                    </p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-xs text-white/50">
                                            {new Date(draft.updatedAt).toLocaleDateString()}
                                        </span>
                                        {draft.attachment && (
                                            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 border border-accent/20">
                                                <AttachmentIcon attachment={draft.attachment} />
                                                <span className="text-[10px] text-accent uppercase font-bold tracking-wider">
                                                    {draft.attachment.type}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button 
                                    variant="icon" 
                                    disabled={isDeleting}
                                    onClick={(e) => handleDelete(e, draft.id)}
                                    className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex-shrink-0"
                                >
                                    <TrashIcon className="h-5 w-5" />
                                </Button>
                            </button>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DraftsScreen;
