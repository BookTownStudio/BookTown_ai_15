
import React, { useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useAudioPlayer } from '../../lib/hooks/useAudioPlayer.ts';
import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import Button from '../ui/Button.tsx';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { PauseIcon } from '../icons/PauseIcon.tsx';
import { SkipBackIcon } from '../icons/SkipBackIcon.tsx';
import { SkipForwardIcon } from '../icons/SkipForwardIcon.tsx';
import { XIcon } from '../icons/XIcon.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { cn } from '../../lib/utils.ts';
import { motion } from 'framer-motion';

interface AudioPlayerProps {
    bookId?: string;
    audioUrl?: string;
    bookTitle: string;
    chapterTitle?: string;
    onClose: () => void;
    coverUrl?: string;
    initialText?: string;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
    bookId,
    audioUrl, 
    bookTitle, 
    chapterTitle, 
    onClose,
    coverUrl,
    initialText
}) => {
    const { lang, isRTL } = useI18n();
    const { 
        isPlaying, 
        duration, 
        currentTime, 
        playbackRate, 
        isLoading, 
        togglePlay, 
        seek, 
        skipForward, 
        skipBackward, 
        setPlaybackRate,
        loadText
    } = useAudioPlayer(bookId, audioUrl);

    // Initial load effect
    React.useEffect(() => {
        if (initialText && !audioUrl && !isPlaying) {
            loadText(initialText);
        }
    }, [initialText, audioUrl]);

    const formatTime = (time: number) => {
        if (!time || isNaN(time)) return "00:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4"
        >
            <GlassCard className="!p-0 overflow-hidden shadow-2xl !bg-slate-900 border border-white/10 !rounded-3xl">
                {/* Header / Info */}
                <div className="flex items-center justify-between p-4 bg-white/5">
                    <div className="flex items-center gap-4 overflow-hidden">
                        {coverUrl ? (
                            <img src={coverUrl} alt="Cover" className="h-12 w-9 object-cover rounded shadow-md" />
                        ) : (
                            <div className="h-12 w-9 bg-slate-700 rounded flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                            <BilingualText className="font-bold text-sm truncate text-white">{bookTitle}</BilingualText>
                            <BilingualText role="Caption" className="text-white/60 text-xs truncate">
                                {chapterTitle || (lang === 'en' ? 'Reading Aloud' : 'قراءة بصوت عالٍ')}
                            </BilingualText>
                        </div>
                    </div>
                    <Button variant="ghost" onClick={onClose} className="!text-white/60 hover:!text-white !p-2 rounded-full hover:bg-white/10">
                        <XIcon className="h-6 w-6" />
                    </Button>
                </div>

                {/* Main Controls Area */}
                <div className="px-6 py-6 space-y-6">
                     {/* Scrubber */}
                    <div>
                        <div className="relative h-1 bg-white/20 rounded-full">
                             <motion.div 
                                className="absolute top-0 left-0 h-full bg-accent rounded-full" 
                                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                layoutId="scrubber"
                             />
                        </div>
                        <div className="flex justify-between mt-2 text-[10px] font-mono text-white/50">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Transport */}
                    <div className={`flex items-center justify-center gap-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <button onClick={() => skipBackward()} className="text-white/60 hover:text-white transition-colors p-2 active:scale-90">
                            <SkipBackIcon className="h-8 w-8" />
                        </button>

                        <button 
                            onClick={togglePlay}
                            className="h-16 w-16 bg-white text-slate-900 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-white/10"
                        >
                            {isLoading ? (
                                <LoadingSpinner />
                            ) : isPlaying ? (
                                <PauseIcon className="h-8 w-8 fill-current" />
                            ) : (
                                <PlayIcon className="h-8 w-8 fill-current ml-1" />
                            )}
                        </button>

                        <button onClick={() => skipForward()} className="text-white/60 hover:text-white transition-colors p-2 active:scale-90">
                            <SkipForwardIcon className="h-8 w-8" />
                        </button>
                    </div>

                    {/* Speed Toggle */}
                    <div className="flex justify-center">
                        <button 
                            onClick={() => setPlaybackRate(playbackRate >= 2 ? 0.75 : playbackRate + 0.25)}
                            className="text-xs font-bold text-accent bg-accent/10 px-3 py-1 rounded-full hover:bg-accent/20 transition-colors"
                        >
                            {playbackRate}x Speed
                        </button>
                    </div>
                </div>
            </GlassCard>
        </motion.div>
    );
};

export default AudioPlayer;
