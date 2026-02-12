import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { PostAttachment } from '../types/entities.ts';

interface AttachmentViewerContextType {
    activeAttachment: PostAttachment | null;
    viewAttachment: (attachment: PostAttachment) => void;
    closeViewer: () => void;
}

const AttachmentViewerContext = createContext<AttachmentViewerContextType | undefined>(undefined);

export const AttachmentViewerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [activeAttachment, setActiveAttachment] = useState<PostAttachment | null>(null);

    const viewAttachment = useCallback((attachment: PostAttachment) => {
        setActiveAttachment(attachment);
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