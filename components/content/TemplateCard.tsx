
import React from 'react';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';

interface TemplateCardProps {
    title: string;
    description: string;
    icon: React.FC<any>;
    onClick: () => void;
    tagLabel?: string;
    disabled?: boolean;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
    title,
    description,
    icon: Icon,
    onClick,
    tagLabel,
    disabled = false,
}) => {
    return (
        <button onClick={onClick} className="w-full text-left group disabled:cursor-not-allowed" disabled={disabled}>
            <GlassCard
                className={[
                    '!border-2 !border-white/10 !p-4 h-[176px] w-full flex flex-col items-center text-center transition-all duration-300 group-hover:bg-white/10 group-hover:!border-accent/50',
                    disabled && 'opacity-60',
                ].filter(Boolean).join(' ')}
            >
                <div className="flex h-full w-full flex-col items-center">
                    {tagLabel ? (
                        <span className="mb-3 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent/95">
                            {tagLabel}
                        </span>
                    ) : (
                        <div className="mb-3 h-[26px]" aria-hidden="true" />
                    )}
                    <Icon className="mb-3 h-10 w-10 flex-shrink-0 text-accent transition-transform duration-300 group-hover:scale-110" />
                    <BilingualText className="mb-2 min-h-[2.5rem] font-bold text-sm leading-tight">{title}</BilingualText>
                    <BilingualText role="Caption" className="!text-xs leading-relaxed text-slate-300/90 line-clamp-3">
                        {description}
                    </BilingualText>
                </div>
            </GlassCard>
        </button>
    );
};

export default TemplateCard;
