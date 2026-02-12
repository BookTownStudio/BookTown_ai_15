
import React, { useRef, useEffect, useState } from 'react';
import Modal from '../ui/Modal.tsx';
import Button from '../ui/Button.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { CameraIcon } from '../icons/CameraIcon.tsx';
import { allowNextMediaRequest } from '../../lib/media/MediaGuard.ts';

interface CameraCaptureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (base64Image: string) => void;
}

const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({ isOpen, onClose, onCapture }) => {
    const { lang } = useI18n();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasAgreedToCamera, setHasAgreedToCamera] = useState(false);

    // Hardware lifecycle management - Only triggered after explicit user agreement
    useEffect(() => {
        if (isOpen && hasAgreedToCamera) {
            startCamera();
        }
        return () => stopCamera();
    }, [isOpen, hasAgreedToCamera]);

    const startCamera = async () => {
        setError(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Camera access denied or error:", err);
            setError(lang === 'en' ? "Could not access camera. Please check permissions." : "تعذر الوصول للكاميرا. يرجى التحقق من الأذونات.");
            setHasAgreedToCamera(false);
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const handleCapture = () => {
        if (!videoRef.current) return;
        
        setIsProcessing(true);
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            onCapture(base64);
        }
    };

    const handleAllowCamera = () => {
        // Authority: explicit user intent within the modal
        allowNextMediaRequest();
        setHasAgreedToCamera(true);
    }

    const handleClose = () => {
        setHasAgreedToCamera(false);
        onClose();
    };

    // Pre-hardware Explanation View (MEDIA_PERMISSION_REQUEST_POLICY_V1)
    if (!hasAgreedToCamera) {
        return (
            <Modal isOpen={isOpen} onClose={handleClose}>
                <div className="text-center p-4">
                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CameraIcon className="w-8 h-8 text-primary" />
                    </div>
                    <BilingualText role="H1" className="!text-2xl mb-4">
                        {lang === 'en' ? 'Camera Access' : 'الوصول للكاميرا'}
                    </BilingualText>
                    <BilingualText role="Body" className="text-slate-600 dark:text-slate-300 mb-8">
                        {lang === 'en' 
                            ? "BookTown needs camera access to scan book covers and identify titles." 
                            : "يحتاج بوكتاون إلى الوصول إلى الكاميرا لمسح أغلفة الكتب والتعرف على العناوين."}
                    </BilingualText>
                    <div className="flex flex-col gap-3">
                        <Button variant="primary" onClick={handleAllowCamera} className="w-full !h-12">
                            {lang === 'en' ? 'Allow Camera' : 'السماح بالكاميرا'}
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
            <div className="text-center">
                <BilingualText role="H1" className="!text-xl mb-4">
                    {lang === 'en' ? 'Scan Book Cover' : 'مسح غلاف الكتاب'}
                </BilingualText>

                <div className="relative bg-black rounded-xl overflow-hidden aspect-[3/4] mb-4 shadow-inner ring-1 ring-white/10">
                    {error ? (
                        <div className="flex flex-col items-center justify-center h-full text-white/70 p-6">
                            <p className="mb-4 text-sm">{error}</p>
                            <Button variant="ghost" className="!text-accent" onClick={startCamera}>
                                {lang === 'en' ? 'Try Again' : 'إعادة المحاولة'}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {!stream && (
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                    <LoadingSpinner />
                                </div>
                            )}
                            <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                className={`w-full h-full object-cover transition-opacity duration-500 ${stream ? 'opacity-100' : 'opacity-0'}`} 
                            />
                            {stream && !isProcessing && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-3/4 h-3/4 border-2 border-white/50 rounded-lg relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                                        <div className="absolute -top-8 left-0 right-0 text-center">
                                            <BilingualText role="Caption" className="text-white bg-black/50 px-2 py-1 rounded inline-block">
                                                {lang === 'en' ? 'Align book cover' : 'قم بمحاذاة غلاف الكتاب'}
                                            </BilingualText>
                                        </div>
                                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-accent rounded-tl-md"></div>
                                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-accent rounded-tr-md"></div>
                                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-accent rounded-bl-md"></div>
                                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-accent rounded-br-md"></div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    
                    {isProcessing && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10">
                            <LoadingSpinner />
                            <BilingualText className="text-white mt-4 font-bold">
                                {lang === 'en' ? 'Identifying...' : 'جاري التعرف...'}
                            </BilingualText>
                        </div>
                    )}
                </div>

                <div className="flex justify-center gap-4">
                    <Button variant="ghost" onClick={handleClose}>
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                    {!error && stream && (
                        <Button variant="primary" onClick={handleCapture} disabled={isProcessing}>
                            <CameraIcon className="w-5 h-5 mr-2" />
                            {lang === 'en' ? 'Capture' : 'التقاط'}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default CameraCaptureModal;
