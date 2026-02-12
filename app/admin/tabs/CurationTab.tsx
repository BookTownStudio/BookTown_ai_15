
import React from 'react';
import BilingualText from '../../../components/ui/BilingualText.tsx';
import GlassCard from '../../../components/ui/GlassCard.tsx';
import { StarIcon } from '../../../components/icons/StarIcon.tsx';
import Button from '../../../components/ui/Button.tsx';
import { useI18n } from '../../../store/i18n.tsx';

const CurationTab: React.FC = () => {
    const { lang } = useI18n();

    return (
        <div className="space-y-6">
            <GlassCard className="bg-gradient-to-r from-amber-900/40 to-orange-900/40 border-amber-500/30">
                <div className="flex items-start justify-between">
                    <div>
                        <BilingualText role="H1" className="!text-xl text-amber-200">
                            {lang === 'en' ? 'Featured Campaign' : 'الحملة المميزة'}
                        </BilingualText>
                        <BilingualText className="text-amber-100/70 mt-1">
                            Summer Reading Challenge 2024
                        </BilingualText>
                    </div>
                    <StarIcon className="h-8 w-8 text-amber-400" />
                </div>
                <div className="mt-4 flex gap-2">
                    <Button variant="ghost" className="!bg-black/20 hover:!bg-black/30 !text-amber-100 !text-xs">Edit</Button>
                    <Button variant="ghost" className="!bg-black/20 hover:!bg-black/30 !text-amber-100 !text-xs">End Campaign</Button>
                </div>
            </GlassCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GlassCard>
                    <BilingualText role="H1" className="!text-lg mb-4">Homepage Shelves</BilingualText>
                    <ul className="space-y-2 text-sm text-slate-400">
                        <li className="flex justify-between"><span>Trending Now</span> <span className="text-green-400">Active</span></li>
                        <li className="flex justify-between"><span>New Releases</span> <span className="text-green-400">Active</span></li>
                        <li className="flex justify-between"><span>Sci-Fi Classics</span> <span className="text-slate-600">Inactive</span></li>
                    </ul>
                    <Button variant="ghost" className="w-full mt-4 !text-xs">Manage Shelves</Button>
                </GlassCard>

                <GlassCard>
                    <BilingualText role="H1" className="!text-lg mb-4">Spotlights</BilingualText>
                    <div className="text-center py-4 text-slate-500 text-sm">
                        No active author spotlights.
                    </div>
                    <Button variant="ghost" className="w-full mt-4 !text-xs">Create Spotlight</Button>
                </GlassCard>
            </div>
        </div>
    );
};

export default CurationTab;
