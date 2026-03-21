
import React from 'react';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';

interface TemplateCardProps {
    title: string;
    description: string;
    icon: React.FC<any>;
    onClick: () => void;
    featured?: boolean;
    disabled?: boolean;
}

const TemplateCard: React.FC<TemplateCardProps> = ({
    title,
    description,
    icon: Icon,
    onClick,
    featured = false,
    disabled = false,
}) => {
    return (
        <button onClick={onClick} className="w-full text-left group disabled:cursor-not-allowed" disabled={disabled}>
            <GlassCard
                className={[
                    '!border-2 !border-white/10 transition-all duration-300',
                    featured
                        ? '!p-5 min-h-[220px] flex flex-col justify-between text-left bg-gradient-to-br from-accent/18 via-white/8 to-transparent group-hover:!border-accent/60 group-hover:bg-white/12'
                        : '!p-4 h-full flex flex-col items-center justify-center text-center aspect-square group-hover:bg-white/10 group-hover:!border-accent/50',
                    disabled && 'opacity-60',
                ].filter(Boolean).join(' ')}
            >
                {featured ? (
                    <>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <BilingualText className="font-bold text-lg leading-tight mb-2">{title}</BilingualText>
                                <BilingualText role="Caption" className="text-sm leading-relaxed text-slate-300/90">
                                    {description}
                                </BilingualText>
                            </div>
                            <Icon className="h-11 w-11 text-accent flex-shrink-0 transition-transform duration-300 group-hover:scale-110" />
                        </div>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent/90">
                            Guided start
                        </span>
                    </>
                ) : (
                    <>
                        <Icon className="h-10 w-10 text-accent mb-3 transition-transform duration-300 group-hover:scale-110" />
                        <BilingualText className="font-bold text-sm leading-tight mb-1">{title}</BilingualText>
                        <BilingualText role="Caption" className="!text-xs line-clamp-2">{description}</BilingualText>
                    </>
                )}
            </GlassCard>
        </button>
    );
};

export default TemplateCard;
