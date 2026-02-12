
import React, { useRef, useEffect, useState } from 'react';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { Project } from '../../types/entities.ts';
import Button from '../ui/Button.tsx';
import { VerticalEllipsisIcon } from '../icons/VerticalEllipsisIcon.tsx';
import { EditIcon } from '../icons/EditIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';
import { DuplicateIcon } from '../icons/DuplicateIcon.tsx';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { UploadIcon } from '../icons/UploadIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { ChevronDownIcon } from '../icons/ChevronDownIcon.tsx';

interface ProjectCardProps {
    project: Project;
    isMenuOpen: boolean;
    onToggleMenu: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onDuplicate: () => void;
    onShare: () => void;
    onPublish: () => void;
    onStatusChange: (status: Project['status']) => void;
    onPress: () => void;
}

// Color mapping for the "spine" and badges based on status
const statusColors: Record<Project['status'], { border: string; badge: string; text: string; dot: string }> = {
    Idea: { border: 'bg-blue-500', badge: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
    Draft: { border: 'bg-amber-500', badge: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
    Revision: { border: 'bg-purple-500', badge: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400' },
    Final: { border: 'bg-emerald-500', badge: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
};

const ProjectCard: React.FC<ProjectCardProps> = ({ 
    project, 
    isMenuOpen, 
    onToggleMenu, 
    onEdit, 
    onDelete, 
    onDuplicate, 
    onShare, 
    onPublish,
    onStatusChange,
    onPress
}) => {
    const { lang, isRTL } = useI18n();
    const menuRef = useRef<HTMLDivElement>(null);
    const statusRef = useRef<HTMLDivElement>(null);
    const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);

    const menuItems = [
        { label: 'Edit Info', action: onEdit, icon: EditIcon },
        { label: 'Share', action: onShare, icon: ShareIcon },
        { label: 'Duplicate', action: onDuplicate, icon: DuplicateIcon },
        { label: 'Publish', action: onPublish, icon: UploadIcon },
        { label: 'Delete', action: onDelete, icon: TrashIcon, isDestructive: true },
    ];

    const styles = statusColors[project.status] || statusColors['Idea'];
    const wordCountLabel = lang === 'en' ? 'words' : 'كلمة';

    const possibleStatuses: Project['status'][] = ['Idea', 'Draft', 'Revision', 'Final'];

    // Handle clicking outside to close menus
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onToggleMenu();
            }
            if (isStatusMenuOpen && statusRef.current && !statusRef.current.contains(event.target as Node)) {
                setIsStatusMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen, onToggleMenu, isStatusMenuOpen]);

    const handleStatusClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsStatusMenuOpen(!isStatusMenuOpen);
    };

    const handleStatusSelect = (e: React.MouseEvent, status: Project['status']) => {
        e.stopPropagation();
        onStatusChange(status);
        setIsStatusMenuOpen(false);
    };

    const handleMainClick = (e: React.MouseEvent) => {
        // Prevent triggering main click if clicking inside known interactive areas
        // (Though stopPropagation on buttons handles most of this)
        onPress();
    }

    const anyMenuOpen = isMenuOpen || isStatusMenuOpen;

    return (
        <div 
            className={cn(
                "relative w-full group transition-all duration-200", 
                // Elevate z-index when menus are open so they float above neighbors
                anyMenuOpen ? "z-30" : "z-0"
            )}
            onClick={handleMainClick}
        >
            <div className="relative w-full bg-[#1E242C] dark:bg-[#1E242C] hover:bg-[#252b36] transition-colors duration-200 rounded-xl border border-white/5 shadow-sm group-hover:shadow-md flex flex-col cursor-pointer">
                
                {/* Left Colored Spine - Rounded corners to match card */}
                <div className={cn("absolute left-0 top-0 bottom-0 w-1.5 z-10 rounded-l-xl", styles.border)} />

                {/* Main Content - Compact Layout */}
                <div className="flex-grow pl-5 pr-3 py-3 flex flex-col gap-3">
                    
                    {/* Top Row: Title & Menu */}
                    <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-grow pt-1">
                            <BilingualText className="text-base font-bold text-white leading-tight truncate pr-2">
                                {lang === 'en' ? project.titleEn : project.titleAr}
                            </BilingualText>
                            <BilingualText role="Caption" className="text-slate-400 text-[11px] mt-0.5 truncate uppercase tracking-wider">
                                {lang === 'en' ? project.typeEn : project.typeAr}
                            </BilingualText>
                        </div>

                        {/* Menu Trigger */}
                        <div className="relative flex-shrink-0 -mr-1" ref={menuRef}>
                            <Button 
                                variant="icon" 
                                onClick={(e) => { e.stopPropagation(); onToggleMenu(); }} 
                                className={cn(
                                    "h-8 w-8 min-h-0 min-w-0 p-0 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center",
                                    isMenuOpen && "bg-white/10 text-white"
                                )}
                                aria-label="Options"
                            >
                                <VerticalEllipsisIcon className="h-5 w-5" />
                            </Button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                                <div className={`absolute top-full right-0 mt-1 w-48 z-50`}>
                                    <div className="bg-[#2A303C] border border-white/10 rounded-lg shadow-xl overflow-hidden p-1">
                                        <ul className="space-y-0.5">
                                            {menuItems.map(item => (
                                                <li key={item.label}>
                                                    <button
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left",
                                                            item.isDestructive 
                                                                ? "text-red-400 hover:bg-red-500/10" 
                                                                : "text-slate-200 hover:bg-white/10"
                                                        )}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            item.action();
                                                        }}
                                                    >
                                                        <item.icon className="h-4 w-4 opacity-70" />
                                                        {item.label}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Divider line */}
                    <div className="w-full h-px bg-white/5" />

                    {/* Bottom Row: Stats & Status */}
                    <div className="flex items-center justify-between">
                        <div className="text-[11px] text-slate-500 font-mono">
                            {project.wordCount.toLocaleString()} {wordCountLabel}
                        </div>
                        
                        {/* Status Badge (Interactive) */}
                        <div className="relative" ref={statusRef}>
                            <button 
                                onClick={handleStatusClick}
                                className={cn(
                                    "flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-white/5 transition-all hover:bg-white/5",
                                    styles.badge, styles.text
                                )}
                            >
                                {project.isPublished && <span className="mr-1">🚀</span>}
                                {project.status}
                                <ChevronDownIcon className="h-3 w-3 opacity-50" />
                            </button>

                            {isStatusMenuOpen && (
                                <div className={`absolute top-full right-0 mt-1 w-32 z-50`}>
                                    <div className="bg-[#2A303C] border border-white/10 rounded-lg shadow-xl overflow-hidden p-1">
                                        {possibleStatuses.map(status => {
                                            const sStyle = statusColors[status];
                                            return (
                                                <button
                                                    key={status}
                                                    onClick={(e) => handleStatusSelect(e, status)}
                                                    className={cn(
                                                        "w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors text-left font-bold",
                                                        project.status === status ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5"
                                                    )}
                                                >
                                                    <div className={cn("w-2 h-2 rounded-full", sStyle.dot)} />
                                                    {status}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectCard;
