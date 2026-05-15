import React, { useEffect, useMemo, useState } from 'react';
import {
    writeEditorTelemetry,
    type WriteTelemetrySnapshot,
} from '../../lib/editor/writeEditorTelemetry.ts';

const STORAGE_KEY = 'booktown_write_perf_overlay';

function formatMs(value?: number): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return `${Math.round(value * 10) / 10}ms`;
}

function formatBytes(value?: number): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${Math.round(value)} B`;
}

function readInitialVisibility(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

const WritePerformanceOverlay: React.FC = () => {
    const [isVisible, setIsVisible] = useState(readInitialVisibility);
    const [snapshot, setSnapshot] = useState<WriteTelemetrySnapshot>(() =>
        writeEditorTelemetry.getSnapshot()
    );

    useEffect(() => {
        const unsubscribe = writeEditorTelemetry.subscribe(() => {
            setSnapshot(writeEditorTelemetry.getSnapshot());
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                setIsVisible((current) => {
                    const next = !current;
                    try {
                        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
                    } catch {
                        // Ignore storage failures; overlay visibility remains in memory.
                    }
                    return next;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const topTimings = useMemo(() => snapshot.timings.slice(0, 12), [snapshot.timings]);
    const topRenders = useMemo(() => snapshot.renders.slice(0, 8), [snapshot.renders]);
    const memoryGauges = useMemo(
        () =>
            Object.entries(snapshot.gauges)
                .filter(([key]) =>
                    key.includes('Bytes') ||
                    key.includes('Heap') ||
                    key.includes('Payload')
                )
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 12),
        [snapshot.gauges]
    );

    if (!writeEditorTelemetry.enabled || !isVisible) {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 z-[9999] w-[min(520px,calc(100vw-2rem))] max-h-[78vh] overflow-hidden rounded-lg border border-sky-400/40 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                        Write Performance
                    </div>
                    <div className="text-[11px] text-slate-400">Ctrl+Shift+E</div>
                </div>
                <button
                    type="button"
                    onClick={() => setIsVisible(false)}
                    className="rounded border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
                >
                    Hide
                </button>
            </div>

            <div className="max-h-[calc(78vh-44px)] overflow-y-auto p-3 text-xs">
                <section className="mb-4">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Autosave
                    </h2>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <Metric label="Queued" value={snapshot.autosave.queued ? 'yes' : 'no'} />
                        <Metric label="Attempts" value={String(snapshot.autosave.attempts)} />
                        <Metric label="Failures" value={String(snapshot.autosave.failures)} />
                        <Metric label="Payload" value={formatBytes(snapshot.autosave.lastPayloadBytes)} />
                        <Metric label="Queue Delay" value={formatMs(snapshot.autosave.lastQueueDelayMs)} />
                        <Metric label="Network" value={formatMs(snapshot.autosave.lastNetworkMs)} />
                        <Metric label="Completion" value={formatMs(snapshot.autosave.lastCompletionMs)} />
                        <Metric label="Last Error" value={snapshot.autosave.lastFailureReason || '-'} />
                    </div>
                </section>

                <section className="mb-4">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Timings
                    </h2>
                    <div className="space-y-1">
                        {topTimings.map((timing) => (
                            <div key={timing.name} className="grid grid-cols-[minmax(0,1fr)_56px_56px_56px] gap-2 rounded bg-white/[0.04] px-2 py-1">
                                <span className="truncate text-slate-200">{timing.name}</span>
                                <span className="text-right text-slate-400">p50 {formatMs(timing.p50Ms)}</span>
                                <span className="text-right text-slate-400">p95 {formatMs(timing.p95Ms)}</span>
                                <span className="text-right text-slate-400">n {timing.count}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mb-4">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Renders
                    </h2>
                    <div className="space-y-1">
                        {topRenders.map((render) => (
                            <div key={render.component} className="rounded bg-white/[0.04] px-2 py-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-slate-200">{render.component}</span>
                                    <span className="text-slate-400">{render.count}</span>
                                </div>
                                <div className="truncate text-[11px] text-slate-500">
                                    {render.latestChangedKeys.join(', ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="mb-4">
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Memory / Payload
                    </h2>
                    <div className="space-y-1">
                        {memoryGauges.map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-3 rounded bg-white/[0.04] px-2 py-1">
                                <span className="truncate text-slate-300">{key}</span>
                                <span className="shrink-0 text-slate-400">{formatBytes(value)}</span>
                            </div>
                        ))}
                    </div>
                </section>

                <section>
                    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Lifecycle Logs
                    </h2>
                    <div className="space-y-1">
                        {snapshot.logs.slice(0, 10).map((log) => (
                            <div key={log.id} className="rounded bg-white/[0.04] px-2 py-1">
                                <div className="flex justify-between gap-2">
                                    <span className={log.level === 'warn' || log.level === 'error' ? 'text-amber-300' : 'text-slate-200'}>
                                        {log.category}.{log.event}
                                    </span>
                                    <span className="text-slate-500">
                                        {new Date(log.at).toLocaleTimeString()}
                                    </span>
                                </div>
                                {log.detail ? (
                                    <div className="truncate text-[11px] text-slate-500">
                                        {JSON.stringify(log.detail)}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="rounded bg-white/[0.04] px-2 py-1">
        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
        <div className="truncate font-medium text-slate-200">{value}</div>
    </div>
);

export default WritePerformanceOverlay;
