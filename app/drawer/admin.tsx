import React, { useEffect, useMemo, useState } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { hasRoleAtLeast } from '../../lib/auth/roles.ts';
import type { UserRole } from '../../lib/auth/roles.ts';

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

type ControlSectionId =
  | 'users'
  | 'moderation'
  | 'analytics'
  | 'feedback'
  | 'ai_governance'
  | 'catalog'
  | 'curation'
  | 'marketplace'
  | 'settings'
  | 'deletion_requests'
  | 'system_jobs';

type ControlDomainId = 'safety' | 'operations' | 'intelligence' | 'governance';

type ControlSection = {
  id: ControlSectionId;
  en: string;
  ar: string;
  icon: React.FC<any>;
  minimumRole: UserRole;
  domain: ControlDomainId;
};

type DeleteRequestStatus = 'pending' | 'approved' | 'rejected';

type DeleteRequest = {
  id: string;
  targetUid: string;
  targetName: string;
  targetHandle: string;
  raisedByRole: UserRole;
  reason: string;
  status: DeleteRequestStatus;
  createdAt: string;
};

const CONTROL_DOMAINS: Array<{ id: ControlDomainId; en: string; ar: string }> = [
  { id: 'safety', en: 'Safety', ar: 'السلامة' },
  { id: 'operations', en: 'Operations', ar: 'العمليات' },
  { id: 'intelligence', en: 'Intelligence', ar: 'الذكاء التشغيلي' },
  { id: 'governance', en: 'Governance', ar: 'الحوكمة' },
];

const CONTROL_SECTIONS: ControlSection[] = [
  { id: 'moderation', en: 'Moderation', ar: 'الرقابة', icon: FlagIcon, minimumRole: 'moderator', domain: 'safety' },
  { id: 'users', en: 'Users', ar: 'المستخدمون', icon: UsersIcon, minimumRole: 'moderator', domain: 'operations' },
  { id: 'deletion_requests', en: 'Deletion Requests', ar: 'طلبات الحذف', icon: UsersIcon, minimumRole: 'superadmin', domain: 'operations' },
  { id: 'analytics', en: 'Analytics', ar: 'التحليلات', icon: AnalyticsIcon, minimumRole: 'moderator', domain: 'intelligence' },
  { id: 'feedback', en: 'Feedback', ar: 'الملاحظات', icon: FeedbackIcon, minimumRole: 'moderator', domain: 'intelligence' },
  { id: 'ai_governance', en: 'AI Governance', ar: 'حوكمة الذكاء الاصطناعي', icon: BrainIcon, minimumRole: 'superadmin', domain: 'governance' },
  { id: 'catalog', en: 'Catalog', ar: 'الكتالوج', icon: BookIcon, minimumRole: 'superadmin', domain: 'governance' },
  { id: 'curation', en: 'Curation', ar: 'التنسيق', icon: StarIcon, minimumRole: 'superadmin', domain: 'governance' },
  { id: 'marketplace', en: 'Marketplace', ar: 'المتجر', icon: BasketIcon, minimumRole: 'superadmin', domain: 'governance' },
  { id: 'system_jobs', en: 'System Jobs', ar: 'مهام النظام', icon: SettingsIcon, minimumRole: 'superadmin', domain: 'governance' },
  { id: 'settings', en: 'Settings', ar: 'الإعدادات', icon: SettingsIcon, minimumRole: 'superadmin', domain: 'governance' },
];

// --- Moderation Tab ---
const ModerationTab: React.FC = () => {
  const { lang } = useI18n();
  const { mutate: transitionStage, isLoading: isTransitioning } = useTransitionModerationStage();
  const { mutate: applyAction, isLoading: isActing } = useApplyModerationAction();

  const { data: reports, isLoading, refetch } = useQuery<any[]>({
    queryKey: ['admin_reports'],
    queryFn: async () => {
      if (!db.raw) {
        return [
          {
            id: 'rep1',
            postId: 'post2',
            authorId: 'sam_jones',
            reportedByUid: 'jane_smith',
            reason: 'harassment',
            status: 'open',
            createdAt: new Date().toISOString(),
          },
        ];
      }
      const snap = await getDocs(query(collection(db.raw, 'reports'), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });

  const handleAction = (reportId: string, postId: string, action: any) => {
    const note = prompt(lang === 'en' ? 'Add a moderator note (mandatory):' : 'أضف ملاحظة (إلزامي):');
    if (!note) return;
    applyAction(
      { postId, action, reportId, note },
      {
        onSuccess: () => refetch(),
      }
    );
  };

  const handleReview = (reportId: string) => {
    transitionStage(
      { reportId, nextStage: 'under_review' },
      {
        onSuccess: () => refetch(),
      }
    );
  };

  const handleDismiss = (reportId: string, postId: string) => {
    applyAction(
      { postId, action: 'dismiss', reportId, note: 'Dismissed by moderator' },
      {
        onSuccess: () => refetch(),
      }
    );
  };

  if (isLoading) return <div className="flex justify-center p-12"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <BilingualText role="H1" className="!text-2xl mb-4">{lang === 'en' ? 'Moderation Queue' : 'قائمة الرقابة'}</BilingualText>

      <div className="space-y-4">
        {reports?.length === 0 ? (
          <BilingualText className="text-slate-500 italic">{lang === 'en' ? 'Queue is clear.' : 'لا توجد عناصر حالياً.'}</BilingualText>
        ) : (
          reports?.map((report) => (
            <GlassCard key={report.id} className="!p-4 border-l-4 border-l-red-500">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={cn(
                        'text-[10px] font-black uppercase px-2 py-0.5 rounded',
                        report.status === 'open' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                      )}
                    >
                      {report.status}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">{report.reason.toUpperCase()}</span>
                  </div>
                  <p className="text-sm text-slate-300 mb-1">Reporter: {report.reportedByUid}</p>
                  <p className="text-sm text-slate-300 mb-1">Target Post ID: {report.entityId || report.postId}</p>
                  {report.details && (
                    <div className="mt-2 p-2 bg-black/20 rounded text-xs text-slate-400 italic">"{report.details}"</div>
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
                      <Button
                        variant="primary"
                        className="!text-xs !bg-blue-600 h-8"
                        onClick={() => handleAction(report.id, report.postId || report.entityId, 'hide')}
                        disabled={isActing}
                      >
                        Hide
                      </Button>
                      <Button
                        variant="primary"
                        className="!text-xs !bg-orange-600 h-8"
                        onClick={() => handleAction(report.id, report.postId || report.entityId, 'restrict')}
                        disabled={isActing}
                      >
                        Restrict
                      </Button>
                      <Button
                        variant="primary"
                        className="!text-xs !bg-red-700 h-8"
                        onClick={() => handleAction(report.id, report.postId || report.entityId, 'soft_delete')}
                        disabled={isActing}
                      >
                        Soft Delete
                      </Button>
                      <Button
                        variant="ghost"
                        className="!text-xs h-8"
                        onClick={() => handleDismiss(report.id, report.postId || report.entityId)}
                        disabled={isTransitioning}
                      >
                        Dismiss
                      </Button>
                    </>
                  )}

                  {report.status === 'action_taken' && (
                    <span className="text-xs text-green-400 font-bold uppercase">Outcome: {report.resolution}</span>
                  )}
                  {report.status === 'dismissed' && <span className="text-xs text-slate-500 italic">Dismissed</span>}
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
const UsersTab: React.FC<{
  onRaiseDeleteRequest: (request: Omit<DeleteRequest, 'id' | 'status' | 'createdAt'>) => void;
}> = ({ onRaiseDeleteRequest }) => {
  const { lang } = useI18n();
  const { role } = useAuth();
  const [users, setUsers] = useState(mockUsers);
  const [searchQuery, setSearchQuery] = useState('');

  const canRaiseDeleteRequest = hasRoleAtLeast(role, 'moderator');

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    const lowerQuery = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(lowerQuery) ||
        u.handle.toLowerCase().includes(lowerQuery) ||
        u.email.toLowerCase().includes(lowerQuery)
    );
  }, [users, searchQuery]);

  const handleToggleSuspend = (uid: string) => {
    setUsers(users.map((u) => (u.uid === uid ? { ...u, isSuspended: !u.isSuspended } : u)));
  };

  const handleRaiseDeleteRequest = (user: (typeof mockUsers)[number]) => {
    if (!canRaiseDeleteRequest) return;
    const promptText =
      lang === 'en'
        ? `Reason for delete request on ${user.handle}:`
        : `سبب طلب الحذف للمستخدم ${user.handle}:`;
    const reason = prompt(promptText);
    if (!reason || reason.trim().length === 0) return;

    onRaiseDeleteRequest({
      targetUid: user.uid,
      targetName: user.name,
      targetHandle: user.handle,
      raisedByRole: role,
      reason: reason.trim(),
    });
  };

  return (
    <div className="space-y-4">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">{lang === 'en' ? 'Users' : 'المستخدمون'}</BilingualText>
      <InputField
        id="user-search"
        label=""
        type="search"
        placeholder={lang === 'en' ? 'Search users...' : 'ابحث عن المستخدمين...'}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <div className="space-y-2">
        {filteredUsers.map((user) => (
          <GlassCard key={user.uid} className="!p-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-grow">
                <img src={user.avatarUrl} alt={user.name} className="h-10 w-10 rounded-full" />
                <div className="overflow-hidden">
                  <p className={`font-bold truncate ${user.isSuspended ? 'line-through text-slate-500' : ''}`}>
                    {user.name} <span className="font-normal text-slate-400">{user.handle}</span>
                  </p>
                  <p className="text-sm text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                <BilingualText role="Caption">
                  Reports:{' '}
                  <span className={`font-semibold ${user.reportsCount && user.reportsCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {user.reportsCount || 0}
                  </span>
                </BilingualText>
                <Button variant="ghost" className="!text-xs" onClick={() => handleToggleSuspend(user.uid)}>
                  {user.isSuspended ? 'Unsuspend' : 'Suspend'}
                </Button>
                {canRaiseDeleteRequest && (
                  <Button
                    variant="secondary"
                    className="!text-xs"
                    onClick={() => handleRaiseDeleteRequest(user)}
                  >
                    {lang === 'en' ? 'Raise Delete Request' : 'إنشاء طلب حذف'}
                  </Button>
                )}
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
    return feedbackItems.filter((item) => item.status.toLowerCase().includes(filter));
  }, [feedbackItems, filter]);

  const handleStatusChange = (id: string, newStatus: AdminFeedback['status']) => {
    setFeedbackItems(feedbackItems.map((item) => (item.id === id ? { ...item, status: newStatus } : item)));
  };

  return (
    <div className="space-y-4">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">{lang === 'en' ? 'User Feedback' : 'ملاحظات المستخدمين'}</BilingualText>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {['all', 'new', 'in_progress', 'resolved'].map((f) => (
          <Button key={f} variant={filter === f ? 'primary' : 'ghost'} onClick={() => setFilter(f)} className="flex-shrink-0 capitalize">
            {f.replace('_', ' ')}
          </Button>
        ))}
      </div>
      {filteredItems.map((item) => (
        <GlassCard key={item.id} className="!p-3">
          <p className="text-xs font-semibold text-accent">
            {item.type} <span className="font-normal text-slate-400">from {item.userHandle}</span>
          </p>
          <p className="mt-1">{item.text}</p>
          <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
            <BilingualText role="Caption">
              Status: <span className="font-semibold">{item.status}</span>
            </BilingualText>
            <select
              onChange={(e) => handleStatusChange(item.id, e.target.value as AdminFeedback['status'])}
              value={item.status}
              className="bg-slate-700 text-white text-xs rounded p-1"
            >
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

const DeletionRequestsTab: React.FC<{
  role: UserRole;
  requests: DeleteRequest[];
  onUpdateStatus: (id: string, status: DeleteRequestStatus) => void;
}> = ({ role, requests, onUpdateStatus }) => {
  const { lang } = useI18n();
  const canApprove = hasRoleAtLeast(role, 'superadmin');

  if (!canApprove) {
    return (
      <GlassCard className="!p-6">
        <BilingualText className="text-slate-300">
          {lang === 'en'
            ? 'Deletion requests are raised by moderators and approved by superadmins.'
            : 'يتم إنشاء طلبات الحذف من المشرفين وتتم الموافقة عليها من السوبر أدمن.'}
        </BilingualText>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">
        {lang === 'en' ? 'Deletion Requests' : 'طلبات الحذف'}
      </BilingualText>

      {requests.length === 0 ? (
        <GlassCard className="!p-6 text-slate-400">
          {lang === 'en' ? 'No pending deletion requests.' : 'لا توجد طلبات حذف معلقة.'}
        </GlassCard>
      ) : (
        requests.map((req) => (
          <GlassCard key={req.id} className="!p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">{req.targetName} <span className="text-slate-400">{req.targetHandle}</span></p>
                <span className={cn(
                  'text-[10px] font-black uppercase px-2 py-1 rounded',
                  req.status === 'pending' && 'bg-amber-500/20 text-amber-300',
                  req.status === 'approved' && 'bg-green-500/20 text-green-300',
                  req.status === 'rejected' && 'bg-red-500/20 text-red-300'
                )}>{req.status}</span>
              </div>
              <p className="text-sm text-slate-300">{req.reason}</p>
              <p className="text-xs text-slate-500">{new Date(req.createdAt).toLocaleString()}</p>
              {req.status === 'pending' && (
                <div className="flex gap-2">
                  <Button variant="primary" className="!text-xs" onClick={() => onUpdateStatus(req.id, 'approved')}>
                    {lang === 'en' ? 'Approve' : 'موافقة'}
                  </Button>
                  <Button variant="ghost" className="!text-xs" onClick={() => onUpdateStatus(req.id, 'rejected')}>
                    {lang === 'en' ? 'Reject' : 'رفض'}
                  </Button>
                </div>
              )}
            </div>
          </GlassCard>
        ))
      )}
    </div>
  );
};

const PlaceholderTab: React.FC<{ title: string; subtitle: string; icon?: React.FC<any> }> = ({ title, subtitle, icon: Icon }) => (
  <div className="flex items-center justify-center h-64 text-slate-500">
    <div className="text-center">
      {Icon ? <Icon className="h-12 w-12 mx-auto mb-2 opacity-50" /> : null}
      <p className="font-semibold">{title}</p>
      <p className="text-sm mt-1">{subtitle}</p>
    </div>
  </div>
);

const MarketplaceTab: React.FC = () => (
  <PlaceholderTab title="Marketplace" subtitle="Module coming soon" icon={BasketIcon} />
);

const ControlCenterScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate } = useNavigation();
  const { role, isAdmin } = useAuth();
  const [activeSection, setActiveSection] = useState<ControlSectionId>('moderation');
  const [deleteRequests, setDeleteRequests] = useState<DeleteRequest[]>([]);

  const handleBack = () => navigate({ type: 'tab', id: 'home' });

  const visibleSections = useMemo(
    () => CONTROL_SECTIONS.filter((section) => hasRoleAtLeast(role, section.minimumRole)),
    [role]
  );

  useEffect(() => {
    if (visibleSections.length === 0) return;
    const stillVisible = visibleSections.some((section) => section.id === activeSection);
    if (!stillVisible) {
      setActiveSection(visibleSections[0].id);
    }
  }, [activeSection, visibleSections]);

  const visibleDomains = useMemo(
    () =>
      CONTROL_DOMAINS.map((domain) => ({
        ...domain,
        sections: visibleSections.filter((section) => section.domain === domain.id),
      })).filter((domain) => domain.sections.length > 0),
    [visibleSections]
  );

  const pendingDeleteApprovals = useMemo(
    () => deleteRequests.filter((request) => request.status === 'pending').length,
    [deleteRequests]
  );

  const isSuperadmin = hasRoleAtLeast(role, 'superadmin');

  const handleRaiseDeleteRequest = (request: Omit<DeleteRequest, 'id' | 'status' | 'createdAt'>) => {
    setDeleteRequests((prev) => [
      {
        ...request,
        id: crypto.randomUUID(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const handleUpdateDeleteRequestStatus = (id: string, status: DeleteRequestStatus) => {
    setDeleteRequests((prev) => prev.map((request) => (request.id === id ? { ...request, status } : request)));
  };

  if (!isAdmin) {
    return (
      <div className="h-screen flex flex-col">
        <ScreenHeader titleEn="Control Center" titleAr="مركز التحكم" onBack={handleBack} />
        <main className="flex-grow flex items-center justify-center text-center p-4">
          <BilingualText role="H1" className="text-white/70">
            {lang === 'en' ? 'You do not have permission to access this area.' : 'ليس لديك إذن للوصول إلى هذه المنطقة.'}
          </BilingualText>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <ScreenHeader titleEn="Control Center" titleAr="مركز التحكم" onBack={handleBack} />

      {/* --- Role Visibility Strip --- */}
      <div className="flex items-center justify-between px-6 py-2 bg-black/20 border-b border-white/10">
        <span className="text-xs text-slate-400">
          Signed in as: <span className="font-semibold text-white uppercase">{role}</span>
        </span>

        {role === 'superadmin' && (
          <span className="text-[10px] font-black px-2 py-1 rounded bg-red-500/20 text-red-300">
            SUPERADMIN
          </span>
        )}

        {role === 'moderator' && (
          <span className="text-[10px] font-black px-2 py-1 rounded bg-blue-500/20 text-blue-300">
            MODERATOR
          </span>
        )}
      </div>
      {/* --- End Role Visibility Strip --- */}

      <main className="flex-grow overflow-hidden flex flex-col md:flex-row pt-20">
        <nav
          className={cn(
            'bg-slate-800/50 backdrop-blur-md border-b md:border-b-0 md:border-r border-white/10',
            'w-full md:w-72 md:h-full overflow-y-auto flex-shrink-0'
          )}
        >
          <div className="p-2 md:p-4 space-y-4">
            {visibleDomains.map((domain) => (
              <div key={domain.id} className="rounded-xl border border-white/10 bg-black/10 p-2">
                <div className="px-2 pb-2 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                    {lang === 'en' ? domain.en : domain.ar}
                  </span>
                  {isSuperadmin && domain.id === 'operations' && pendingDeleteApprovals > 0 && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      {pendingDeleteApprovals}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {domain.sections.map((section) => {
                    const isActive = activeSection === section.id;
                    const showApprovalsBadge =
                      isSuperadmin && section.id === 'deletion_requests' && pendingDeleteApprovals > 0;

                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={cn(
                          'w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-all text-left',
                          isActive
                            ? 'bg-primary text-white shadow-lg'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <section.icon className={cn('h-5 w-5', isActive ? 'text-white' : 'text-current')} />
                          <span className="font-medium text-sm">{lang === 'en' ? section.en : section.ar}</span>
                        </span>
                        {showApprovalsBadge && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            {pendingDeleteApprovals}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-slate-900/50">
          <div className="max-w-5xl mx-auto">
            {activeSection === 'users' && <UsersTab onRaiseDeleteRequest={handleRaiseDeleteRequest} />}
            {activeSection === 'moderation' && <ModerationTab />}
            {activeSection === 'feedback' && <FeedbackTab />}
            {activeSection === 'deletion_requests' && (
              <DeletionRequestsTab
                role={role}
                requests={deleteRequests}
                onUpdateStatus={handleUpdateDeleteRequestStatus}
              />
            )}
            {activeSection === 'analytics' && (
              <PlaceholderTab
                title={lang === 'en' ? 'Analytics' : 'التحليلات'}
                subtitle={lang === 'en' ? 'Operational metrics panel.' : 'لوحة مؤشرات تشغيلية.'}
                icon={AnalyticsIcon}
              />
            )}
            {activeSection === 'ai_governance' && (
              <PlaceholderTab
                title={lang === 'en' ? 'AI Governance' : 'حوكمة الذكاء الاصطناعي'}
                subtitle={lang === 'en' ? 'Policy and model controls.' : 'سياسات وضوابط النماذج.'}
                icon={BrainIcon}
              />
            )}
            {activeSection === 'catalog' && (
              <PlaceholderTab
                title={lang === 'en' ? 'Catalog' : 'الكتالوج'}
                subtitle={lang === 'en' ? 'Catalog quality controls.' : 'ضوابط جودة الكتالوج.'}
                icon={BookIcon}
              />
            )}
            {activeSection === 'curation' && (
              <PlaceholderTab
                title={lang === 'en' ? 'Curation' : 'التنسيق'}
                subtitle={lang === 'en' ? 'Editorial curation workflows.' : 'سير عمل التنسيق التحريري.'}
                icon={StarIcon}
              />
            )}
            {activeSection === 'marketplace' && <MarketplaceTab />}
            {activeSection === 'system_jobs' && (
              <PlaceholderTab
                title={lang === 'en' ? 'System Jobs' : 'مهام النظام'}
                subtitle={lang === 'en' ? 'Background operations queue.' : 'قائمة عمليات النظام الخلفية.'}
                icon={SettingsIcon}
              />
            )}
            {activeSection === 'settings' && (
              <PlaceholderTab
                title={lang === 'en' ? 'Settings' : 'الإعدادات'}
                subtitle={lang === 'en' ? 'Global control center settings.' : 'إعدادات مركز التحكم العامة.'}
                icon={SettingsIcon}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ControlCenterScreen;
