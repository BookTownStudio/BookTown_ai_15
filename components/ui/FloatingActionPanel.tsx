import React from 'react';

interface FloatingActionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

const FloatingActionPanel: React.FC<FloatingActionPanelProps> = ({ isOpen, onClose, children }) => {
    React.useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <>
            {/* Backdrop */}
            <div 
                className={`fixed inset-0 z-20 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            />
            {/* Panel */}
            <div 
                className={`fixed z-30 left-1/2 -translate-x-1/2 w-[90vw] transition-all duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                role={isOpen ? 'dialog' : undefined}
                aria-modal={isOpen ? 'true' : undefined}
                aria-hidden={isOpen ? undefined : 'true'}
                style={{
                    bottom: isOpen
                        ? 'calc(var(--bottom-nav-height, 66px) + 16px)'
                        : 'calc(var(--bottom-nav-height, 66px) - 8px)',
                    maxHeight: 'calc(100dvh - var(--bottom-nav-height, 66px) - 2rem)',
                    maxWidth: 'min(var(--app-rail-narrow, 760px), calc(100vw - 2rem))',
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                <div className="max-h-full overflow-y-auto overscroll-y-contain">
                    {children}
                </div>
            </div>
        </>
    );
};

export default FloatingActionPanel;
