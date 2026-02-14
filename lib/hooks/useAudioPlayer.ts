import { useState, useEffect, useRef, useCallback } from 'react';
import { generateSpeech } from '../../services/geminiService.ts';
import { pcmToWav } from '../utils.ts';
import { audioCacheService } from '../services/audioCache.ts';
import { useProgressSync } from './useProgressSync.ts';
import { allowNextMediaRequest } from '../media/MediaGuard.ts';

export interface AudioPlayerState {
    isPlaying: boolean;
    duration: number;
    currentTime: number;
    playbackRate: number;
    volume: number;
    isLoading: boolean;
    error: string | null;
    currentSegmentIndex: number;
    totalSegments: number;
}

/**
 * useAudioPlayer
 * Authoritative hook for TTS playback.
 * Enforces MEDIA_PERMISSION_GUARD_V1 by deferring Audio object
 * creation until explicit user "play" intent.
 */
export const useAudioPlayer = (bookId: string | undefined, initialSrc?: string) => {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playlist, setPlaylist] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTTSMode, setIsTTSMode] = useState(false);
    
    // Local URL cache to avoid re-creating object URLs for the same session
    const activeUrls = useRef<Record<number, string>>({});

    const { mutate: syncProgress } = useProgressSync();

    const [state, setState] = useState<AudioPlayerState>({
        isPlaying: false,
        duration: 0,
        currentTime: 0,
        playbackRate: 1.0,
        volume: 1.0,
        isLoading: false,
        error: null,
        currentSegmentIndex: 0,
        totalSegments: 0
    });

    // --- Lazy Audio Instance Authority ---
    const getAudioInstance = useCallback(() => {
        if (audioRef.current) return audioRef.current;

        console.log("[AUDIO][LAZY_INIT] Direct user action detected. Initializing Audio context.");
        
        // Authority: Bypass guard for user action
        allowNextMediaRequest();
        
        const audio = new Audio();
        audio.preload = 'auto';

        const setAudioData = () => setState(prev => ({ ...prev, duration: audio.duration || 0, isLoading: false }));
        const setAudioTime = () => setState(prev => ({ ...prev, currentTime: audio.currentTime }));
        
        const setAudioEnded = () => {
            if (isTTSMode && currentIndex < playlist.length - 1) {
                setCurrentIndex(prev => prev + 1);
            } else {
                setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
            }
        };
        
        const setAudioError = (e: any) => {
            console.error("Audio Error:", e);
            setState(prev => ({ ...prev, isLoading: false, isPlaying: false, error: "Playback error" }));
        };

        audio.addEventListener('loadedmetadata', setAudioData);
        audio.addEventListener('timeupdate', setAudioTime);
        audio.addEventListener('ended', setAudioEnded);
        audio.addEventListener('error', setAudioError);
        audio.addEventListener('waiting', () => setState(prev => ({ ...prev, isLoading: true })));
        audio.addEventListener('playing', () => setState(prev => ({ ...prev, isLoading: false, isPlaying: true })));

        audioRef.current = audio;
        return audio;
    }, [isTTSMode, currentIndex, playlist.length]);

    // --- Cleanup logic ---
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current = null;
            }
            // Cleanup URLs
            Object.values(activeUrls.current).forEach(url => URL.revokeObjectURL(url as string));
        };
    }, []);

    // --- Helper: Decode Base64/Bytes to Blob URL ---
    const processAudioBytes = useCallback((bytes: Uint8Array): Blob => {
        const int16Data = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }
        return pcmToWav(float32Data, 24000);
    }, []);

    // --- Sync Progress Effect ---
    useEffect(() => {
        if (!bookId || !isTTSMode) return;
        if (!state.isPlaying || (state.currentTime > 0 && state.currentTime < 1)) {
             syncProgress({
                bookId,
                progress: {
                    currentSegmentIndex: currentIndex,
                    currentTime: state.currentTime,
                    totalProgressPercent: (currentIndex / (playlist.length || 1)) * 100,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }, [state.isPlaying, currentIndex, bookId, isTTSMode, syncProgress]);


    // --- Fetch Logic with Cache ---
    const getAudioUrlForSegment = useCallback(async (index: number): Promise<string | null> => {
        if (!playlist[index] || !bookId) return null;

        if (activeUrls.current[index]) {
            return activeUrls.current[index];
        }

        const cachedUrl = await audioCacheService.get(bookId, index);
        if (cachedUrl) {
            activeUrls.current[index] = cachedUrl;
            return cachedUrl;
        }

        try {
            const bytes = await generateSpeech(playlist[index]);
            if (bytes) {
                const blob = processAudioBytes(bytes);
                await audioCacheService.save(bookId, index, blob);
                const url = URL.createObjectURL(blob);
                activeUrls.current[index] = url;
                return url;
            }
        } catch (e) {
            console.error(`Failed to fetch audio for segment ${index}`, e);
        }
        return null;
    }, [playlist, bookId, processAudioBytes]);


    // --- Playback Logic ---
    useEffect(() => {
        const loadAndPlay = async () => {
            if (isTTSMode && playlist.length > 0 && bookId) {
                const currentUrl = activeUrls.current[currentIndex];
                const audio = getAudioInstance();

                if (audio && (!currentUrl || audio.src !== currentUrl)) {
                    setState(prev => ({ ...prev, isLoading: true }));
                    const url = await getAudioUrlForSegment(currentIndex);
                    
                    if (url && audioRef.current) { 
                        audioRef.current.src = url;
                        audioRef.current.playbackRate = state.playbackRate;
                        if (state.isPlaying) {
                            audioRef.current.play().catch(e => console.error("Auto-play failed:", e));
                        }
                    } else {
                        setState(prev => ({ ...prev, isLoading: false, error: "Failed to load audio segment" }));
                    }
                }
            }
        };
        loadAndPlay();
    }, [currentIndex, isTTSMode, playlist, bookId, getAudioUrlForSegment, state.isPlaying, state.playbackRate, getAudioInstance]);

    // 2. Lookahead Buffering
    useEffect(() => {
        if (isTTSMode && playlist.length > 0 && bookId) {
            const nextIndex = currentIndex + 1;
            if (nextIndex < playlist.length && !activeUrls.current[nextIndex]) {
                const timer = setTimeout(() => {
                    getAudioUrlForSegment(nextIndex);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, [currentIndex, isTTSMode, playlist, bookId, getAudioUrlForSegment]);


    // --- Controls ---
    const loadText = useCallback((text: string) => {
        const sentenceRegex = /[^.!?]+[.!?]+(\s+|$)/g;
        let chunks = text.match(sentenceRegex) || [text];
        const validChunks = chunks.map(s => s.trim()).filter(s => s.length > 0);
        
        setPlaylist(validChunks);
        Object.values(activeUrls.current).forEach(url => URL.revokeObjectURL(url as string));
        activeUrls.current = {};
        
        setCurrentIndex(0);
        setIsTTSMode(true);
        setState(prev => ({ ...prev, isPlaying: true, totalSegments: validChunks.length, currentSegmentIndex: 0, error: null }));
    }, []);

    const togglePlay = useCallback(() => {
        const audio = getAudioInstance();
        if (!audio) return;
        if (state.isPlaying) {
            audio.pause();
            setState(prev => ({ ...prev, isPlaying: false }));
        } else {
            audio.play().catch(e => console.error("Play failed", e));
            setState(prev => ({ ...prev, isPlaying: true }));
        }
    }, [state.isPlaying, getAudioInstance]);

    const seek = useCallback((time: number) => {
        const audio = getAudioInstance();
        if (audio) {
            audio.currentTime = time;
            setState(prev => ({ ...prev, currentTime: time }));
        }
    }, [getAudioInstance]);

    const skipForward = useCallback(() => {
        if (isTTSMode) {
            if (currentIndex < playlist.length - 1) setCurrentIndex(p => p + 1);
        } else {
            seek(state.currentTime + 30);
        }
    }, [isTTSMode, currentIndex, playlist.length, state.currentTime, seek]);

    const skipBackward = useCallback(() => {
        if (isTTSMode) {
            if (currentIndex > 0) setCurrentIndex(p => p - 1);
        } else {
            seek(state.currentTime - 15);
        }
    }, [isTTSMode, currentIndex, state.currentTime, seek]);

    const setPlaybackRate = useCallback((rate: number) => {
        const audio = getAudioInstance();
        if (audio) audio.playbackRate = rate;
        setState(prev => ({ ...prev, playbackRate: rate }));
    }, [getAudioInstance]);

    return {
        ...state,
        currentSegmentIndex: currentIndex,
        loadText,
        togglePlay,
        seek,
        skipForward,
        skipBackward,
        setPlaybackRate
    };
};
