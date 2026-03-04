import React, { useMemo } from 'react';
import Button from '../ui/Button.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useIntelligenceAggregates, type ModePerformanceStats } from '../../lib/hooks/useIntelligenceAggregates.ts';

type FunnelStage = {
  label: string;
  count: number;
  conversionFromPrevious: number;
};

function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.00%';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function formatDate(value: Date | null): string {
  if (!value) return 'N/A';
  return value.toLocaleString();
}

function formatLag(lagMs: number | null): string {
  if (lagMs === null) return 'N/A';
  const totalMinutes = Math.floor(lagMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function sumStage(modePerformance: Record<string, ModePerformanceStats>, stage: keyof ModePerformanceStats): number {
  return Object.values(modePerformance).reduce((acc, mode) => acc + (mode[stage] ?? 0), 0);
}

function renderBarHeight(value: number, maxValue: number): number {
  if (maxValue <= 0) return 8;
  return Math.max(8, Math.round((value / maxValue) * 120));
}

const SIGNAL_COLORS: Record<string, string> = {
  accepted: '#22c55e',
  engaged: '#3b82f6',
  completed: '#f59e0b',
  positive: '#8b5cf6',
};

const IntelligenceAggregateDashboard: React.FC = () => {
  const { data, isLoading, isError, error, refetch, isFetching } = useIntelligenceAggregates(true);

  const aggregate = data?.aggregate ?? null;
  const checkpoint = data?.checkpoint ?? null;
  const lagMs = data?.lagMs ?? null;
  const lagWarning = lagMs !== null && lagMs > 2 * 60 * 60 * 1000;

  const modeRows = useMemo(() => {
    if (!aggregate) return [];
    return Object.entries(aggregate.modePerformance).map(([mode, stats]) => ({
      mode,
      ...stats,
      acceptanceRate: formatRate(stats.accepted, stats.suggested),
    }));
  }, [aggregate]);

  const rankRows = useMemo(() => {
    if (!aggregate) return [];
    return Object.entries(aggregate.rankPerformance)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([rank, stats]) => ({
        rank,
        ...stats,
        acceptanceRate: formatRate(stats.accepted, stats.suggested),
      }));
  }, [aggregate]);

  const funnelStages = useMemo<FunnelStage[]>(() => {
    if (!aggregate) return [];
    const suggested = sumStage(aggregate.modePerformance, 'suggested');
    const accepted = sumStage(aggregate.modePerformance, 'accepted');
    const engaged = sumStage(aggregate.modePerformance, 'engaged');
    const completed = sumStage(aggregate.modePerformance, 'completed');
    const positive = sumStage(aggregate.modePerformance, 'positive');

    return [
      { label: 'Suggested', count: suggested, conversionFromPrevious: 1 },
      {
        label: 'Accepted',
        count: accepted,
        conversionFromPrevious: suggested > 0 ? accepted / suggested : 0,
      },
      {
        label: 'Engaged',
        count: engaged,
        conversionFromPrevious: accepted > 0 ? engaged / accepted : 0,
      },
      {
        label: 'Completed',
        count: completed,
        conversionFromPrevious: engaged > 0 ? completed / engaged : 0,
      },
      {
        label: 'Positive',
        count: positive,
        conversionFromPrevious: completed > 0 ? positive / completed : 0,
      },
    ];
  }, [aggregate]);

  const distributionBars = useMemo(() => {
    if (!aggregate) return [];
    const values = {
      accepted: sumStage(aggregate.modePerformance, 'accepted'),
      engaged: sumStage(aggregate.modePerformance, 'engaged'),
      completed: sumStage(aggregate.modePerformance, 'completed'),
      positive: sumStage(aggregate.modePerformance, 'positive'),
    };
    const maxValue = Math.max(...Object.values(values), 1);
    return Object.entries(values).map(([label, count]) => ({
      label,
      count,
      height: renderBarHeight(count, maxValue),
      color: SIGNAL_COLORS[label] ?? '#94a3b8',
    }));
  }, [aggregate]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-white/10 bg-slate-800/60 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Aggregation Status</h2>
            <p className="text-sm text-slate-400">Read-only operational snapshot</p>
          </div>
          <Button
            variant="secondary"
            className="!h-9"
            onClick={() => {
              void refetch();
            }}
            disabled={isFetching}
          >
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {(error as Error)?.message || 'Failed to load intelligence aggregates.'}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-slate-900/60 p-3">
              <p className="text-xs uppercase text-slate-400">Last Processed At</p>
              <p className="mt-1 text-sm font-medium text-white">{formatDate(checkpoint?.lastProcessedAt ?? null)}</p>
            </div>
            <div className="rounded-lg bg-slate-900/60 p-3">
              <p className="text-xs uppercase text-slate-400">Updated At</p>
              <p className="mt-1 text-sm font-medium text-white">{formatDate(aggregate?.updatedAt ?? null)}</p>
            </div>
            <div className="rounded-lg bg-slate-900/60 p-3">
              <p className="text-xs uppercase text-slate-400">Aggregation Version</p>
              <p className="mt-1 text-sm font-medium text-white">
                {aggregate?.aggregationVersion ?? checkpoint?.aggregationVersion ?? 0}
              </p>
            </div>
            <div className={`rounded-lg p-3 ${lagWarning ? 'bg-amber-500/15' : 'bg-slate-900/60'}`}>
              <p className="text-xs uppercase text-slate-400">Current Lag</p>
              <p className={`mt-1 text-sm font-medium ${lagWarning ? 'text-amber-300' : 'text-white'}`}>
                {formatLag(lagMs)}
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-800/60 p-4">
        <h2 className="text-lg font-semibold text-white">Mode Performance</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-300">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Suggested</th>
                <th className="px-3 py-2">Accepted</th>
                <th className="px-3 py-2">Engaged</th>
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2">Positive</th>
                <th className="px-3 py-2">Acceptance Rate</th>
              </tr>
            </thead>
            <tbody>
              {modeRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-400" colSpan={7}>No mode performance data available.</td>
                </tr>
              ) : (
                modeRows.map((row) => (
                  <tr key={row.mode} className="border-b border-white/5 text-slate-100">
                    <td className="px-3 py-2 font-medium">{row.mode}</td>
                    <td className="px-3 py-2">{row.suggested}</td>
                    <td className="px-3 py-2">{row.accepted}</td>
                    <td className="px-3 py-2">{row.engaged}</td>
                    <td className="px-3 py-2">{row.completed}</td>
                    <td className="px-3 py-2">{row.positive}</td>
                    <td className="px-3 py-2">{row.acceptanceRate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-800/60 p-4">
        <h2 className="text-lg font-semibold text-white">Rank Survival</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-300">
              <tr className="border-b border-white/10">
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Suggested</th>
                <th className="px-3 py-2">Accepted</th>
                <th className="px-3 py-2">Acceptance Rate</th>
              </tr>
            </thead>
            <tbody>
              {rankRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-400" colSpan={4}>No rank performance data available.</td>
                </tr>
              ) : (
                rankRows.map((row) => (
                  <tr key={row.rank} className="border-b border-white/5 text-slate-100">
                    <td className="px-3 py-2 font-medium">{row.rank}</td>
                    <td className="px-3 py-2">{row.suggested}</td>
                    <td className="px-3 py-2">{row.accepted}</td>
                    <td className="px-3 py-2">{row.acceptanceRate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-800/60 p-4">
        <h2 className="text-lg font-semibold text-white">Signal Funnel</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {funnelStages.length === 0 ? (
            <p className="text-sm text-slate-400">No funnel data available.</p>
          ) : (
            funnelStages.map((stage) => (
              <div key={stage.label} className="rounded-lg bg-slate-900/60 p-3">
                <p className="text-xs uppercase text-slate-400">{stage.label}</p>
                <p className="mt-1 text-lg font-semibold text-white">{stage.count}</p>
                <p className="text-xs text-slate-300">
                  {stage.label === 'Suggested'
                    ? 'Baseline'
                    : `${(stage.conversionFromPrevious * 100).toFixed(2)}% from previous`}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-slate-800/60 p-4">
        <h2 className="text-lg font-semibold text-white">Signal Distribution</h2>
        {distributionBars.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No signal distribution data available.</p>
        ) : (
          <div className="mt-3 rounded-lg bg-slate-900/50 p-4">
            <svg viewBox="0 0 420 180" className="h-48 w-full" role="img" aria-label="Signal distribution bar chart">
              {distributionBars.map((bar, index) => {
                const x = 40 + index * 90;
                const y = 150 - bar.height;
                return (
                  <g key={bar.label}>
                    <rect x={x} y={y} width="42" height={bar.height} rx="6" fill={bar.color} />
                    <text x={x + 21} y="168" textAnchor="middle" className="fill-slate-300 text-[11px]">
                      {bar.label}
                    </text>
                    <text x={x + 21} y={Math.max(16, y - 8)} textAnchor="middle" className="fill-white text-[12px]">
                      {bar.count}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>
    </div>
  );
};

export default IntelligenceAggregateDashboard;

