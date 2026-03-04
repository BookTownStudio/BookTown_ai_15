import { useQuery } from '../react-query.ts';
import { getFirebaseDb } from '../firebase.ts';
import { doc, getDoc, Timestamp } from 'firebase/firestore';

export type ModePerformanceStats = {
  suggested: number;
  accepted: number;
  engaged: number;
  completed: number;
  positive: number;
};

export type RankPerformanceStats = {
  suggested: number;
  accepted: number;
};

export type IntelligenceAggregatesSnapshot = {
  modePerformance: Record<string, ModePerformanceStats>;
  rankPerformance: Record<string, RankPerformanceStats>;
  aggregationVersion: number;
  updatedAt: Date | null;
};

export type IntelligenceAggregationCheckpoint = {
  lastProcessedAt: Date | null;
  updatedAt: Date | null;
  aggregationVersion: number;
};

export type IntelligenceAggregatesPayload = {
  aggregate: IntelligenceAggregatesSnapshot | null;
  checkpoint: IntelligenceAggregationCheckpoint | null;
  loadedAt: Date;
  lagMs: number | null;
};

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function parseModePerformance(value: unknown): Record<string, ModePerformanceStats> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, ModePerformanceStats> = {};
  for (const [mode, rawStats] of Object.entries(source)) {
    if (!rawStats || typeof rawStats !== 'object') continue;
    const stats = rawStats as Record<string, unknown>;
    result[mode] = {
      suggested: asNumber(stats.suggested),
      accepted: asNumber(stats.accepted),
      engaged: asNumber(stats.engaged),
      completed: asNumber(stats.completed),
      positive: asNumber(stats.positive),
    };
  }

  return result;
}

function parseRankPerformance(value: unknown): Record<string, RankPerformanceStats> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const source = value as Record<string, unknown>;
  const result: Record<string, RankPerformanceStats> = {};
  for (const [rank, rawStats] of Object.entries(source)) {
    if (!rawStats || typeof rawStats !== 'object') continue;
    const stats = rawStats as Record<string, unknown>;
    result[rank] = {
      suggested: asNumber(stats.suggested),
      accepted: asNumber(stats.accepted),
    };
  }

  return result;
}

function parseAggregateDoc(data: Record<string, unknown>): IntelligenceAggregatesSnapshot {
  return {
    modePerformance: parseModePerformance(data.modePerformance),
    rankPerformance: parseRankPerformance(data.rankPerformance),
    aggregationVersion: asNumber(data.aggregationVersion),
    updatedAt: asDate(data.updatedAt),
  };
}

function parseCheckpointDoc(data: Record<string, unknown>): IntelligenceAggregationCheckpoint {
  return {
    lastProcessedAt: asDate(data.lastProcessedAt),
    updatedAt: asDate(data.updatedAt),
    aggregationVersion: asNumber(data.aggregationVersion),
  };
}

export function useIntelligenceAggregates(enabled: boolean = true) {
  return useQuery<IntelligenceAggregatesPayload>({
    queryKey: ['admin', 'intelligence', 'aggregates'],
    enabled,
    staleTime: 60_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const db = getFirebaseDb();
      const [aggregateSnap, checkpointSnap] = await Promise.all([
        getDoc(doc(db, 'intelligence_aggregates_global', 'global')),
        getDoc(doc(db, 'intelligence_aggregation_checkpoint', 'checkpoint')),
      ]);

      const aggregate = aggregateSnap.exists()
        ? parseAggregateDoc(aggregateSnap.data() as Record<string, unknown>)
        : null;
      const checkpoint = checkpointSnap.exists()
        ? parseCheckpointDoc(checkpointSnap.data() as Record<string, unknown>)
        : null;

      const loadedAt = new Date();
      const lagMs = checkpoint?.lastProcessedAt
        ? Math.max(0, loadedAt.getTime() - checkpoint.lastProcessedAt.getTime())
        : null;

      console.info('[ADMIN][INTELLIGENCE_DASHBOARD][LOAD]', {
        hasAggregate: aggregate !== null,
        hasCheckpoint: checkpoint !== null,
        loadedAt: loadedAt.toISOString(),
      });

      return {
        aggregate,
        checkpoint,
        loadedAt,
        lagMs,
      };
    },
  });
}

