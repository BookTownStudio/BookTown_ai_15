
import React from 'react';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';

interface TemplateCardProps {
    title: string;
    description: string;
    icon: React.FC<any>;
    onClick: () => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ title, description, icon: Icon, onClick }) => {
    return (
        <button onClick={onClick} className="w-full text-left group">
            {/* Added !border-2 and hover border styles for the requested frame effect */}
            <GlassCard className="!p-4 h-full flex flex-col items-center justify-center text-center transition-all duration-300 group-hover:bg-white/10 aspect-square !border-2 !border-white/10 group-hover:!border-accent/50">
                <Icon className="h-10 w-10 text-accent mb-3 transition-transform duration-300 group-hover:scale-110" />
                <BilingualText className="font-bold text-sm leading-tight mb-1">{title}</BilingualText>
                <BilingualText role="Caption" className="!text-xs line-clamp-2">{description}</BilingualText>
            </GlassCard>
        </button>
    );
};

export default TemplateCard;
