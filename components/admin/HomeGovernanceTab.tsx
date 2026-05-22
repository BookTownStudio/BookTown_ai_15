import React, { useMemo, useState } from 'react';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useMutation, useQuery, useQueryClient } from '../../lib/react-query.ts';
import {
  adminService,
  adminServiceQueryKeys,
  type AdminHomeEditorialEntry,
  type AdminHomePlacementPreview,
  type AdminHomeTargetPreview,
  type HomeDiscoverStreamKey,
} from '../../lib/services/adminService.ts';

type Row = AdminHomeEditorialEntry['row'];
type TargetType = AdminHomeEditorialEntry['targetType'];
type Mode = AdminHomeEditorialEntry['mode'];

const DISCOVER_STREAMS: Array<{ key: HomeDiscoverStreamKey; label: string }> = [
  { key: 'hiddenGems', label: 'Hidden Gems' },
  { key: 'arabVoices', label: 'Arab Voices' },
  { key: 'recentlyDiscussed', label: 'Recently Discussed' },
  { key: 'philosophicalFiction', label: 'Philosophical Fiction' },
  { key: 'forgottenClassics', label: 'Forgotten Classics' },
  { key: 'shortReflectiveReads', label: 'Short Reflective Reads' },
];

const rowLabels: Record<Row, string> = {
  readNow: 'Ready to Read',
  dynamicDiscovery: 'Discover',
  fromTheTown: 'From the Town',
};

const modeLabels: Record<Mode, string> = {
  hard_pin: 'Featured placement',
  soft_boost: 'Gentle lift',
};

const emptyDraft = (): AdminHomeEditorialEntry => ({
  targetType: 'book',
  targetId: '',
  row: 'dynamicDiscovery',
  streamKey: 'hiddenGems',
  slot: 0,
  mode: 'soft_boost',
  boostWeight: 0.25,
  startAt: new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16),
  endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  regions: [],
  languages: [],
  editorialReason: '',
  isActive: false,
});

function toIso(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

function parseList(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function previewText(target: AdminHomeTargetPreview | null): string {
  if (!target) return 'No target selected.';
  return `${target.label}${target.subtitle ? ` · ${target.subtitle}` : ''}`;
}

const HomeGovernanceTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AdminHomeEditorialEntry>(() => emptyDraft());
  const [region, setRegion] = useState('');
  const [language, setLanguage] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<AdminHomeTargetPreview | null>(null);
  const [placementPreview, setPlacementPreview] = useState<AdminHomePlacementPreview | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [filterLayer, setFilterLayer] = useState<Row | 'all'>('all');
  const [filterStream, setFilterStream] = useState<HomeDiscoverStreamKey | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'live' | 'paused'>('all');
  const [filterCreator, setFilterCreator] = useState('');
  const [filterDate, setFilterDate] = useState('');

  const { data: entries = [], isLoading, error } = useQuery<AdminHomeEditorialEntry[]>({
    queryKey: adminServiceQueryKeys.homeEditorial as unknown as any[],
    queryFn: () => adminService.listHomeEditorialEntries(),
  });

  const { data: preview, isLoading: isPreviewLoading } = useQuery({
    queryKey: adminServiceQueryKeys.homeEditorialPreview(region, language) as unknown as any[],
    queryFn: () => adminService.previewHomeEditorialConsole({ region, language }),
  });

  const searchMutation = useMutation({
    mutationFn: () => adminService.searchHomeTargets({
      query: targetInput,
      row: draft.row,
      ...(draft.streamKey ? { streamKey: draft.streamKey } : {}),
      limit: 8,
    }),
  });

  const resolveMutation = useMutation({
    mutationFn: () => adminService.resolveHomeTarget({
      input: targetInput,
      row: draft.row,
      ...(draft.streamKey ? { streamKey: draft.streamKey } : {}),
      targetType: draft.targetType,
    }),
    onSuccess: (target) => {
      setSelectedTarget(target);
      if (target) {
        setDraft((current) => ({
          ...current,
          targetId: target.targetId,
          targetType: target.targetType,
        }));
      }
    },
  });

  const placementPreviewMutation = useMutation({
    mutationFn: () =>
      adminService.previewHomePlacement({
        ...draft,
        startAt: toIso(draft.startAt),
        endAt: toIso(draft.endAt),
      }),
    onSuccess: setPlacementPreview,
  });

  const upsertMutation = useMutation({
    mutationFn: () =>
      adminService.upsertHomeEditorialEntry({
        ...draft,
        startAt: toIso(draft.startAt),
        endAt: toIso(draft.endAt),
      }),
    onSuccess: () => {
      setDraft(emptyDraft());
      setTargetInput('');
      setSelectedTarget(null);
      setPlacementPreview(null);
      queryClient.invalidateQueries({ queryKey: adminServiceQueryKeys.homeEditorial as unknown as any[] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'homeEditorial'] });
    },
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => adminService.disableHomeEditorialEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'homeEditorial'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteHomeEditorialEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'homeEditorial'] }),
  });

  const occupancy = useMemo(() => {
    const readNow = entries.filter((entry) => entry.row === 'readNow' && entry.isActive).length;
    const dynamic = entries.filter((entry) => entry.row === 'dynamicDiscovery' && entry.isActive).length;
    const town = entries.filter((entry) => entry.row === 'fromTheTown' && entry.isActive).length;
    return { readNow, dynamic, town };
  }, [entries]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => {
      if (filterLayer !== 'all' && entry.row !== filterLayer) return false;
      if (filterStream !== 'all' && entry.streamKey !== filterStream) return false;
      if (filterStatus === 'live' && !entry.isActive) return false;
      if (filterStatus === 'paused' && entry.isActive) return false;
      if (filterCreator && !entry.createdBy.toLowerCase().includes(filterCreator.toLowerCase())) return false;
      if (filterDate && entry.startAt.slice(0, 10) !== filterDate) return false;
      return true;
    }),
    [entries, filterCreator, filterDate, filterLayer, filterStatus, filterStream]
  );

  const setRow = (row: Row) => {
    setSelectedTarget(null);
    setPlacementPreview(null);
    setDraft((current) => ({
      ...current,
      row,
      streamKey: row === 'dynamicDiscovery' ? current.streamKey ?? 'hiddenGems' : undefined,
      targetType: row === 'fromTheTown' ? 'post' : 'book',
      slot: Math.min(current.slot, row === 'fromTheTown' ? 2 : 1),
    }));
  };

  const selectTarget = (target: AdminHomeTargetPreview) => {
    setSelectedTarget(target);
    setPlacementPreview(null);
    setDraft((current) => ({
      ...current,
      targetId: target.targetId,
      targetType: target.targetType,
    }));
  };

  const canPreview = draft.targetId.trim().length > 0 && draft.editorialReason.trim().length > 0;
  const canActivate = canPreview && Boolean(placementPreview?.canActivate);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Home Literary Programming</h2>
            <p className="text-sm text-slate-400">Program bounded literary placements without changing Home orchestration.</p>
          </div>
          <div className="text-sm text-slate-300">
            Ready {occupancy.readNow}/2 · Discover {occupancy.dynamic}/stream · Town {occupancy.town}/3
          </div>
        </div>

        <div className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/5 p-3 text-sm text-emerald-100">
          Continue Reading is protected. Editors can manage continuity doorway policy below, but cannot place books into user memory.
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <h3 className="text-base font-semibold text-white">Program a Placement</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm text-slate-200">
            <span className="mb-1 block text-xs text-slate-400">Layer</span>
            <select value={draft.row} onChange={(event) => setRow(event.target.value as Row)} className="h-12 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-white">
              <option value="readNow">Ready to Read</option>
              <option value="dynamicDiscovery">Discover</option>
              <option value="fromTheTown">From the Town</option>
            </select>
          </label>

          {draft.row === 'dynamicDiscovery' && (
            <label className="text-sm text-slate-200">
              <span className="mb-1 block text-xs text-slate-400">Discover stream</span>
              <select
                value={draft.streamKey ?? 'hiddenGems'}
                onChange={(event) => {
                  setPlacementPreview(null);
                  setDraft({ ...draft, streamKey: event.target.value as HomeDiscoverStreamKey });
                }}
                className="h-12 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-white"
              >
                {DISCOVER_STREAMS.map((stream) => (
                  <option key={stream.key} value={stream.key}>{stream.label}</option>
                ))}
              </select>
            </label>
          )}

          <label className="text-sm text-slate-200">
            <span className="mb-1 block text-xs text-slate-400">Editorial intent</span>
            <select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as Mode })} className="h-12 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-white">
              <option value="hard_pin">Featured placement</option>
              <option value="soft_boost">Gentle lift</option>
            </select>
          </label>

          <InputField id="home-editorial-start" label="Start" type="datetime-local" value={draft.startAt} onChange={(event) => setDraft({ ...draft, startAt: event.target.value })} />
          <InputField id="home-editorial-end" label="End" type="datetime-local" value={draft.endAt} onChange={(event) => setDraft({ ...draft, endAt: event.target.value })} />
          <InputField id="home-editorial-reason" label="Programming note" value={draft.editorialReason} onChange={(event) => setDraft({ ...draft, editorialReason: event.target.value })} />
        </div>

        <div className="mt-5 rounded-lg border border-white/10 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <InputField
                id="home-editorial-target"
                label="Book, post, or link"
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
              />
            </div>
            <Button variant="secondary" disabled={targetInput.trim().length < 2 || searchMutation.isPending} onClick={() => searchMutation.mutate()}>
              {searchMutation.isPending ? <LoadingSpinner /> : 'Search'}
            </Button>
            <Button variant="secondary" disabled={targetInput.trim().length < 1 || resolveMutation.isPending} onClick={() => resolveMutation.mutate()}>
              {resolveMutation.isPending ? <LoadingSpinner /> : 'Resolve link'}
            </Button>
          </div>

          {searchMutation.data && searchMutation.data.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {searchMutation.data.map((target) => (
                <button
                  key={`${target.targetType}:${target.targetId}`}
                  type="button"
                  onClick={() => selectTarget(target)}
                  className={`rounded-md border p-3 text-left text-sm transition ${
                    selectedTarget?.targetId === target.targetId
                      ? 'border-emerald-300 bg-emerald-400/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="font-semibold text-white">{target.label}</div>
                  <div className="text-xs text-slate-400">{target.subtitle}</div>
                  {target.blocking.length > 0 && <div className="mt-2 text-xs text-rose-300">{target.blocking[0]}</div>}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="mt-3 text-xs text-slate-400 underline"
            onClick={() => setAdvancedOpen((open) => !open)}
          >
            Advanced canonical ID
          </button>
          {advancedOpen && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <InputField id="home-editorial-advanced-target" label="Canonical ID" value={draft.targetId} onChange={(event) => setDraft({ ...draft, targetId: event.target.value })} />
              <InputField id="home-editorial-position" label="Placement position" type="number" value={String(draft.slot)} onChange={(event) => setDraft({ ...draft, slot: Number(event.target.value) })} />
              <InputField id="home-editorial-strength" label="Editorial strength" type="number" value={String(draft.boostWeight)} onChange={(event) => setDraft({ ...draft, boostWeight: Number(event.target.value) })} />
              <InputField id="home-editorial-languages" label="Audience languages" value={draft.languages.join(',')} onChange={(event) => setDraft({ ...draft, languages: parseList(event.target.value) })} />
              <InputField id="home-editorial-regions" label="Audience regions" value={draft.regions.join(',')} onChange={(event) => setDraft({ ...draft, regions: parseList(event.target.value) })} />
            </div>
          )}
        </div>

        <div className="mt-5 rounded-lg border border-white/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-semibold text-white">Operational Preview</h4>
              <p className="text-xs text-slate-400">{previewText(selectedTarget)}</p>
            </div>
            <Button variant="secondary" disabled={!canPreview || placementPreviewMutation.isPending} onClick={() => placementPreviewMutation.mutate()}>
              {placementPreviewMutation.isPending ? <LoadingSpinner /> : 'Preview placement'}
            </Button>
          </div>

          {placementPreview && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-md bg-white/5 p-3 text-sm">
                <div className="text-xs text-slate-400">Eligibility</div>
                <div className={placementPreview.canActivate ? 'text-emerald-300' : 'text-rose-300'}>
                  {placementPreview.canActivate ? 'Ready to activate' : 'Blocked'}
                </div>
                {placementPreview.blocking.map((item) => (
                  <div key={item} className="mt-1 text-xs text-rose-300">{item}</div>
                ))}
                {placementPreview.warnings.map((item) => (
                  <div key={item} className="mt-1 text-xs text-amber-300">{item}</div>
                ))}
              </div>
              <div className="rounded-md bg-white/5 p-3 text-sm text-slate-300">
                <div className="text-xs text-slate-400">Occupancy</div>
                <div>{String(placementPreview.occupancy.activeCount ?? 0)}/{String(placementPreview.occupancy.max ?? 0)} active</div>
                {placementPreview.occupancy.streamLabel && <div className="text-xs text-slate-400">{String(placementPreview.occupancy.streamLabel)}</div>}
                <div className="mt-2 text-xs text-slate-400">
                  {placementPreview.schedule.startAt} → {placementPreview.schedule.endAt}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
            Scheduled / Live
          </label>
          <Button variant="primary" disabled={!canActivate || upsertMutation.isPending} onClick={() => upsertMutation.mutate()}>
            {upsertMutation.isPending ? <LoadingSpinner /> : draft.id ? 'Update placement' : 'Save placement'}
          </Button>
          {draft.id && <Button variant="secondary" onClick={() => setDraft(emptyDraft())}>Cancel edit</Button>}
          {upsertMutation.error && <span className="text-sm text-rose-300">{upsertMutation.error.message}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <h3 className="text-base font-semibold text-white">Continuity Doorways</h3>
        <p className="mt-1 text-sm text-slate-400">Protected policy only. Starter book, Surprise Me, and Add Book doorways remain separate from user continuity memory.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {['Add Book doorway enabled', 'Surprise doorway server-selected', 'Starter book opens reader authority'].map((label) => (
            <div key={label} className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{label}</div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <h3 className="text-base font-semibold text-white">Editorial Preview</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <InputField id="home-preview-region" label="Audience region" value={region} onChange={(event) => setRegion(event.target.value)} />
          <InputField id="home-preview-language" label="Audience language" value={language} onChange={(event) => setLanguage(event.target.value)} />
        </div>
        <div className="mt-3 text-sm text-slate-300">
          {isPreviewLoading ? <LoadingSpinner /> : preview?.rows.map((row) => (
            <span key={row.row} className="mr-4">{rowLabels[row.row]}: {row.editorialCount}/{row.maxEditorial}</span>
          ))}
        </div>
        {preview?.streams && (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {preview.streams.map((stream) => (
              <div key={stream.streamKey} className="rounded-md bg-white/5 p-2 text-xs text-slate-300">
                {stream.streamLabel}: {stream.editorialCount}/{stream.maxEditorial} · featured {stream.featuredCount}/{stream.maxFeatured}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">Placements</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <select value={filterLayer} onChange={(event) => setFilterLayer(event.target.value as Row | 'all')} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-white">
              <option value="all">All layers</option>
              <option value="readNow">Ready</option>
              <option value="dynamicDiscovery">Discover</option>
              <option value="fromTheTown">Town</option>
            </select>
            <select value={filterStream} onChange={(event) => setFilterStream(event.target.value as HomeDiscoverStreamKey | 'all')} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-white">
              <option value="all">All streams</option>
              {DISCOVER_STREAMS.map((stream) => <option key={stream.key} value={stream.key}>{stream.label}</option>)}
            </select>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as 'all' | 'live' | 'paused')} className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-white">
              <option value="all">All status</option>
              <option value="live">Live</option>
              <option value="paused">Paused</option>
            </select>
            <InputField
              id="home-programming-filter-creator"
              label="Creator"
              value={filterCreator}
              onChange={(event) => setFilterCreator(event.target.value)}
              placeholder="Creator"
              className="w-32 border-slate-600 bg-slate-800 text-white"
            />
            <InputField
              id="home-programming-filter-date"
              label="Date"
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
              className="w-36 border-slate-600 bg-slate-800 text-white"
            />
          </div>
        </div>
        {isLoading && <LoadingSpinner />}
        {error && <p className="text-sm text-rose-300">{error.message}</p>}
        <div className="mt-3 space-y-2">
          {filteredEntries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-white/10 p-3 text-sm text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {rowLabels[entry.row]}{entry.streamKey ? ` · ${DISCOVER_STREAMS.find((stream) => stream.key === entry.streamKey)?.label ?? entry.streamKey}` : ''} · {modeLabels[entry.mode]}
                  </div>
                  <div className="text-xs text-slate-400">{entry.targetType}:{entry.targetId} · ends {entry.endAt}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => {
                    setDraft({ ...entry, startAt: entry.startAt.slice(0, 16), endAt: entry.endAt.slice(0, 16) });
                    setSelectedTarget(null);
                    setPlacementPreview(null);
                    setTargetInput(entry.targetId);
                  }}>Edit</Button>
                  {entry.id && <Button variant="secondary" disabled={!entry.isActive || disableMutation.isPending} onClick={() => disableMutation.mutate(entry.id!)}>Pause</Button>}
                  {entry.id && <Button variant="secondary" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(entry.id!)}>Delete</Button>}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">{entry.editorialReason}</p>
            </div>
          ))}
          {filteredEntries.length === 0 && !isLoading && <p className="text-sm text-slate-400">No placements match these filters.</p>}
        </div>
      </section>
    </div>
  );
};

export default HomeGovernanceTab;
