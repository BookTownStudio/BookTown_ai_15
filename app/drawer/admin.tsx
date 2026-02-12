import React, { useState, useMemo } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { isSuperAdmin } from '../../lib/auth/roles.ts';

// Icons
import { UsersIcon } from '../../components/icons/UsersIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { AnalyticsIcon } from '../../components/icons/AnalyticsIcon.tsx';
import { FeedbackIcon } from '../../components/icons/FeedbackIcon.tsx';
import { BrainIcon } from '../../components/icons/BrainIcon.tsx';
import { StarIcon } from '../../components/icons/StarIcon.tsx'; 
import { BasketIcon } from '../../components/icons/BasketIcon.tsx'; 
import { SettingsIcon } from '../../components/icons/SettingsIcon.tsx';
import { FlagIcon } from '../../components/icons/FlagIcon.tsx';

// UI Components
import InputField from '../../components/ui/InputField.tsx';
import Button from '../../components/ui/Button.tsx';
import GlassCard from '../../components/ui/GlassCard.tsx';
import { cn } from '../../lib/utils.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';

// Data
import { mockUsers, mockAdminFeedback } from '../../data/mocks.ts';
import { AdminFeedback } from '../../types/entities.ts';
import { useTransitionModerationStage, useApplyModerationAction } from '../../lib/hooks/useModeration.ts';
import { useQuery } from '../../lib/react-query.ts';
import { db } from '../../lib/firebase.ts';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';

type AdminTabId = 'users' | 'moderation' | 'analytics' | 'feedback' | 'ai_governance' | 'catalog' | 'curation' | 'marketplace' | 'settings';

// --- Moderation Tab ---
const ModerationTab: React.FC = () => {
    const { lang } = useI18n();
    const { mutate: transitionStage, isLoading: isTransitioning } = useTransitionModerationStage();
    const { mutate: applyAction, isLoading: isActing } = useApplyModerationAction();

    // Authority: POST_REPORTING_POLICY_V1 standardized on 'reports' collection
    const { data: reports, isLoading, refetch } = useQuery<any[]>({
        queryKey: ['admin_reports'],
        queryFn: async () => {
            if (!db.raw) return [
                { id: 'rep1', postId: 'post2', authorId: 'sam_jones', reportedByUid: 'jane_smith', reason: 'harassment', status: 'open', createdAt: new Date().toISOString() }
            ];
            // Fetch from both legacy 'admin_reports' and new 'reports' for migration safety, 
            // but preferring 'reports' as canonical
            const snap = await getDocs(query(collection(db.raw, 'reports'), orderBy('createdAt', 'desc')));
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    });

    const handleAction = (reportId: string, postId: string, action: any) => {
        const note = prompt(lang === 'en' ? "Add a moderator note (mandatory):" : "أضف ملاحظة (إلزامي):");
        if (!note) return;
        applyAction({ postId, action, reportId, note }, {
            onSuccess: () => refetch()
        });
    };

    const handleReview = (reportId: string) => {
        transitionStage({ reportId, nextStage: 'under_review' }, {
            onSuccess: () => refetch()
        });
    };

    const handleDismiss = (reportId: string, postId: string) => {
        applyAction({ postId, action: 'dismiss', reportId, note: 'Dismissed by moderator' }, {
            onSuccess: () => refetch()
        });
    };

    if (isLoading) return <div className="flex justify-center p-12"><LoadingSpinner /></div>;

    return (
        <div className="space-y-6">
            <BilingualText role="H1" className="!text-2xl mb-4">Moderation Queue</BilingualText>
            
            <div className="space-y-4">
                {(reports?.length === 0) ? (
                    <BilingualText className="text-slate-500 italic">Queue is clear.</BilingualText>
                ) : (
                    reports?.map(report => (
                        <GlassCard key={report.id} className="!p-4 border-l-4 border-l-red-500">
                            <div className="flex flex-col md:flex-row justify-between gap-4">
                                <div className="flex-grow">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={cn(
                                            "text-[10px] font-black uppercase px-2 py-0.5 rounded",
                                            report.status === 'open' ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"
                                        )}>{report.status}</span>
                                        <span className="text-xs text-slate-400 font-bold">{report.reason.toUpperCase()}</span>
                                    </div>
                                    <p className="text-sm text-slate-300 mb-1">Reporter: {report.reportedByUid}</p>
                                    <p className="text-sm text-slate-300 mb-1">Target Post ID: {report.entityId || report.postId}</p>
                                    {report.details && (
                                        <div className="mt-2 p-2 bg-black/20 rounded text-xs text-slate-400 italic">
                                            "{report.details}"
                                        </div>
                                    )}
                                    <p className="text-[10px] text-slate-500 mt-2 uppercase">Intake: {new Date(report.createdAt).toLocaleString()}</p>
                                </div>
                                
                                <div className="flex flex-wrap gap-2 items-center">
                                    {report.status === 'open' && (
                                        <Button variant="secondary" className="!text-xs h-8" onClick={() => handleReview(report.id)} disabled={isTransitioning}>
                                            Start Review
                                        </Button>
                                    )}
                                    
                                    {report.status === 'under_review' && (
                                        <>
                                            <Button variant="primary" className="!text-xs !bg-blue-600 h-8" onClick={() => handleAction(report.id, report.postId || report.entityId, 'hide')} disabled={isActing}>Hide</Button>
                                            <Button variant="primary" className="!text-xs !bg-orange-600 h-8" onClick={() => handleAction(report.id, report.postId || report.entityId, 'restrict')} disabled={isActing}>Restrict</Button>
                                            <Button variant="primary" className="!text-xs !bg-red-700 h-8" onClick={() => handleAction(report.id, report.postId || report.entityId, 'soft_delete')} disabled={isActing}>Soft Delete</Button>
                                            <Button variant="ghost" className="!text-xs h-8" onClick={() => handleDismiss(report.id, report.postId || report.entityId)} disabled={isTransitioning}>Dismiss</Button>
                                        </>
                                    )}

                                    {report.status === 'action_taken' && (
                                        <span className="text-xs text-green-400 font-bold uppercase">Outcome: {report.resolution}</span>
                                    )}
                                    {report.status === 'dismissed' && (
                                        <span className="text-xs text-slate-500 italic">Dismissed</span>
                                    )}
                                </div>
                            </div>
                        </GlassCard>
                    ))
                )}
            </div>
        </div>
    );
};

// --- Users Tab ---
const UsersTab: React.FC = () => {
    const { lang } = useI18n();
    const [users, setUsers] = useState(mockUsers);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredUsers = useMemo(() => {
        if (!searchQuery) return users;
        const lowerQuery = searchQuery.toLowerCase();
        return users.filter(u => 
            u.name.toLowerCase().includes(lowerQuery) || 
            u.handle.toLowerCase().includes(lowerQuery) || 
            u.email.toLowerCase().includes(lowerQuery)
        );
    }, [users, searchQuery]);

    const handleToggleSuspend = (uid: string) => {
        setUsers(users.map(u => u.uid === uid ? { ...u, isSuspended: !u.isSuspended } : u));
    };

    return (
        <div className="space-y-4">
            <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">Users</BilingualText>
            <InputField id="user-search" label="" type="search" placeholder={lang === 'en' ? 'Search users...' : 'ابحث عن المستخدمين...'} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <div className="space-y-2">
                {filteredUsers.map(user => (
                    <GlassCard key={user.uid} className="!p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                            <div className="flex items-center gap-3 flex-grow">
                                <img src={user.avatarUrl} alt={user.name} className="h-10 w-10 rounded-full"/>
                                <div className="overflow-hidden">
                                    <p className={`font-bold truncate ${user.isSuspended ? 'line-through text-slate-500' : ''}`}>{user.name} <span className="font-normal text-slate-400">{user.handle}</span></p>
                                    <p className="text-sm text-slate-500 truncate">{user.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                                <BilingualText role="Caption">Reports: <span className={`font-semibold ${user.reportsCount && user.reportsCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{user.reportsCount || 0}</span></BilingualText>
                                <Button variant="ghost" className="!text-xs" onClick={() => handleToggleSuspend(user.uid)}>{user.isSuspended ? 'Unsuspend' : 'Suspend'}</Button>
                            </div>
                        </div>
                    </GlassCard>
                ))}
            </div>
        </div>
    );
};

// --- Feedback Tab ---
const FeedbackTab: React.FC = () => {
    const { lang } = useI18n();
    const [feedbackItems, setFeedbackItems] = useState(mockAdminFeedback);
    const [filter, setFilter] = useState<string>('all');
    
    const filteredItems = useMemo(() => {
        if (filter === 'all') return feedbackItems;
        return feedbackItems.filter(item => item.status.toLowerCase().includes(filter));
    }, [feedbackItems, filter]);

    const handleStatusChange = (id: string, newStatus: AdminFeedback['status']) => {
        setFeedbackItems(feedbackItems.map(item => item.id === id ? { ...item, status: newStatus } : item));
    };

    return (
        <div className="space-y-4">
             <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">User Feedback</BilingualText>
             <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {['all', 'new', 'in_progress', 'resolved'].map(f => (
                    <Button key={f} variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)} className="flex-shrink-0 capitalize">{f.replace('_', ' ')}</Button>
                ))}
            </div>
            {filteredItems.map(item => (
                <GlassCard key={item.id} className="!p-3">
                    <p className="text-xs font-semibold text-accent">{item.type} <span className="font-normal text-slate-400">from {item.userHandle}</span></p>
                    <p className="mt-1">{item.text}</p>
                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
                        <BilingualText role="Caption">Status: <span className="font-semibold">{item.status}</span></BilingualText>
                        <select onChange={(e) => handleStatusChange(item.id, e.target.value as AdminFeedback['status'])} value={item.status} className="bg-slate-700 text-white text-xs rounded p-1">
                            <option value="new">New</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                        </select>
                    </div>
                </GlassCard>
            ))}
        </div>
    );
};

const MarketplaceTab: React.FC = () => (
    <div className="flex items-center justify-center h-64 text-slate-500">
        <div className="text-center">
            <BasketIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Marketplace Module Coming Soon</p>
        </div>
    </div>
);

const AdminDashboardScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate } = useNavigation();
    const { role, isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<AdminTabId>('moderation');

    const handleBack = () => navigate({ type: 'tab', id: 'home' });
    
    if (!isAdmin) {
        return (
            <div className="h-screen flex flex-col">
                <ScreenHeader titleEn="Admin Dashboard" titleAr="لوحة التحكم" onBack={handleBack} />
                <main className="flex-grow flex items-center justify-center text-center p-4">
                    <BilingualText role="H1" className="text-white/70">
                        {lang === 'en' ? 'You do not have permission to access this area.' : 'ليس لديك إذن للوصول إلى هذه المنطقة.'}
                    </BilingualText>
                </main>
            </div>
        );
    }

    const isSuper = isSuperAdmin(role);

    // --- Navigation Configuration ---
    const ADMIN_TABS: { id: AdminTabId; en: string; ar: string; icon: React.FC<any>; superAdminOnly?: boolean }[] = [
        { id: 'moderation', en: 'Moderation', ar: 'الرقابة', icon: FlagIcon },
        { id: 'users', en: 'Users', ar: 'المستخدمون', icon: UsersIcon },
        { id: 'analytics', en: 'Analytics', ar: 'التحليلات', icon: AnalyticsIcon },
        { id: 'feedback', en: 'Feedback', ar: 'الملاحظات', icon: FeedbackIcon },
        { id: 'ai_governance', en: 'AI Governance', ar: 'حوكمة الذكاء الاصطناعي', icon: BrainIcon, superAdminOnly: true },
        { id: 'catalog', en: 'Catalog', ar: 'الكتالوج', icon: BookIcon, superAdminOnly: true },
        { id: 'curation', en: 'Curation', ar: 'التنسيق', icon: StarIcon, superAdminOnly: true },
        { id: 'marketplace', en: 'Marketplace', ar: 'المتجر', icon: BasketIcon, superAdminOnly: true },
        { id: 'settings', en: 'Settings', ar: 'الإعدادات', icon: SettingsIcon, superAdminOnly: true },
    ];

    const visibleTabs = ADMIN_TABS.filter(tab => !tab.superAdminOnly || isSuper);

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Admin Dashboard" titleAr="لوحة التحكم" onBack={handleBack} />
            
            <main className="flex-grow overflow-hidden flex flex-col md:flex-row pt-20">
                <nav className={`
                    bg-slate-800/50 backdrop-blur-md border-b md:border-b-0 md:border-r border-white/10
                    flex md:flex-col
                    w-full md:w-64 md:h-full md:pt-4
                    overflow-x-auto md:overflow-y-auto scrollbar-hide
                    flex-shrink-0
                `}>
                    <div className="flex md:flex-col p-2 md:p-4 gap-2">
                        {visibleTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap md:whitespace-normal",
                                    activeTab === tab.id 
                                        ? "bg-primary text-white shadow-lg" 
                                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <tab.icon className={cn("h-5 w-5", activeTab === tab.id ? "text-white" : "text-current")} />
                                <span className="font-medium text-sm">
                                    {lang === 'en' ? tab.en : tab.ar}
                                </span>
                            </button>
                        ))}
                    </div>
                </nav>

                <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-slate-900/50">
                    <div className="max-w-5xl mx-auto">
                        {activeTab === 'users' && <UsersTab />}
                        {activeTab === 'moderation' && <ModerationTab />}
                        {activeTab === 'feedback' && <FeedbackTab />}
                        {activeTab === 'marketplace' && <MarketplaceTab />}
                        {activeTab === 'settings' && <div className="text-center text-slate-500 py-16">Global Settings</div>}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AdminDashboardScreen;