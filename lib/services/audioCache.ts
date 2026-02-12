
export const CACHE_NAME = 'booktown-audio-cache-v1';

export const audioCacheService = {
    /**
     * Generate a unique cache key for a book segment
     */
    generateKey: (bookId: string, segmentIndex: number) => {
        return `https://booktown-local.cache/${bookId}/segment_${segmentIndex}.wav`;
    },

    /**
     * Save an audio Blob to the cache
     */
    save: async (bookId: string, segmentIndex: number, audioBlob: Blob) => {
        try {
            const cache = await caches.open(CACHE_NAME);
            const key = audioCacheService.generateKey(bookId, segmentIndex);
            const response = new Response(audioBlob, {
                headers: { 'Content-Type': 'audio/wav' }
            });
            await cache.put(key, response);
            console.log(`[AudioCache] Saved segment ${segmentIndex} for book ${bookId}`);
        } catch (e) {
            console.error('[AudioCache] Failed to save audio:', e);
        }
    },

    /**
     * Retrieve an audio Blob URL from the cache if it exists
     */
    get: async (bookId: string, segmentIndex: number): Promise<string | null> => {
        try {
            const cache = await caches.open(CACHE_NAME);
            const key = audioCacheService.generateKey(bookId, segmentIndex);
            const response = await cache.match(key);
            
            if (response) {
                const blob = await response.blob();
                console.log(`[AudioCache] Hit segment ${segmentIndex} for book ${bookId}`);
                return URL.createObjectURL(blob);
            }
        } catch (e) {
            console.error('[AudioCache] Failed to retrieve audio:', e);
        }
        return null;
    },

    /**
     * Check if a segment exists
     */
    has: async (bookId: string, segmentIndex: number): Promise<boolean> => {
        try {
            const cache = await caches.open(CACHE_NAME);
            const key = audioCacheService.generateKey(bookId, segmentIndex);
            const response = await cache.match(key);
            return !!response;
        } catch {
            return false;
        }
    }
};
