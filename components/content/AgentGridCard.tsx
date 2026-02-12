
import React from 'react';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
// FIX: Add file extension to entities.ts import
import { Agent } from '../../types/entities.ts';
import { LockIcon } from '../icons/LockIcon.tsx';

interface AgentGridCardProps {
    agent: Agent;
    onClick: () => void;
}

const AgentGridCard: React.FC<AgentGridCardProps> = ({ agent, onClick }) => {
    const { lang } = useI18n();

    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-left w-full group relative focus:outline-none focus:ring-2 focus:ring-accent rounded-card ${agent.isPremium ? 'opacity-70' : ''}`}
        >
            <GlassCard className={`!p-4 aspect-square flex flex-col items-center justify-center text-center transition-all duration-300 bg-white/10 dark:bg-white/5 border border-black/5 dark:border-white/10 shadow-sm ${agent.isPremium ? '' : 'group-hover:bg-white/20 dark:group-hover:bg-white/10'}`}>
                {agent.isPremium && (
                    <div className="absolute top-3 right-3 bg-amber-500/20 p-1.5 rounded-full">
                         <LockIcon className="h-4 w-4 text-amber-400" />
                    </div>
                )}
                <agent.icon className={`h-14 w-14 ${agent.color} mb-3 transition-transform duration-300 ${agent.isPremium ? '' : 'group-hover:scale-110'}`} />
                <BilingualText className="font-bold text-center">
                    {agent.name}
                </BilingualText>
                <BilingualText role="Caption" className="!text-xs mt-1 leading-tight text-center whitespace-pre-line">
                    {lang === 'en' ? agent.descriptionEn : agent.descriptionAr}
                </BilingualText>
            </GlassCard>
        </button>
    );
};

export default AgentGridCard;
