

import React from 'react';
// FIX: Added file extensions to imports
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
// FIX: Add file extension to entities.ts import
import { Agent } from '../../types/entities.ts';
import { MentorIcon } from '../icons/MentorIcon.tsx';
import { LockIcon } from '../icons/LockIcon.tsx';

interface AgentCardProps {
    agent: Agent;
}

const AgentCard: React.FC<AgentCardProps> = ({ agent }) => {
    const { lang, isRTL } = useI18n();
    const { navigate } = useNavigation();

    const handlePress = () => {
        if (!agent.isPremium) {
            navigate({ type: 'immersive', id: 'agentChat', params: { agentId: agent.id } });
        } else {
            // In a real app, open an upgrade modal
            console.log('Premium agent clicked, would show upgrade modal.');
        }
    };

    return (
        <button onClick={handlePress} className="w-full text-left" disabled={agent.isPremium}>
            <GlassCard className={`!p-4 transition-colors duration-200 ${agent.isPremium ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/10'}`}>
                <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                    <img src={agent.avatarUrl} alt={agent.name} className="h-16 w-16 rounded-full flex-shrink-0" />
                    <div className="flex-grow">
                        <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                             <BilingualText className="text-lg font-bold">
                                {agent.name}
                            </BilingualText>
                            {agent.isPremium && <LockIcon className="h-4 w-4 text-amber-400" />}
                        </div>
                       
                        <BilingualText role="Caption" className="mt-1">
                            {lang === 'en' ? agent.descriptionEn : agent.descriptionAr}
                        </BilingualText>
                    </div>
                    {!agent.isPremium && <MentorIcon className="h-6 w-6 text-accent" />}
                </div>
            </GlassCard>
        </button>
    );
};

export default AgentCard;
