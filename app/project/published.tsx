
import React, { useEffect, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import Button from '../../components/ui/Button.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { ShareIcon } from '../../components/icons/ShareIcon.tsx';
import { EyeIcon } from '../../components/icons/EyeIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { PublishedBook } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';
import GlassCard from '../../components/ui/GlassCard.tsx';

const ProjectPublishedScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [animate, setAnimate] = useState(false);

    const publishedBook = currentView.type === 'immersive' ? (currentView.params?.publishedBook as PublishedBook) : undefined;

    useEffect(() => {
        setAnimate(true);
    }, []);

    const handleBackToStudio = () => {
        navigate({ type: 'tab', id: 'write' });
    };

    const handleRead = () => {
        if (publishedBook) {
            // In a real app, you'd navigate to a public reader or the standard reader with the bookId
            // For now, we simulate by going to the reader mock
            navigate({ type: 'immersive', id: 'reader', params: { bookId: publishedBook.projectId, from: currentView } });
        }
    };

    const handleShare = async () => {
        if (!publishedBook) return;

        const shareData = {
            title: publishedBook.title,
            text: `Check out my new book "${publishedBook.title}" on BookTown!`,
            url: window.location.origin + `/book/${publishedBook.id}`, // Mock URL
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                showToast(lang === 'en' ? 'Shared successfully!' : 'تمت المشاركة بنجاح!');
            } catch (err) {
                console.warn('Share canceled');
            }
        } else {
            // Fallback: Copy to clipboard
            navigator.clipboard.writeText(shareData.text + ' ' + shareData.url);
            showToast(lang === 'en' ? 'Link copied to clipboard!' : 'تم نسخ الرابط!');
        }
    };

    if (!publishedBook) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900 text-white">
                <BilingualText>No publication data found.</BilingualText>
                <Button onClick={handleBackToStudio} className="ml-4">Back</Button>
            </div>
        );
    }

    return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 p-6 overflow-hidden relative">
            {/* Background Ambience */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900/20 via-slate-900 to-slate-900 z-0" />
            
            <div className={`relative z-10 flex flex-col items-center max-w-lg w-full transition-all duration-700 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                
                {/* Success Icon */}
                <div className="mb-8 p-4 bg-green-500/20 rounded-full animate-bounce">
                    <CheckCircleIcon className="h-16 w-16 text-green-400" />
                </div>

                <BilingualText role="H1" className="!text-4xl text-center mb-2 !text-white drop-shadow-lg">
                    {lang === 'en' ? 'Published!' : 'تم النشر!'}
                </BilingualText>
                
                <BilingualText role="Body" className="text-center text-white/70 mb-8">
                    {lang === 'en' 
                        ? 'Your book is now live and available to the world.' 
                        : 'كتابك متاح الآن للعالم.'}
                </BilingualText>

                {/* Book Card Preview */}
                <GlassCard className="w-full flex flex-col items-center p-6 bg-white/5 border border-white/10 mb-8">
                    <div className="w-32 h-48 bg-slate-800 rounded shadow-2xl mb-4 overflow-hidden relative">
                        {publishedBook.coverUrl ? (
                            <img src={publishedBook.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex items-center justify-center h-full"><BookIcon className="h-10 w-10 text-white/20"/></div>
                        )}
                        {/* Version Badge */}
                        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-white/80 border border-white/10">
                            v{publishedBook.versionNumber || 1}
                        </div>
                    </div>
                    
                    <BilingualText role="H2" className="!text-xl text-center">{publishedBook.title}</BilingualText>
                    <BilingualText role="Caption" className="text-center mt-1">{publishedBook.authorName}</BilingualText>
                    
                    <div className="flex gap-2 mt-4">
                        {publishedBook.formats.includes('epub') && (
                            <span className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white/60">EPUB</span>
                        )}
                        {publishedBook.formats.includes('pdf') && (
                            <span className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-white/60">PDF</span>
                        )}
                    </div>
                </GlassCard>

                {/* Actions */}
                <div className="w-full space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Button variant="primary" onClick={handleShare} className="!bg-white !text-slate-900 hover:!bg-white/90">
                            <ShareIcon className="h-5 w-5 mr-2" />
                            {lang === 'en' ? 'Share' : 'مشاركة'}
                        </Button>
                        <Button variant="ghost" onClick={handleRead} className="bg-white/10 hover:bg-white/20 text-white border border-white/10">
                            <EyeIcon className="h-5 w-5 mr-2" />
                            {lang === 'en' ? 'Read Now' : 'اقرأ الآن'}
                        </Button>
                    </div>
                    <Button variant="ghost" onClick={handleBackToStudio} className="w-full text-slate-400 hover:text-white">
                        {lang === 'en' ? 'Back to Studio' : 'العودة للاستوديو'}
                    </Button>
                </div>

            </div>
        </div>
    );
};

export default ProjectPublishedScreen;
