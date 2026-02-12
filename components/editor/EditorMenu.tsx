import React from 'react';

interface EditorMenuProps {
    children: React.ReactNode;
}

const EditorMenu: React.FC<EditorMenuProps> = ({ children }) => {
    // In a real app, this would use a portal and calculate its position.
    // For this app, absolute positioning is sufficient.
    return (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 w-32">
            <div className="bg-slate-200/80 dark:bg-slate-700/80 backdrop-blur-md rounded-lg shadow-lg border border-black/10 dark:border-white/10 p-1">
                {children}
            </div>
        </div>
    );
};

export default EditorMenu;
