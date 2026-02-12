import React from 'react';
import { cn } from '../../lib/utils.ts';

interface AttachmentInteractionWrapperProps {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

/**
 * ATTACHMENT_ACTIONS_V1: Interaction Wrapper
 * Updated to be inert. Actions are now explicitly triggered via icon-only Visibility Overlay in renderer.
 */
const AttachmentInteractionWrapper: React.FC<AttachmentInteractionWrapperProps> = ({ 
    children, 
    className,
    disabled = false 
}) => {
    return (
        <div 
            className={cn(
                "relative select-none outline-none overflow-hidden rounded-xl", 
                className
            )}
            tabIndex={disabled ? -1 : 0}
        >
            {children}
        </div>
    );
};

export default AttachmentInteractionWrapper;