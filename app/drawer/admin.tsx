import React, { useEffect, useMemo, useState } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
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
import CatalogAuthorityTab from '../../components/admin/CatalogAuthorityTab.tsx';

import { useTransitionModerationStage, useApplyModerationAction } from '../../lib/hooks/useModeration.ts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '../../lib/react-query.ts';
import { db } from '../../lib/firebase.ts';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import {
  type AdminSystemEvent,
  adminService,
  adminServiceQueryKeys,
  type AdminUserSearchResult,
  type DeletionRequest,
  type DeletionReviewDecision,
  type RecentSystemEventsParams,
  type SystemEventsPage,
  type SystemHealthSnapshot,
  type SystemMetricsDailyEntry,
  type SystemMetricsDailyRangeParams,
  type SystemMetricsSnapshot,
} from '../../lib/services/adminService.ts';

type ControlSectionId =
  | 'users'
  | 'moderation'
  | 'analytics'
  | 'events'
  | 'health'
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
  { id: 'events', en: 'Events', ar: 'الأحداث', icon: FlagIcon, minimumRole: 'moderator', domain: 'intelligence' },
  { id: 'health', en: 'Health', ar: 'الصحة', icon: SettingsIcon, minimumRole: 'moderator', domain: 'intelligence' },
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
  const { mutate: transitionStage, isPending: isTransitioning } = useTransitionModerationStage();
  const { mutate: applyAction, isPending: isActing } = useApplyModerationAction();

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
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserSearchResult | null>(null);
  const [reason, setReason] = useState('');
  const [localValidationError, setLocalValidationError] = useState<string | null>(null);

  const canRaiseDeleteRequest = hasRoleAtLeast(role, 'moderator');
  const normalizedSearchQuery = debouncedSearchQuery.trim();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const {
    data: searchResults = [],
    isLoading: isSearchLoading,
    isError: isSearchError,
    error: searchError,
  } = useQuery<AdminUserSearchResult[]>({
    queryKey: ['admin', 'userSearch', normalizedSearchQuery.toLowerCase()],
    queryFn: () => adminService.searchUsers(normalizedSearchQuery),
    enabled: canRaiseDeleteRequest && normalizedSearchQuery.length >= 2,
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canRaiseDeleteRequest) return;

    const normalizedReason = reason.trim();
    if (!selectedUser) {
      setLocalValidationError(
        lang === 'en'
          ? 'Select a user from search results.'
          : 'اختر مستخدمًا من نتائج البحث.'
      );
      return;
    }
    if (!normalizedReason) {
      setLocalValidationError(lang === 'en' ? 'Reason is required.' : 'السبب مطلوب.');
      return;
    }

    setLocalValidationError(null);
    try {
      await onRaiseDeleteRequest(selectedUser.uid, normalizedReason);
      setSearchQuery('');
      setDebouncedSearchQuery('');
      setSelectedUser(null);
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
            id="delete-target-search"
            label={lang === 'en' ? 'Search User' : 'بحث المستخدم'}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedUser(null);
            }}
            placeholder={lang === 'en' ? 'Search by email or display name' : 'ابحث بالبريد الإلكتروني أو الاسم'}
            disabled={!canRaiseDeleteRequest || isSubmitting}
            autoComplete="off"
          />

          {isSearchLoading && normalizedSearchQuery.length >= 2 && (
            <div className="text-xs text-slate-400">
              {lang === 'en' ? 'Searching users...' : 'جار البحث عن المستخدمين...'}
            </div>
          )}

          {isSearchError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {toErrorMessage(
                searchError,
                lang === 'en'
                  ? 'Failed to search users.'
                  : 'تعذر البحث عن المستخدمين.'
              )}
            </div>
          )}

          {!selectedUser && normalizedSearchQuery.length >= 2 && !isSearchLoading && !isSearchError && (
            <div className="rounded-md border border-white/10 bg-slate-800/70 p-2 max-h-64 overflow-y-auto space-y-2">
              {searchResults.length === 0 ? (
                <div className="px-2 py-2 text-sm text-slate-400">
                  {lang === 'en' ? 'No users found.' : 'لا يوجد مستخدمون.'}
                </div>
              ) : (
                searchResults.map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() => {
                      setSelectedUser(user);
                      setSearchQuery(user.email || user.displayName);
                    }}
                    className="w-full text-left rounded-md border border-white/10 bg-black/20 hover:bg-black/30 px-3 py-2 transition-colors"
                  >
                    <p className="text-sm font-semibold text-white">{user.displayName}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                    <p className="text-[10px] uppercase text-slate-500">
                      {user.role} · {user.status}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}

          {selectedUser && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-sm font-semibold text-emerald-200">
                {lang === 'en' ? 'Selected user' : 'المستخدم المحدد'}
              </p>
              <p className="text-sm text-white">{selectedUser.displayName}</p>
              <p className="text-xs text-emerald-200/80">{selectedUser.email}</p>
              <p className="text-[10px] uppercase text-emerald-200/70">
                {selectedUser.role} · {selectedUser.status}
              </p>
            </div>
          )}

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

type MetricsCounterField = Exclude<keyof SystemMetricsDailyEntry, 'dateKey' | 'updatedAt'>;

const METRIC_FIELD_META: Array<{ key: MetricsCounterField; en: string; ar: string }> = [
  { key: 'totalUsers', en: 'Users', ar: 'المستخدمون' },
  { key: 'totalPosts', en: 'Posts', ar: 'المنشورات' },
  { key: 'totalReviews', en: 'Reviews', ar: 'المراجعات' },
  { key: 'totalQuotes', en: 'Quotes', ar: 'الاقتباسات' },
  { key: 'totalFollows', en: 'Follows', ar: 'المتابعات' },
  { key: 'totalDeletionRequests', en: 'Deletion Requests', ar: 'طلبات الحذف' },
  { key: 'executedDeletions', en: 'Executed Deletions', ar: 'الحذف المنفذ' },
];

const ANALYTICS_SECTIONS: Array<{
  key: keyof SystemMetricsSnapshot;
  en: string;
  ar: string;
}> = [
  { key: 'global', en: 'Global', ar: 'إجمالي' },
  { key: 'growth', en: 'Growth', ar: 'النمو' },
  { key: 'engagement', en: 'Engagement', ar: 'التفاعل' },
  { key: 'moderation', en: 'Moderation', ar: 'الرقابة' },
];

const METRICS_DAILY_DEFAULT_LIMIT = 30;
const SYSTEM_EVENTS_DEFAULT_LIMIT = 50;
const METRIC_NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

function formatMetricNumber(value: number): string {
  return METRIC_NUMBER_FORMATTER.format(value);
}

function formatTimestampLabel(value: string | null): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

const AnalyticsTab: React.FC = () => {
  const { lang } = useI18n();
  const dailyRangeParams = useMemo<SystemMetricsDailyRangeParams>(
    () => ({ limit: METRICS_DAILY_DEFAULT_LIMIT }),
    []
  );

  const {
    data: snapshot,
    isLoading: isSnapshotLoading,
    isError: isSnapshotError,
    error: snapshotError,
  } = useQuery<SystemMetricsSnapshot>({
    queryKey: adminServiceQueryKeys.analyticsSnapshot,
    queryFn: () => adminService.getSystemMetricsSnapshot(),
  });

  const {
    data: dailyRows = [],
    isLoading: isDailyLoading,
    isError: isDailyError,
    error: dailyError,
  } = useQuery<SystemMetricsDailyEntry[]>({
    queryKey: adminServiceQueryKeys.analyticsDailyRange(dailyRangeParams),
    queryFn: () => adminService.getSystemMetricsDailyRange(dailyRangeParams),
  });

  if (isSnapshotLoading || isDailyLoading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner />
      </div>
    );
  }

  const loadError = isSnapshotError
    ? toErrorMessage(
        snapshotError,
        lang === 'en' ? 'Failed to load analytics snapshot.' : 'تعذر تحميل ملخص التحليلات.'
      )
    : isDailyError
      ? toErrorMessage(
          dailyError,
          lang === 'en' ? 'Failed to load daily analytics.' : 'تعذر تحميل التحليلات اليومية.'
        )
      : null;

  if (loadError) {
    return (
      <GlassCard className="!p-4 border border-red-500/30 bg-red-500/10 text-red-300">
        {loadError}
      </GlassCard>
    );
  }

  if (!snapshot) {
    return (
      <GlassCard className="!p-6 text-slate-400">
        {lang === 'en'
          ? 'No analytics snapshot data is available.'
          : 'لا توجد بيانات ملخص التحليلات حالياً.'}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">
        {lang === 'en' ? 'Analytics' : 'التحليلات'}
      </BilingualText>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ANALYTICS_SECTIONS.map((section) => {
          const bucket = snapshot[section.key];
          return (
            <GlassCard key={section.key} className="!p-4">
              <p className="text-sm font-semibold text-white">
                {lang === 'en' ? section.en : section.ar}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {METRIC_FIELD_META.map((field) => (
                  <div key={`${section.key}_${field.key}`}>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      {lang === 'en' ? field.en : field.ar}
                    </p>
                    <p className="text-lg font-bold text-white">
                      {formatMetricNumber(bucket[field.key])}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                {lang === 'en' ? 'Updated:' : 'آخر تحديث:'} {formatTimestampLabel(bucket.updatedAt)}
              </p>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">
            {lang === 'en' ? 'Daily Time Series' : 'السلسلة الزمنية اليومية'}
          </p>
          <p className="text-xs text-slate-400">
            {lang === 'en'
              ? `Latest ${METRICS_DAILY_DEFAULT_LIMIT} days`
              : `آخر ${METRICS_DAILY_DEFAULT_LIMIT} يوم`}
          </p>
        </div>

        {dailyRows.length === 0 ? (
          <p className="text-sm text-slate-400">
            {lang === 'en' ? 'No daily metrics available.' : 'لا توجد بيانات يومية متاحة.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-white/10">
                  <th className="py-2 pr-3 font-semibold">{lang === 'en' ? 'Date' : 'التاريخ'}</th>
                  {METRIC_FIELD_META.map((field) => (
                    <th key={`daily_head_${field.key}`} className="py-2 pr-3 font-semibold whitespace-nowrap">
                      {lang === 'en' ? field.en : field.ar}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.dateKey} className="border-b border-white/5">
                    <td className="py-2 pr-3 text-slate-200 font-medium whitespace-nowrap">
                      {row.dateKey}
                    </td>
                    {METRIC_FIELD_META.map((field) => (
                      <td key={`daily_${row.dateKey}_${field.key}`} className="py-2 pr-3 text-slate-300 whitespace-nowrap">
                        {formatMetricNumber(row[field.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

const EventsTab: React.FC = () => {
  const { lang } = useI18n();
  const eventsParams = useMemo<RecentSystemEventsParams>(
    () => ({ limit: SYSTEM_EVENTS_DEFAULT_LIMIT }),
    []
  );

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<
    SystemEventsPage,
    Error,
    InfiniteData<SystemEventsPage, string | undefined>,
    ReturnType<typeof adminServiceQueryKeys.systemEvents>,
    string | undefined
  >({
    queryKey: adminServiceQueryKeys.systemEvents(eventsParams),
    queryFn: ({ pageParam }) =>
      adminService.getRecentSystemEvents({
        limit: eventsParams.limit,
        afterCursor: typeof pageParam === 'string' ? pageParam : undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: SystemEventsPage) => lastPage.nextCursor ?? undefined,
  });

  const pages = data?.pages ?? [];
  const events = useMemo<AdminSystemEvent[]>(
    () => pages.flatMap((page) => page.events),
    [pages]
  );
  const totalCountEstimate = pages[0]?.totalCountEstimate ?? 0;

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <GlassCard className="!p-4 border border-red-500/30 bg-red-500/10 text-red-300">
        {toErrorMessage(
          error,
          lang === 'en' ? 'Failed to load system events.' : 'تعذر تحميل أحداث النظام.'
        )}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">
        {lang === 'en' ? 'System Events' : 'أحداث النظام'}
      </BilingualText>

      <GlassCard className="!p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-white">
            {lang === 'en' ? 'Recent Events' : 'الأحداث الأخيرة'}
          </p>
          <p className="text-xs text-slate-400">
            {lang === 'en'
              ? `Estimated total: ${formatMetricNumber(totalCountEstimate)}`
              : `الإجمالي التقديري: ${formatMetricNumber(totalCountEstimate)}`}
          </p>
        </div>

        {events.length === 0 ? (
          <p className="text-sm text-slate-400">
            {lang === 'en' ? 'No system events available.' : 'لا توجد أحداث نظام متاحة.'}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-white/10">
                    <th className="py-2 pr-3 font-semibold">{lang === 'en' ? 'createdAt' : 'وقت الإنشاء'}</th>
                    <th className="py-2 pr-3 font-semibold">{lang === 'en' ? 'type' : 'النوع'}</th>
                    <th className="py-2 pr-3 font-semibold">{lang === 'en' ? 'uid' : 'المستخدم'}</th>
                    <th className="py-2 pr-3 font-semibold">{lang === 'en' ? 'entityId' : 'المعرف'}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-white/5">
                      <td className="py-2 pr-3 text-slate-200 whitespace-nowrap">
                        {formatTimestampLabel(event.createdAt)}
                      </td>
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{event.type}</td>
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{event.uid}</td>
                      <td className="py-2 pr-3 text-slate-300 whitespace-nowrap">{event.entityId ?? 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasNextPage && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  className="!text-xs"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage
                    ? (lang === 'en' ? 'Loading...' : 'جار التحميل...')
                    : (lang === 'en' ? 'Load More' : 'تحميل المزيد')}
                </Button>
              </div>
            )}
          </div>
        )}
      </GlassCard>
    </div>
  );
};

const HealthTab: React.FC = () => {
  const { lang } = useI18n();
  const {
    data: health,
    isLoading,
    isError,
    error,
  } = useQuery<SystemHealthSnapshot>({
    queryKey: adminServiceQueryKeys.systemHealthSnapshot,
    queryFn: () => adminService.getSystemHealthSnapshot(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <GlassCard className="!p-4 border border-red-500/30 bg-red-500/10 text-red-300">
        {toErrorMessage(
          error,
          lang === 'en' ? 'Failed to load system health.' : 'تعذر تحميل صحة النظام.'
        )}
      </GlassCard>
    );
  }

  if (!health) {
    return (
      <GlassCard className="!p-6 text-slate-400">
        {lang === 'en' ? 'No health snapshot available.' : 'لا توجد لقطة صحة متاحة.'}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <BilingualText role="H1" className="!text-2xl mb-4 hidden md:block">
        {lang === 'en' ? 'System Health' : 'صحة النظام'}
      </BilingualText>
      <GlassCard className="!p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-slate-400">{lang === 'en' ? 'Last global metrics update time' : 'آخر تحديث للمقاييس العامة'}</p>
            <p className="text-white font-semibold">{formatTimestampLabel(health.globalUpdatedAt)}</p>
          </div>
          <div>
            <p className="text-slate-400">{lang === 'en' ? 'Latest daily bucket date' : 'تاريخ أحدث حاوية يومية'}</p>
            <p className="text-white font-semibold">{health.latestDailyBucketDate ?? 'N/A'}</p>
          </div>
          <div>
            <p className="text-slate-400">{lang === 'en' ? 'Total events count' : 'إجمالي عدد الأحداث'}</p>
            <p className="text-white font-semibold">{formatMetricNumber(health.totalEventsCount)}</p>
          </div>
          <div>
            <p className="text-slate-400">{lang === 'en' ? 'Latest event type' : 'نوع آخر حدث'}</p>
            <p className="text-white font-semibold">{health.latestEventType ?? 'N/A'}</p>
          </div>
          <div>
            <p className="text-slate-400">{lang === 'en' ? 'Last post_created timestamp' : 'آخر توقيت post_created'}</p>
            <p className="text-white font-semibold">{formatTimestampLabel(health.lastPostCreatedAt)}</p>
          </div>
        </div>
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
          ? 'Feedback pipeline is not available in this build.'
          : 'قناة الملاحظات غير متاحة في هذا الإصدار.'}
      </GlassCard>
    </div>
  );
};

const DeletionRequestsTab: React.FC<{
  role: UserRole;
  requests: DeletionRequest[];
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

  const createDeletionRequestMutation = useMutation<void, Error, { targetUid: string; reason: string }>({
    mutationFn: ({ targetUid, reason }) => adminService.createDeletionRequest(targetUid, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.deletionRequests });
    },
  });

  const reviewDeletionRequestMutation = useMutation<
    void,
    Error,
    { requestId: string; decision: DeletionReviewDecision; note?: string }
  >({
    mutationFn: ({ requestId, decision, note }) =>
      adminService.reviewDeletionRequest(requestId, decision, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.deletionRequests });
    },
  });

  const executeDeletionMutation = useMutation<void, Error, { requestId: string }>({
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
        <main className="flex-grow overflow-y-auto pt-24 pb-8">
          <div className="app-frame__inner">
            <div className="mx-auto w-full max-w-[var(--app-rail-admin)] px-4 md:px-0">
              <div className="min-h-[20rem] flex items-start justify-center pt-12 text-center">
                <BilingualText role="H1" className="text-white/70">
                  {lang === 'en' ? 'You do not have permission to access this area.' : 'ليس لديك إذن للوصول إلى هذه المنطقة.'}
                </BilingualText>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <ScreenHeader titleEn="Control Center" titleAr="مركز التحكم" onBack={handleBack} />

      <div className="pt-20 flex flex-col flex-grow overflow-hidden">
        <div className="app-frame__inner h-full">
          <div className="mx-auto flex h-full w-full max-w-[var(--app-rail-admin)] flex-col overflow-hidden px-4 md:px-0">
        {/* --- Role Visibility Strip --- */}
        <div className="flex items-center justify-between rounded-t-2xl border border-white/10 border-b-0 px-6 py-2 bg-black/20">
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

        <main className="flex-grow overflow-hidden flex flex-col md:flex-row rounded-b-2xl border border-white/10 bg-slate-900/55">
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
            <div className="app-rail app-rail--admin px-0">
              {activeSection === 'users' && (
                <UsersTab
                  onRaiseDeleteRequest={handleRaiseDeleteRequest}
                  isSubmitting={createDeletionRequestMutation.isPending}
                  submissionError={createRequestError}
                />
              )}
              {activeSection === 'moderation' && <ModerationTab />}
              {activeSection === 'deletion_requests' && (
                <DeletionRequestsTab
                  role={role}
                  requests={deleteRequests}
                  isLoading={isDeleteRequestsLoading}
                  loadError={deleteRequestLoadError}
                  actionError={reviewOrExecuteError}
                  isReviewing={reviewDeletionRequestMutation.isPending}
                  isExecuting={executeDeletionMutation.isPending}
                  onReview={handleReviewDeleteRequest}
                  onExecute={handleExecuteDeleteRequest}
                />
              )}
              {activeSection === 'analytics' && (
                <AnalyticsTab />
              )}
              {activeSection === 'events' && (
                <EventsTab />
              )}
              {activeSection === 'health' && (
                <HealthTab />
              )}
              {activeSection === 'feedback' && <FeedbackTab />}
              {activeSection === 'ai_governance' && (
                <PlaceholderTab
                  title={lang === 'en' ? 'AI Governance' : 'حوكمة الذكاء الاصطناعي'}
                  subtitle={lang === 'en' ? 'Policy and model controls.' : 'سياسات وضوابط النماذج.'}
                  icon={BrainIcon}
                />
              )}
              {activeSection === 'catalog' && (
                <CatalogAuthorityTab />
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
      </div>
    </div>
  );
};

export default ControlCenterScreen;
