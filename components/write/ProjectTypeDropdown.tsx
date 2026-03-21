import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from '../icons/ChevronDownIcon.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { cn } from '../../lib/utils.ts';
import { useI18n } from '../../store/i18n.tsx';
import { Project } from '../../types/entities.ts';

export type ProjectTypeValue = Project['status'];

export interface ProjectTypeOption {
    value: ProjectTypeValue;
    labelEn: string;
    labelAr: string;
    badgeClassName: string;
    textClassName: string;
    dotClassName: string;
}

export const PROJECT_TYPE_OPTIONS: ProjectTypeOption[] = [
    {
        value: 'Idea',
        labelEn: 'Idea',
        labelAr: 'فكرة',
        badgeClassName: 'bg-blue-500/10',
        textClassName: 'text-blue-400',
        dotClassName: 'bg-blue-400',
    },
    {
        value: 'Draft',
        labelEn: 'Draft',
        labelAr: 'مسودة',
        badgeClassName: 'bg-amber-500/10',
        textClassName: 'text-amber-400',
        dotClassName: 'bg-amber-400',
    },
    {
        value: 'Revision',
        labelEn: 'Revision',
        labelAr: 'مراجعة',
        badgeClassName: 'bg-purple-500/10',
        textClassName: 'text-purple-400',
        dotClassName: 'bg-purple-400',
    },
    {
        value: 'Final',
        labelEn: 'Final',
        labelAr: 'نهائي',
        badgeClassName: 'bg-emerald-500/10',
        textClassName: 'text-emerald-400',
        dotClassName: 'bg-emerald-400',
    },
];

export function getProjectTypeOption(value: string | undefined): ProjectTypeOption {
    return PROJECT_TYPE_OPTIONS.find((option) => option.value === value) ?? PROJECT_TYPE_OPTIONS[1];
}

interface ProjectTypeDropdownProps {
    id?: string;
    label: string;
    value: ProjectTypeValue;
    onChange: (value: ProjectTypeValue) => void;
}

const ProjectTypeDropdown: React.FC<ProjectTypeDropdownProps> = ({
    id = 'projectType',
    label,
    value,
    onChange,
}) => {
    const { lang } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const selected = useMemo(() => getProjectTypeOption(value), [value]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div ref={rootRef}>
            <label htmlFor={id}>
                <BilingualText role="Caption" className="!text-slate-400 dark:!text-slate-400 mb-1 block">
                    {label}
                </BilingualText>
            </label>

            <div className="relative">
                <button
                    id={id}
                    type="button"
                    onClick={() => setIsOpen((current) => !current)}
                    className="flex h-12 w-full items-center justify-between rounded-md border border-slate-600 bg-slate-800 px-3 text-left text-white focus:outline-none focus:ring-2 focus:ring-accent"
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                >
                    <span className={cn(
                        'inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm font-semibold',
                        selected.badgeClassName,
                        selected.textClassName
                    )}>
                        <span className={cn('h-2 w-2 rounded-full', selected.dotClassName)} />
                        {lang === 'en' ? selected.labelEn : selected.labelAr}
                    </span>
                    <ChevronDownIcon className={cn('h-4 w-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
                </button>

                {isOpen && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-lg border border-white/10 bg-slate-800 p-1 shadow-xl">
                        <ul role="listbox" aria-labelledby={id} className="space-y-1">
                            {PROJECT_TYPE_OPTIONS.map((option) => (
                                <li key={option.value}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                        }}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                                            option.value === value
                                                ? 'bg-white/10 text-white'
                                                : 'text-slate-200 hover:bg-white/10'
                                        )}
                                        role="option"
                                        aria-selected={option.value === value}
                                    >
                                        <span className={cn(
                                            'inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-semibold',
                                            option.badgeClassName,
                                            option.textClassName
                                        )}>
                                            <span className={cn('h-2 w-2 rounded-full', option.dotClassName)} />
                                            {lang === 'en' ? option.labelEn : option.labelAr}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProjectTypeDropdown;
