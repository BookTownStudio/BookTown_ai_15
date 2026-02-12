import React from 'react';

interface ProgressBarProps {
    progress: number; // 0-100
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
    const safeProgress = Math.max(0, Math.min(100, progress));

    return (
        <div className="w-full bg-white/10 rounded-full h-1.5">
            <div 
                className="bg-accent h-1.5 rounded-full"
                style={{ width: `${safeProgress}%` }}
            ></div>
        </div>
    );
};

export default ProgressBar;