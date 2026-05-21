import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AdminFeedbackActivity,
  AdminFeedbackReport,
} from '../../contracts/apiContracts.ts';
import type {
  AdminFeedbackDetail,
  AdminFeedbackFilters,
  AdminFeedbackPage,
} from '../services/adminService.ts';

const FEEDBACK_COLLECTION = 'feedback_reports';
const ACTIVITY_COLLECTION = 'activity';
const REALTIME_MAX_LIMIT = 50;

function toIsoTimestamp(value: unknown): string {
  if (value && typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

export function serializeRealtimeFeedbackReport(snapshot: QueryDocumentSnapshot<DocumentData>): AdminFeedbackReport {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    uid: typeof data.uid === 'string' ? data.uid : '',
    source: data.source,
    intentType: data.intentType,
    status: data.status,
    text: typeof data.text === 'string' ? data.text : '',
    contactEmail: typeof data.contactEmail === 'string' ? data.contactEmail : null,
    clientContext: data.clientContext && typeof data.clientContext === 'object' ? data.clientContext : null,
    serverContext: data.serverContext && typeof data.serverContext === 'object'
      ? data.serverContext
      : {
          authRole: 'unknown',
          callableRegion: 'unknown',
          correlationId: 'unknown',
          schemaVersion: 1,
        },
    createdAt: toIsoTimestamp(data.createdAt),
    updatedAt: toIsoTimestamp(data.updatedAt),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
  };
}

export function serializeRealtimeFeedbackActivity(snapshot: QueryDocumentSnapshot<DocumentData>): AdminFeedbackActivity {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    type: data.type,
    actorUid: typeof data.actorUid === 'string' ? data.actorUid : '',
    createdAt: toIsoTimestamp(data.createdAt),
    payload: data.payload && typeof data.payload === 'object' ? data.payload : {},
  };
}

export function applyRealtimeReports(current: AdminFeedbackPage | undefined, reports: AdminFeedbackReport[]): AdminFeedbackPage {
  return {
    reports,
    nextCursor: current?.nextCursor ?? null,
  };
}

export function mergeRealtimeReportDetail(current: AdminFeedbackDetail | undefined, report: AdminFeedbackReport): AdminFeedbackDetail | undefined {
  if (!current) return undefined;
  return {
    ...current,
    report,
  };
}

export function mergeRealtimeActivityDetail(current: AdminFeedbackDetail | undefined, activity: AdminFeedbackActivity[]): AdminFeedbackDetail | undefined {
  if (!current) return undefined;
  return {
    ...current,
    activity,
  };
}

function normalizeLimit(value: number | undefined): number {
  return Math.min(Math.max(value ?? 25, 1), REALTIME_MAX_LIMIT);
}

function buildListConstraints(filters: AdminFeedbackFilters): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  if (filters.status) constraints.push(where('status', '==', filters.status));
  if (filters.source) constraints.push(where('source', '==', filters.source));
  if (filters.intentType) constraints.push(where('intentType', '==', filters.intentType));
  if (filters.createdFrom) constraints.push(where('createdAt', '>=', Timestamp.fromDate(new Date(filters.createdFrom))));
  if (filters.createdTo) constraints.push(where('createdAt', '<=', Timestamp.fromDate(new Date(filters.createdTo))));
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(normalizeLimit(filters.limit)));
  return constraints;
}

export function subscribeToFeedbackReports(
  firestore: Firestore,
  filters: AdminFeedbackFilters,
  onReports: (reports: AdminFeedbackReport[]) => void,
  onError: (error: Error) => void
): Unsubscribe | null {
  if (filters.cursor) return null;

  const feedbackQuery = query(
    collection(firestore, FEEDBACK_COLLECTION),
    ...buildListConstraints(filters)
  );

  return onSnapshot(
    feedbackQuery,
    (snapshot) => {
      onReports(snapshot.docs.map(serializeRealtimeFeedbackReport));
    },
    onError
  );
}

export function subscribeToFeedbackReport(
  firestore: Firestore,
  feedbackId: string,
  onReport: (report: AdminFeedbackReport) => void,
  onError: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(firestore, FEEDBACK_COLLECTION, feedbackId),
    (snapshot) => {
      if (!snapshot.exists()) return;
      onReport(serializeRealtimeFeedbackReport(snapshot as QueryDocumentSnapshot<DocumentData>));
    },
    onError
  );
}

export function subscribeToFeedbackActivity(
  firestore: Firestore,
  feedbackId: string,
  onActivity: (activity: AdminFeedbackActivity[]) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const activityQuery = query(
    collection(firestore, FEEDBACK_COLLECTION, feedbackId, ACTIVITY_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(200)
  );

  return onSnapshot(
    activityQuery,
    (snapshot) => {
      onActivity(snapshot.docs.map(serializeRealtimeFeedbackActivity));
    },
    onError
  );
}
