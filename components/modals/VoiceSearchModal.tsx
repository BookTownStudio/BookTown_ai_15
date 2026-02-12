
import React, { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal.tsx';
import Button from '../ui/Button.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { MicIcon } from '../icons/MicIcon.tsx';
import { allowNextMediaRequest } from '../../lib/media/MediaGuard.ts';

interface VoiceSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onResult: (transcript: string) => void;
}

const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({ isOpen, onClose, onResult }) => {
    const { lang } = useI18n();
    const [hasAgreed, setHasAgreed] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');
    const recognitionRef = useRef<any>(null);

    const startRecognition = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert(lang === 'en' ? "Voice search not supported in this browser." : "البحث الصوتي غير مدعوم في هذا المتصفح.");
            handleClose();
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = lang === 'en' ? 'en-US' : 'ar-SA';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
            let final = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            if (final) {
                stopRecognition();
                onResult(final);
            } else {
                setInterimTranscript(interim);
            }
        };

        recognition.onerror = (event: any) => {
            console.error("[VOICE_SEARCH][ERROR]", event);
            stopRecognition();
            setHasAgreed(false);
        };

        recognition.onend = () => setIsListening(false);

        recognitionRef.current = recognition;
        recognition.start();
    };

    const stopRecognition = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    };

    // Trigger hardware ONLY on agreed state change
    useEffect(() => {
        if (isOpen && hasAgreed) {
            startRecognition();
        }
        return () => stopRecognition();
    }, [isOpen, hasAgreed]);

    const handleAllow = () => {
        // Authority: explicit user intent within the modal
        allowNextMediaRequest();
        setHasAgreed(true);
    };

    const handleClose = () => {
        stopRecognition();
        setHasAgreed(false);
        setInterimTranscript('');
        onClose();
    };

    if (!hasAgreed) {
        return (
            <Modal isOpen={isOpen} onClose={handleClose}>
                <div className="text-center p-4">
                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <MicIcon className="w-8 h-8 text-primary" />
                    </div>
                    <BilingualText role="H1" className="!text-2xl mb-4">
                        {lang === 'en' ? 'Voice Input' : 'الإدخال الصوتي'}
                    </BilingualText>
                    <BilingualText role="Body" className="text-slate-600 dark:text-slate-300 mb-8">
                        {lang === 'en' 
                            ? "BookTown needs microphone access to use voice search when you choose." 
                            : "يحتاج بوكتاون إلى الوصول إلى الميكروفون لاستخدام البحث الصوتي عندما تختار ذلك."}
                    </BilingualText>
                    <div className="flex flex-col gap-3">
                        <Button variant="primary" onClick={handleAllow} className="w-full !h-12">
                            {lang === 'en' ? 'Enable Microphone' : 'تفعيل الميكروفون'}
                        </Button>
                        <Button variant="ghost" onClick={handleClose} className="w-full">
                            {lang === 'en' ? 'Not Now' : 'ليس الآن'}
                        </Button>
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose}>
            <div className="text-center py-6">
                <div className="relative mb-8 flex justify-center">
                    <div className="absolute inset-0 flex items-center justify-center">
                         <div className="w-24 h-24 bg-primary/20 rounded-full animate-ping opacity-25"></div>
                    </div>
                    <div className="relative z-10 w-20 h-20 bg-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
                        <MicIcon className="w-10 h-10" />
                    </div>
                </div>

                <BilingualText role="H2" className="mb-2">
                    {lang === 'en' ? 'Listening...' : 'جاري الاستماع...'}
                </BilingualText>
                
                <div className="min-h-[4rem] px-4 italic text-slate-500 dark:text-slate-400">
                    {interimTranscript || (lang === 'en' ? "Say something..." : "قل شيئاً...")}
                </div>

                <div className="mt-10">
                    <Button variant="ghost" onClick={handleClose} className="!text-red-500 hover:!bg-red-500/10">
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default VoiceSearchModal;
