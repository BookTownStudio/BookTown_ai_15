import React, { useEffect, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import Button from '../../components/ui/Button.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { EyeIcon } from '../../components/icons/EyeIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { useToast } from '../../store/toast.tsx';
import GlassCard from '../../components/ui/GlassCard.tsx';

const ProjectPublishedScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [animate, setAnimate] = useState(false);

    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const releaseId = currentView.type === 'immersive' && typeof currentView.params?.releaseId === 'string'
        ? currentView.params.releaseId
        : '';
    const publishTarget = currentView.type === 'immersive' &&
        (currentView.params?.publishTarget === 'blog' || currentView.params?.publishTarget === 'ebook')
        ? currentView.params.publishTarget
        : undefined;
    const bookId = currentView.type === 'immersive' && typeof currentView.params?.bookId === 'string'
        ? currentView.params.bookId
        : '';
    const publicationId = currentView.type === 'immersive' && typeof currentView.params?.publicationId === 'string'
        ? currentView.params.publicationId
        : '';
    const title = currentView.type === 'immersive' && typeof currentView.params?.title === 'string'
        ? currentView.params.title
        : (lang === 'en' ? 'Published Work' : 'عمل منشور');
    const coverUrl = currentView.type === 'immersive' && typeof currentView.params?.coverUrl === 'string'
        ? currentView.params.coverUrl
        : undefined;

    useEffect(() => {
        setAnimate(true);
    }, []);

    const handleBackToStudio = () => {
        navigate({ type: 'tab', id: 'write' });
    };

    const handlePrimaryAction = () => {
        if (publishTarget === 'ebook' && bookId) {
            navigate({ type: 'immersive', id: 'reader', params: { bookId } });
            return;
        }

        if (publishTarget === 'blog' && publicationId) {
            navigate({
                type: 'immersive',
                id: 'publicationReader',
                params: {
                    publicationId,
                    from: currentView,
                },
            });
            return;
        }

        if (projectId && releaseId && publishTarget) {
            navigate({
                type: 'immersive',
                id: 'projectPreview',
                params: {
                    projectId,
                    releaseId,
                    previewType: publishTarget,
                    from: currentView,
                },
            });
            return;
        }

        showToast(
            lang === 'en'
                ? 'Published state is available, but no follow-up destination was provided.'
                : 'تم حفظ حالة النشر، لكن لا توجد وجهة لاحقة متاحة.'
        );
    };

    if (!publishTarget || !releaseId || !projectId) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-900 text-white">
                <BilingualText>No publication data found.</BilingualText>
                <Button onClick={handleBackToStudio} className="ml-4">Back</Button>
            </div>
        );
    }

    return (
        <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-900 p-6">
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900/20 via-slate-900 to-slate-900" />

            <div className={`relative z-10 flex w-full max-w-lg transform flex-col items-center transition-all duration-700 ${animate ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
                <div className="mb-8 rounded-full bg-green-500/20 p-4 animate-bounce">
                    <CheckCircleIcon className="h-16 w-16 text-green-400" />
                </div>

                <BilingualText role="H1" className="!mb-2 !text-4xl !text-white text-center drop-shadow-lg">
                    {lang === 'en' ? 'Published!' : 'تم النشر!'}
                </BilingualText>

                <BilingualText role="Body" className="mb-8 text-center text-white/70">
                    {publishTarget === 'ebook'
                        ? (
                            lang === 'en'
                                ? 'Your ebook release is now bound to a native readable BookTown book.'
                                : 'أصبحت نسخة الكتاب الإلكتروني مرتبطة الآن بكتاب أصلي قابل للقراءة داخل بوكتاون.'
                        )
                        : (
                            lang === 'en'
                                ? 'Your longform blog release is now bound to BookTown’s internal publication domain.'
                                : 'تم الآن ربط نسخة المدونة الطويلة بنطاق النشر الداخلي في بوكتاون.'
                        )}
                </BilingualText>

                <GlassCard className="mb-8 flex w-full flex-col items-center border border-white/10 bg-white/5 p-6">
                    <div className="mb-4 h-48 w-32 overflow-hidden rounded bg-slate-800 shadow-2xl">
                        {coverUrl ? (
                            <img src={coverUrl} alt="Cover" className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full items-center justify-center">
                                <BookIcon className="h-10 w-10 text-white/20" />
                            </div>
                        )}
                    </div>

                    <BilingualText role="H2" className="!text-xl text-center">{title}</BilingualText>
                    <BilingualText role="Caption" className="mt-1 text-center">
                        {publishTarget === 'ebook' ? 'Ebook' : 'Blog'}
                    </BilingualText>

                    <div className="mt-4 space-y-2 text-center text-xs font-mono text-white/60">
                        <div>release: {releaseId}</div>
                        {bookId ? <div>book: {bookId}</div> : null}
                        {publicationId ? <div>publication: {publicationId}</div> : null}
                    </div>
                </GlassCard>

                <div className="w-full space-y-3">
                    <Button variant="ghost" onClick={handlePrimaryAction} className="w-full border border-white/10 bg-white/10 text-white hover:bg-white/20">
                        <EyeIcon className="mr-2 h-5 w-5" />
                        {publishTarget === 'ebook'
                            ? (lang === 'en' ? 'Open In Reader' : 'فتح في القارئ')
                            : (lang === 'en' ? 'Open Publication' : 'فتح المنشور')}
                    </Button>
                    <Button variant="ghost" onClick={handleBackToStudio} className="w-full text-slate-400 hover:text-white">
                        {lang === 'en' ? 'Back to Studio' : 'العودة للاستوديو'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ProjectPublishedScreen;
