
export type MediaCategory = 'cover' | 'banner' | 'avatar' | 'post' | 'venue' | 'misc' | 'attachment';

export interface OptimizationConfig {
    maxWidth: number;
    maxHeight: number;
    quality: number; // 0.0 to 1.0
    format: 'image/jpeg' | 'image/webp' | 'image/png';
}

export interface UploadOptions {
    category: MediaCategory;
    id?: string; // Optional context ID (projectId, userId, etc.)
    onProgress?: (progress: number) => void;
}

export const MEDIA_CONFIGS: Record<MediaCategory, OptimizationConfig> = {
    cover: { maxWidth: 1600, maxHeight: 2400, quality: 0.85, format: 'image/jpeg' },
    banner: { maxWidth: 2000, maxHeight: 800, quality: 0.85, format: 'image/jpeg' },
    avatar: { maxWidth: 400, maxHeight: 400, quality: 0.9, format: 'image/jpeg' },
    post: { maxWidth: 1200, maxHeight: 1200, quality: 0.8, format: 'image/jpeg' },
    venue: { maxWidth: 1200, maxHeight: 800, quality: 0.8, format: 'image/jpeg' },
    attachment: { maxWidth: 1600, maxHeight: 1600, quality: 0.8, format: 'image/jpeg' },
    misc: { maxWidth: 1024, maxHeight: 1024, quality: 0.8, format: 'image/jpeg' }
};

/**
 * ATTACHMENT_UPLOAD_CONTRACT_V1 Size Limits (MB)
 * Synchronized with the locked specification.
 */
export const UPLOAD_LIMITS_MB = {
    IMAGE: 10,
    VIDEO: 150,
    AUDIO: 50,
    DOCUMENT: 25,
    EBOOK: 50,
    EXTERNAL_LINK: 0
};
