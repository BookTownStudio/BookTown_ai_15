
import React from 'react';

interface ChipProps {
    children: React.ReactNode;
}

const Chip: React.FC<ChipProps> = ({ children }) => {
    return (
        <div className="px-3 py-1 bg-accent/10 text-accent text-sm font-semibold rounded-full">
            {children}
        </div>
    );
};

export default Chip;