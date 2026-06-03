import React, { createContext, useState, useContext, useCallback, useRef, useEffect } from 'react';
import Snackbar from '../components/ui/Snackbar.tsx';
import { useRestorePost } from '../lib/hooks/useRestorePost.ts';
import { useI18n } from './i18n.tsx';

interface ToastContextType {
    showToast: (message: string) => void;
    showPostDeleteUndo: (postId: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
    children: React.ReactNode;
}

interface DeleteUndoSnackbarState {
    postId: string;
    isVisible: boolean;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
    const [message, setMessage] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [deleteUndoSnackbar, setDeleteUndoSnackbar] = useState<DeleteUndoSnackbarState | null>(null);
    const deleteUndoTimeoutRef = useRef<number | null>(null);
    const { lang } = useI18n();
    const { mutate: restorePost } = useRestorePost();

    const showToast = useCallback((msg: string) => {
        setMessage(msg);
        setIsVisible(true);
        setTimeout(() => {
            setIsVisible(false);
        }, 2500); // Fade out after 2.5s
        setTimeout(() => {
            setMessage(null);
        }, 3000); // Remove from DOM after fade out
    }, []);

    const clearDeleteUndoTimeout = useCallback(() => {
        if (deleteUndoTimeoutRef.current !== null) {
            window.clearTimeout(deleteUndoTimeoutRef.current);
            deleteUndoTimeoutRef.current = null;
        }
    }, []);

    const showPostDeleteUndo = useCallback((postId: string) => {
        const normalizedPostId = typeof postId === 'string' ? postId.trim() : '';
        if (!normalizedPostId) return;

        clearDeleteUndoTimeout();
        setDeleteUndoSnackbar({
            postId: normalizedPostId,
            isVisible: true,
        });

        deleteUndoTimeoutRef.current = window.setTimeout(() => {
            setDeleteUndoSnackbar(null);
            deleteUndoTimeoutRef.current = null;
        }, 6000);
    }, [clearDeleteUndoTimeout]);

    const handleUndoDelete = useCallback(() => {
        const postId = deleteUndoSnackbar?.postId;
        if (!postId) return;

        clearDeleteUndoTimeout();
        setDeleteUndoSnackbar(null);

        restorePost(postId, {
            onError: () => {
                showToast(lang === 'en' ? 'Failed to restore post.' : 'تعذر استعادة المنشور.');
            }
        });
    }, [clearDeleteUndoTimeout, deleteUndoSnackbar?.postId, lang, restorePost, showToast]);

    useEffect(() => {
        return () => {
            clearDeleteUndoTimeout();
        };
    }, [clearDeleteUndoTimeout]);

    return (
        <ToastContext.Provider value={{ showToast, showPostDeleteUndo }}>
            {children}
            {message && (
                <Snackbar
                    isVisible={isVisible}
                    message={message}
                />
            )}
            {deleteUndoSnackbar && (
                <Snackbar
                    isVisible={deleteUndoSnackbar.isVisible}
                    message={lang === 'en' ? 'Post deleted' : 'تم حذف المنشور'}
                    actionLabel={lang === 'en' ? 'Undo' : 'تراجع'}
                    onAction={handleUndoDelete}
                />
            )}
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
