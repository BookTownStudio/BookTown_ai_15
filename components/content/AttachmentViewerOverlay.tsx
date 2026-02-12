import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAttachmentViewer } from '../../store/attachment-viewer.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { XIcon } from '../icons/XIcon.tsx';
import Button from '../ui/Button.tsx';
import { AttachmentV1 } from '../../types/entities.ts';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { DownloadIcon } from '../icons/DownloadIcon.tsx';
import { AttachmentAnalytics } from '../../lib/media/AttachmentAnalytics.ts';
import { useAttachmentUrl } from '../../lib/hooks/useAttachmentUrl.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

const AttachmentViewerOverlay: React.FC = () => {
    const { lang } = useI18n();
    const { activeAttachment, closeViewer } = useAttachmentViewer();

    const isV1 = activeAttachment && 'attachmentId' in activeAttachment;
    const v1 = activeAttachment as AttachmentV1;
    
    // ATTACHMENT_SECURITY_V1: Fullscreen-scoped secure URL
    const { data: secureUrl, isLoading: isResolving } = useAttachmentUrl(v1?.attachmentId, 'feed');

    // Analytics: Track Opened
    useEffect(() => {
        if (activeAttachment) {
            AttachmentAnalytics.track('attachment_opened', activeAttachment, 'feed');
        }
    }, [activeAttachment]);

    if (!activeAttachment) return null;

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        AttachmentAnalytics.track('attachment_downloaded', activeAttachment, 'feed');
        if (secureUrl?.url) {
            window.open(secureUrl.url, '_blank');
        }
    };

    const renderContent = () => {
        if (!isV1) return <div className="text-white">Viewer unavailable for legacy types.</div>;

        if (isResolving) {
            return <LoadingSpinner className="h-10 w-10" />;
        }

        if (!secureUrl) {
            return <div className="text-red-400 font-bold">Secure access denied</div>;
        }

        switch (v1.type) {
            case 'IMAGE':
                return (
                    <motion.img 
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        src={secureUrl.url} 
                        alt="" 
                        className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm" 
                    />
                );
            case 'VIDEO':
                return (
                    <div className="aspect-video w-full max-w-4xl bg-black rounded-lg overflow-hidden flex items-center justify-center">
                        <PlayIcon className="h-20 w-20 text-white/20" />
                        <div className="absolute inset-0 flex items-center justify-center">
                             <p className="text-white/50 text-sm font-medium">Video Player Placeholder</p>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="bg-slate-800 p-8 rounded-2xl border border-white/10 text-center max-w-sm">
                        <p className="text-white font-bold">{v1.type}</p>
                        <p className="text-white/60 text-sm mt-2">Enhanced viewer coming soon.</p>
                    </div>
                );
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl">
                {/* Backdrop Click */}
                <div className="absolute inset-0" onClick={closeViewer} />

                {/* Header Actions */}
                <header className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-6 z-10">
                    <Button variant="icon" onClick={closeViewer} className="bg-white/10 !text-white hover:bg-white/20">
                        <XIcon className="h-6 w-6" />
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={handleDownload} className="!text-white/70 hover:!text-white !bg-white/5" disabled={isResolving || !secureUrl}>
                            <DownloadIcon className="h-5 w-5 mr-2" />
                            {lang === 'en' ? 'Download' : 'تحميل'}
                        </Button>
                    </div>
                </header>

                {/* Content */}
                <div className="relative z-10 p-4 w-full flex items-center justify-center">
                    {renderContent()}
                </div>

                {/* Footer Info */}
                {isV1 && (
                    <footer className="absolute bottom-10 left-0 right-0 text-center z-10 px-8">
                        <div className="inline-block px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
                                {v1.type} • {new Date(v1.metadata.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                    </footer>
                )}
            </div>
        </AnimatePresence>
    );
};

export default AttachmentViewerOverlay;