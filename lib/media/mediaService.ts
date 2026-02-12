
import { MediaCategory, MEDIA_CONFIGS, UploadOptions } from './types';
import { optimizeImage } from './imageOptimizer';
import { StorageAdapter } from './storageAdapter';

export class MediaService {
    private adapter: StorageAdapter;

    constructor(adapter: StorageAdapter) {
        this.adapter = adapter;
    }

    /**
     * Main entry point for media uploads.
     * Validates, optimizes, and uploads the file.
     */
    async uploadMedia(
        uid: string,
        file: File,
        options: UploadOptions
    ): Promise<string> {
        const { category, id, onProgress } = options;

        // 1. Validation
        if (!file.type.startsWith('image/')) {
            throw new Error('Invalid file type. Only images are allowed.');
        }
        
        // 20MB Hard Limit pre-optimization check (optimization will reduce this significantly)
        if (file.size > 20 * 1024 * 1024) {
            throw new Error('File too large. Max 20MB.');
        }

        // 2. Optimization
        const config = MEDIA_CONFIGS[category];
        const optimizedBlob = await optimizeImage(file, config);

        // 3. Path Construction
        const timestamp = Date.now();
        const ext = config.format === 'image/webp' ? 'webp' : 'jpg';
        const filename = `${category}_${timestamp}.${ext}`;
        
        // Folder structure: users/{uid}/{category}/{id?}/{filename}
        let path = `users/${uid}/${category}/`;
        if (id) path += `${id}/`;
        path += filename;

        // 4. Upload
        return this.adapter.upload(path, optimizedBlob, onProgress);
    }
}
