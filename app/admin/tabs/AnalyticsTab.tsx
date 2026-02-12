
import React, { useState } from 'react';
import BilingualText from '../../../components/ui/BilingualText.tsx';
import GlassCard from '../../../components/ui/GlassCard.tsx';
import { SimpleLineChart, SimpleBarChart, SimpleDonutChart, HorizontalBarChart } from '../../../components/ui/Charts.tsx';
import { mockUserGrowthData, mockAiUsageData, mockContentDistribution, mockLatencyData, mockFeatureUsageData, mockSessionDurationData } from '../../../data/analyticsMocks.ts';
import { useI18n } from '../../../store/i18n.tsx';
import { UsersIcon } from '../../../components/icons/UsersIcon.tsx';
import { BrainIcon } from '../../../components/icons/BrainIcon.tsx';
import { AnalyticsIcon } from '../../../components/icons/AnalyticsIcon.tsx';
import Button from '../../../components/ui/Button.tsx';

const KPICard: React.FC<{ title: string; value: string; trend: string; isPositive: boolean; icon: React.FC<any> }> = ({ title, value, trend, isPositive, icon: Icon }) => (
    <GlassCard className="!p-4">
        <div className="flex justify-between items-start">
            <div>
                <BilingualText role="Caption" className="!text-slate-400">{title}</BilingualText>
                <div className="text-3xl font-bold mt-1">{value}</div>
            </div>
            <div className="p-2 bg-white/5 rounded-lg">
                <Icon className="h-6 w-6 text-accent" />
            </div>
        </div>
        <div className={`mt-2 text-xs font-medium flex items-center ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '▲' : '▼'} {trend} <span className="text-slate-500 ml-1">vs last week</span>
        </div>
    </GlassCard>
);

const AnalyticsTab: React.FC = () => {
    const { lang } = useI18n();
    const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <BilingualText role="H1" className="!text-2xl hidden md:block">
                    {lang === 'en' ? 'Platform Analytics' : 'تحليلات المنصة'}
                </BilingualText>
                
                <div className="flex bg-slate-800 rounded-lg p-1 self-start">
                    {(['7d', '30d', '90d'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeRange === range ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            {range.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <KPICard title="Total Users" value="12,405" trend="12.5%" isPositive={true} icon={UsersIcon} />
                <KPICard title="AI Tokens Used" value="1.2M" trend="5.2%" isPositive={true} icon={BrainIcon} />
                <KPICard title="Avg. Engagement" value="45m" trend="2.1%" isPositive={false} icon={AnalyticsIcon} />
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* User Growth */}
                <GlassCard className="!p-6">
                    <div className="flex justify-between items-center mb-6">
                        <BilingualText role="H1" className="!text-lg">User Growth (DAU)</BilingualText>
                        <div className="text-xs text-slate-400">Daily Active Users</div>
                    </div>
                    <SimpleLineChart data={mockUserGrowthData} height={250} color="stroke-accent" />
                </GlassCard>

                {/* AI Token Usage */}
                <GlassCard className="!p-6">
                    <div className="flex justify-between items-center mb-6">
                        <BilingualText role="H1" className="!text-lg">AI Token Consumption</BilingualText>
                        <div className="text-xs text-slate-400">Gemini 2.5 Usage</div>
                    </div>
                    <SimpleBarChart data={mockAiUsageData} height={250} color="bg-purple-500" />
                </GlassCard>
            </div>

            {/* Feature Engagement Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GlassCard className="!p-6">
                    <div className="flex justify-between items-center mb-6">
                        <BilingualText role="H1" className="!text-lg">Top Feature Usage</BilingualText>
                        <div className="text-xs text-slate-400">Interactions this week</div>
                    </div>
                    <HorizontalBarChart data={mockFeatureUsageData} color="bg-sky-500" />
                </GlassCard>

                <GlassCard className="!p-6">
                    <div className="flex justify-between items-center mb-6">
                        <BilingualText role="H1" className="!text-lg">Session Duration</BilingualText>
                        <div className="text-xs text-slate-400">Distribution (%)</div>
                    </div>
                    <SimpleBarChart data={mockSessionDurationData} height={250} color="bg-indigo-500" />
                </GlassCard>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Content Breakdown */}
                <GlassCard className="lg:col-span-1 !p-6 flex flex-col justify-center">
                    <BilingualText role="H1" className="!text-lg mb-6">Content Distribution</BilingualText>
                    <div className="flex justify-center">
                        <SimpleDonutChart data={mockContentDistribution} />
                    </div>
                </GlassCard>

                {/* System Latency */}
                <GlassCard className="lg:col-span-2 !p-6">
                    <div className="flex justify-between items-center mb-6">
                        <BilingualText role="H1" className="!text-lg">System Latency (ms)</BilingualText>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            <span className="text-green-400">Operational</span>
                        </div>
                    </div>
                    <SimpleLineChart data={mockLatencyData} height={200} color="stroke-green-400" />
                </GlassCard>
            </div>
        </div>
    );
};

export default AnalyticsTab;
