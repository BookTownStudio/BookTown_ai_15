import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import {
    AttachmentMetadataV1,
    AttachmentTypeV1,
    AttachmentV1,
    PostAttachment
} from '../types/entities.ts';

interface AttachmentViewerContextType {
    activeAttachment: PostAttachment | null;
    viewAttachment: (attachment: PostAttachment) => void;
    closeViewer: () => void;
}

const AttachmentViewerContext = createContext<AttachmentViewerContextType | undefined>(undefined);

const ATTACHMENT_TYPES: readonly AttachmentTypeV1[] = [
    'IMAGE',
    'AUDIO',
    'VIDEO',
    'DOCUMENT',
    'LINK',
    'BOOK_REFERENCE',
    'QUOTE_REFERENCE'
];

const readNonEmptyString = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

const readFiniteNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const isAttachmentTypeV1 = (value: unknown): value is AttachmentTypeV1 =>
    typeof value === 'string' && ATTACHMENT_TYPES.includes(value as AttachmentTypeV1);

const normalizeViewerAttachment = (attachment: PostAttachment): PostAttachment => {
    if (!('attachmentId' in attachment)) {
        return attachment;
    }

    const source = attachment as Partial<AttachmentV1> & Record<string, unknown>;
    const attachmentId = readNonEmptyString(source.attachmentId);
    if (!attachmentId) {
        return attachment;
    }

    const typeRaw = readNonEmptyString(source.type);
    const type: AttachmentTypeV1 = isAttachmentTypeV1(typeRaw) ? typeRaw : 'DOCUMENT';

    const sourceMetadataRaw = source.metadata;
    const sourceMetadata =
        sourceMetadataRaw && typeof sourceMetadataRaw === 'object'
            ? (sourceMetadataRaw as Record<string, unknown>)
            : {};

    const sourceTimestampsRaw = source.timestamps;
    const sourceTimestamps =
        sourceTimestampsRaw && typeof sourceTimestampsRaw === 'object'
            ? (sourceTimestampsRaw as Record<string, unknown>)
            : {};

    const uploaderRaw = sourceMetadata.uploader;
    const uploader =
        uploaderRaw && typeof uploaderRaw === 'object'
            ? (uploaderRaw as Record<string, unknown>)
            : {};

    const createdAt =
        readNonEmptyString(sourceMetadata.createdAt) ||
        readNonEmptyString(sourceMetadata.uploadedAt) ||
        readNonEmptyString(sourceTimestamps.createdAt) ||
        readNonEmptyString(source.createdAt);

    const metadata: AttachmentMetadataV1 = {
        attachmentId,
        type,
        mimeType:
            readNonEmptyString(sourceMetadata.mimeType) ||
            readNonEmptyString(source.mimeType) ||
            'application/octet-stream',
        size:
            readFiniteNumber(sourceMetadata.size) ??
            readFiniteNumber(source.size) ??
            0,
        createdAt,
        uploader: {
            uid: readNonEmptyString(uploader.uid),
        },
        storagePath:
            readNonEmptyString(sourceMetadata.storagePath) ||
            readNonEmptyString(source.storagePath),
        parentId:
            readNonEmptyString(sourceMetadata.parentId) ||
            readNonEmptyString(source.parentId),
        parentType:
            readNonEmptyString(sourceMetadata.parentType) ||
            readNonEmptyString(source.parentType),
        previewUrl: readNonEmptyString(sourceMetadata.previewUrl),
    };

    return {
        attachmentId,
        type,
        metadata,
        payload: typeof source.payload === 'undefined' ? {} : source.payload,
        immutable: true,
        ...(readFiniteNumber(source.orderIndex) !== null
            ? { orderIndex: readFiniteNumber(source.orderIndex) as number }
            : {}),
    };
};

export const AttachmentViewerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeAttachment, setActiveAttachment] = useState<PostAttachment | null>(null);

    const viewAttachment = useCallback((attachment: PostAttachment) => {
        setActiveAttachment(normalizeViewerAttachment(attachment));
    }, []);

    const closeViewer = useCallback(() => {
        setActiveAttachment(null);
    }, []);

    return (
        <AttachmentViewerContext.Provider value={{ activeAttachment, viewAttachment, closeViewer }}>
            {children}
        </AttachmentViewerContext.Provider>
    );
};

export const useAttachmentViewer = () => {
    const context = useContext(AttachmentViewerContext);
    if (!context) throw new Error("useAttachmentViewer must be used within AttachmentViewerProvider");
    return context;
};
