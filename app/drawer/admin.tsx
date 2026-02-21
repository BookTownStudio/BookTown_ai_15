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

import { useTransitionModerationStage, useApplyModerationAction } from '../../lib/hooks/useModeration.ts';
import { useMutation, useQuery, useQueryClient } from '../../lib/react-query.ts';
import { db } from '../../lib/firebase.ts';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import {
  adminService,
  adminServiceQueryKeys,
  type DeletionRequest,
  type DeletionReviewDecision,
} from '../../lib/services/adminService.ts';

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
  onRaiseDeleteRequest: (targetUid: string, reason: string) => Promise<void>;
  isSubmitting: boolean;
  submissionError: string | null;
}> = ({ onRaiseDeleteRequest, isSubmitting, submissionError }) => {
  const { lang } = useI18n();
  const { role } = useAuth();
  const [targetUid, setTargetUid] = useState('');
  const [reason, setReason] = useState('');
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);

  const canRaiseDeleteRequest = hasRoleAtLeast(role, 'moderator');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRaiseDeleteRequest) return;

    const normalizedTargetUid = targetUid.trim();
    const normalizedReason = reason.trim();
    if (!normalizedTargetUid) {
      setLocalValidationError(lang === 'en' ? 'Target UID is required.' : 'معرف المستخدم المستهدف مطلوب.');
      return;
    }
    if (!normalizedReason) {
      setLocalValidationError(lang === 'en' ? 'Reason is required.' : 'السبب مطلوب.');
      return;
    }

    setLocalValidationError(null);
    try {
      await onRaiseDeleteRequest(normalizedTargetUid, normalizedReason);
      setTargetUid('');
      setReason('');
    } catch (error) {
      setLocalValidationError(
        toErrorMessage(
          error,
          lang === 'en' ? 'Failed to submit deletion request.' : 'تعذر إرسال طلب الحذف.'
        )
      );
    }
  };

  return (
    <div className="space-y-4">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">
        {lang === 'en' ? 'Users' : 'المستخدمون'}
      </BilingualText>

      <GlassCard className="!p-4 space-y-4">
        <BilingualText className="text-slate-300">
          {lang === 'en'
            ? 'Submit a deletion request by target UID. Requests are reviewed and executed in the Deletion Requests section.'
            : 'قم بإنشاء طلب حذف باستخدام معرف المستخدم. تتم مراجعة الطلبات وتنفيذها في قسم طلبات الحذف.'}
        </BilingualText>

        <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
          <InputField
            id="delete-target-uid"
            label={lang === 'en' ? 'Target UID' : 'معرف المستخدم المستهدف'}
            type="text"
            value={targetUid}
            onChange={(e) => setTargetUid(e.target.value)}
            placeholder={lang === 'en' ? 'Enter target user UID' : 'أدخل معرف المستخدم'}
            disabled={!canRaiseDeleteRequest || isSubmitting}
          />
          <label htmlFor="delete-request-reason" className="block text-xs text-slate-400">
            {lang === 'en' ? 'Reason' : 'السبب'}
          </label>
          <textarea
            id="delete-request-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={lang === 'en' ? 'Required moderation reason' : 'سبب الحذف المطلوب'}
            className="w-full min-h-28 rounded-md border border-slate-600 bg-slate-800 p-3 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canRaiseDeleteRequest || isSubmitting}
          />

          {localValidationError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {localValidationError}
            </div>
          )}

          {submissionError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {submissionError}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="secondary"
              className="!text-xs"
              disabled={!canRaiseDeleteRequest || isSubmitting}
            >
              {isSubmitting
                ? (lang === 'en' ? 'Submitting...' : 'جار الإرسال...')
                : (lang === 'en' ? 'Raise Delete Request' : 'إنشاء طلب حذف')}
            </Button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
};

// --- Feedback Tab ---
const FeedbackTab: React.FC = () => {
  const { lang } = useI18n();
  return (
    <div className="space-y-4">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">
        {lang === 'en' ? 'User Feedback' : 'ملاحظات المستخدمين'}
      </BilingualText>
      <GlassCard className="!p-6 text-slate-400">
        {lang === 'en'
          ? 'Feedback pipeline will be connected to backend sources in a dedicated phase.'
          : 'سيتم ربط مسار الملاحظات بمصادر الخلفية في مرحلة مستقلة.'}
      </GlassCard>
    </div>
  );
};

const DeletionRequestsTab: React.FC<{
  role: UserRole;
  requests: DeleteRequest[];
  isLoading: boolean;
  loadError: string | null;
  actionError: string | null;
  isReviewing: boolean;
  isExecuting: boolean;
  onReview: (id: string, decision: DeletionReviewDecision) => void;
  onExecute: (id: string) => void;
}> = ({
  role,
  requests,
  isLoading,
  loadError,
  actionError,
  isReviewing,
  isExecuting,
  onReview,
  onExecute,
}) => {
  const { lang } = useI18n();
  const canApprove = hasRoleAtLeast(role, 'superadmin');

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner />
      </div>
    );
  }

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

      {loadError && (
        <GlassCard className="!p-4 border border-red-500/30 bg-red-500/10 text-red-300">
          {loadError}
        </GlassCard>
      )}

      {actionError && (
        <GlassCard className="!p-4 border border-red-500/30 bg-red-500/10 text-red-300">
          {actionError}
        </GlassCard>
      )}

      {requests.length === 0 ? (
        <GlassCard className="!p-6 text-slate-400">
          {lang === 'en' ? 'No deletion requests found.' : 'لا توجد طلبات حذف.'}
        </GlassCard>
      ) : (
        requests.map((req) => (
          <GlassCard key={req.id} className="!p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">
                  UID: <span className="text-slate-300">{req.targetUid}</span>
                </p>
                <span className={cn(
                  'text-[10px] font-black uppercase px-2 py-1 rounded',
                  req.status === 'pending' && 'bg-amber-500/20 text-amber-300',
                  req.status === 'approved' && 'bg-green-500/20 text-green-300',
                  req.status === 'rejected' && 'bg-red-500/20 text-red-300',
                  req.status === 'executed' && 'bg-blue-500/20 text-blue-300'
                )}>{req.status}</span>
              </div>
              <p className="text-sm text-slate-300">{req.reason}</p>
              <p className="text-xs text-slate-500">
                {lang === 'en' ? 'Raised by:' : 'أُنشئ بواسطة:'} {req.raisedByUid}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(req.createdAt).toLocaleString()}
              </p>
              {req.status === 'pending' && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="!text-xs"
                    onClick={() => onReview(req.id, 'approved')}
                    disabled={isReviewing || isExecuting}
                  >
                    {lang === 'en' ? 'Approve' : 'موافقة'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="!text-xs"
                    onClick={() => onReview(req.id, 'rejected')}
                    disabled={isReviewing || isExecuting}
                  >
                    {lang === 'en' ? 'Reject' : 'رفض'}
                  </Button>
                </div>
              )}
              {req.status === 'approved' && (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="!text-xs !bg-red-700"
                    onClick={() => onExecute(req.id)}
                    disabled={isExecuting || isReviewing}
                  >
                    {lang === 'en' ? 'Execute Soft Delete' : 'تنفيذ الحذف الناعم'}
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

function toErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallbackMessage;
}

const ControlCenterScreen: React.FC = () => {
  const { lang } = useI18n();
  const { navigate } = useNavigation();
  const { role, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<ControlSectionId>('moderation');

  const handleBack = () => navigate({ type: 'tab', id: 'home' });

  const canAccessDeletionRequests = hasRoleAtLeast(role, 'moderator');

  const {
    data: deleteRequests = [],
    isLoading: isDeleteRequestsLoading,
    isError: isDeleteRequestsError,
    error: deleteRequestsError,
  } = useQuery<DeletionRequest[]>({
    queryKey: adminServiceQueryKeys.deletionRequests,
    queryFn: () => adminService.listDeletionRequests(),
    enabled: isAdmin && canAccessDeletionRequests,
  });

  const createDeletionRequestMutation = useMutation<void, { targetUid: string; reason: string }>({
    mutationFn: ({ targetUid, reason }) => adminService.createDeletionRequest(targetUid, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.deletionRequests });
    },
  });

  const reviewDeletionRequestMutation = useMutation<
    void,
    { requestId: string; decision: DeletionReviewDecision; note?: string }
  >({
    mutationFn: ({ requestId, decision, note }) =>
      adminService.reviewDeletionRequest(requestId, decision, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.deletionRequests });
    },
  });

  const executeDeletionMutation = useMutation<void, { requestId: string }>({
    mutationFn: ({ requestId }) => adminService.executeDeletion(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.deletionRequests });
    },
  });

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

  const handleRaiseDeleteRequest = async (targetUid: string, reason: string): Promise<void> => {
    await createDeletionRequestMutation.mutateAsync({ targetUid, reason });
  };

  const handleReviewDeleteRequest = (requestId: string, decision: DeletionReviewDecision): void => {
    const promptText =
      lang === 'en'
        ? 'Optional reviewer note:'
        : 'ملاحظة المراجع (اختيارية):';
    const note = prompt(promptText);
    reviewDeletionRequestMutation.mutate({
      requestId,
      decision,
      note: typeof note === 'string' ? note.trim() : undefined,
    });
  };

  const handleExecuteDeleteRequest = (requestId: string): void => {
    executeDeletionMutation.mutate({ requestId });
  };

  const deleteRequestLoadError = isDeleteRequestsError
    ? toErrorMessage(
        deleteRequestsError,
        lang === 'en'
          ? 'Failed to load deletion requests.'
          : 'تعذر تحميل طلبات الحذف.'
      )
    : null;

  const createRequestError = createDeletionRequestMutation.isError
    ? toErrorMessage(
        createDeletionRequestMutation.error,
        lang === 'en'
          ? 'Failed to create deletion request.'
          : 'تعذر إنشاء طلب الحذف.'
      )
    : null;

  const reviewOrExecuteError = reviewDeletionRequestMutation.isError
    ? toErrorMessage(
        reviewDeletionRequestMutation.error,
        lang === 'en'
          ? 'Failed to review deletion request.'
          : 'تعذر مراجعة طلب الحذف.'
      )
    : executeDeletionMutation.isError
      ? toErrorMessage(
          executeDeletionMutation.error,
          lang === 'en'
            ? 'Failed to execute deletion request.'
            : 'تعذر تنفيذ طلب الحذف.'
        )
      : null;

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

      <div className="pt-20 flex flex-col flex-grow overflow-hidden">
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

          {role === 'user' && (
            <span className="text-[10px] font-black px-2 py-1 rounded bg-slate-500/20 text-slate-300">
              USER
            </span>
          )}
        </div>
        {/* --- End Role Visibility Strip --- */}

        <main className="flex-grow overflow-hidden flex flex-col md:flex-row">
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
              {activeSection === 'users' && (
                <UsersTab
                  onRaiseDeleteRequest={handleRaiseDeleteRequest}
                  isSubmitting={createDeletionRequestMutation.isLoading}
                  submissionError={createRequestError}
                />
              )}
              {activeSection === 'moderation' && <ModerationTab />}
              {activeSection === 'feedback' && <FeedbackTab />}
              {activeSection === 'deletion_requests' && (
                <DeletionRequestsTab
                  role={role}
                  requests={deleteRequests}
                  isLoading={isDeleteRequestsLoading}
                  loadError={deleteRequestLoadError}
                  actionError={reviewOrExecuteError}
                  isReviewing={reviewDeletionRequestMutation.isLoading}
                  isExecuting={executeDeletionMutation.isLoading}
                  onReview={handleReviewDeleteRequest}
                  onExecute={handleExecuteDeleteRequest}
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
    </div>
  );
};

export default ControlCenterScreen;
