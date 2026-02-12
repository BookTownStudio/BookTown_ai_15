import React from 'react';

interface FloatingActionPanelProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

const FloatingActionPanel: React.FC<FloatingActionPanelProps> = ({ isOpen, onClose, children }) => {
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
                className={`fixed z-30 left-1/2 -translate-x-1/2 w-[90vw] max-w-md transition-all duration-300 ease-in-out ${isOpen ? 'bottom-28 opacity-100' : 'bottom-16 opacity-0 pointer-events-none'}`}
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div>
                    {children}
                </div>
            </div>
        </>
    );
};

export default FloatingActionPanel;