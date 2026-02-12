
import React from 'react';
import BilingualText from '../../../components/ui/BilingualText.tsx';
import GlassCard from '../../../components/ui/GlassCard.tsx';
import { BrainIcon } from '../../../components/icons/BrainIcon.tsx';
import { useI18n } from '../../../store/i18n.tsx';

const AiGovernanceTab: React.FC = () => {
    const { lang } = useI18n();

    return (
        <div className="space-y-6">
            <GlassCard className="flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-indigo-900/50 to-purple-900/50">
                <BrainIcon className="h-16 w-16 text-white mb-4 opacity-80" />
                <BilingualText role="H1" className="text-white text-2xl mb-2">
                    {lang === 'en' ? 'AI Governance' : 'حوكمة الذكاء الاصطناعي'}
                </BilingualText>
                <BilingualText className="text-white/70 max-w-md">
                    {lang === 'en' 
                        ? 'Monitor, control, and improve BookTown’s AI systems (Gemini + MatchMaker).' 
                        : 'مراقبة وتحسين أنظمة الذكاء الاصطناعي في بوكتاون.'}
                </BilingualText>
            </GlassCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassCard>
                    <BilingualText role="Caption" className="uppercase tracking-wider text-accent mb-2">Usage</BilingualText>
                    <div className="text-3xl font-bold">12.5k</div>
                    <BilingualText className="text-sm text-slate-400">Tokens used today</BilingualText>
                </GlassCard>
                <GlassCard>
                    <BilingualText role="Caption" className="uppercase tracking-wider text-accent mb-2">Health</BilingualText>
                    <div className="text-3xl font-bold text-green-400">99.8%</div>
                    <BilingualText className="text-sm text-slate-400">Success rate</BilingualText>
                </GlassCard>
            </div>

            <GlassCard>
                <BilingualText role="H1" className="!text-lg mb-4">Live Activity Log</BilingualText>
                <div className="space-y-3">
                    {[1, 2, 3].map((_, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-green-400" />
                                <div>
                                    <div className="text-sm font-semibold">Generate Recommendations</div>
                                    <div className="text-xs text-slate-400">gemini-2.5-flash</div>
                                </div>
                            </div>
                            <div className="text-xs text-slate-500">Just now</div>
                        </div>
                    ))}
                </div>
            </GlassCard>
        </div>
    );
};

export default AiGovernanceTab;
