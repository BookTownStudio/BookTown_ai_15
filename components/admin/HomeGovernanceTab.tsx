import React, { useMemo, useState } from 'react';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useMutation, useQuery, useQueryClient } from '../../lib/react-query.ts';
import {
  adminService,
  adminServiceQueryKeys,
  type AdminHomeEditorialEntry,
} from '../../lib/services/adminService.ts';

type Row = AdminHomeEditorialEntry['row'];
type TargetType = AdminHomeEditorialEntry['targetType'];
type Mode = AdminHomeEditorialEntry['mode'];

const emptyDraft = (): AdminHomeEditorialEntry => ({
  targetType: 'book',
  targetId: '',
  row: 'dynamicDiscovery',
  slot: 0,
  mode: 'hard_pin',
  boostWeight: 0.25,
  startAt: new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16),
  endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  regions: [],
  languages: [],
  editorialReason: '',
  isActive: false,
});

const rowLabels: Record<Row, string> = {
  readNow: 'Ready to Read',
  dynamicDiscovery: 'Discover',
  fromTheTown: 'From the Town',
};

function toIso(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : value;
}

const HomeGovernanceTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AdminHomeEditorialEntry>(() => emptyDraft());
  const [region, setRegion] = useState('');
  const [language, setLanguage] = useState('');

  const { data: entries = [], isLoading, error } = useQuery<AdminHomeEditorialEntry[]>({
    queryKey: adminServiceQueryKeys.homeEditorial as unknown as any[],
    queryFn: () => adminService.listHomeEditorialEntries(),
  });

  const { data: preview, isLoading: isPreviewLoading } = useQuery({
    queryKey: adminServiceQueryKeys.homeEditorialPreview(region, language) as unknown as any[],
    queryFn: () => adminService.previewHomeEditorialConsole({ region, language }),
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

  const setRow = (row: Row) => {
    setDraft((current) => ({
      ...current,
      row,
      targetType: row === 'fromTheTown' ? 'post' : 'book',
      slot: Math.min(current.slot, row === 'fromTheTown' ? 2 : 1),
    }));
  };

  const canSubmit = draft.targetId.trim().length > 0 && draft.editorialReason.trim().length > 0;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Home Literary Programming</h2>
            <p className="text-sm text-slate-400">Bounded editorial occupancy for Home literary layers.</p>
          </div>
          <div className="text-sm text-slate-300">
            Ready {occupancy.readNow}/2 · Discover {occupancy.dynamic}/2 · Town {occupancy.town}/3
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select value={draft.row} onChange={(event) => setRow(event.target.value as Row)} className="h-12 rounded-md border border-slate-600 bg-slate-800 px-3 text-white">
            <option value="readNow">Ready to Read</option>
            <option value="dynamicDiscovery">Discover</option>
            <option value="fromTheTown">From the Town</option>
          </select>
          <select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as Mode })} className="h-12 rounded-md border border-slate-600 bg-slate-800 px-3 text-white">
            <option value="hard_pin">Editorial placement</option>
            <option value="soft_boost">Editorial lift</option>
          </select>
          <select value={draft.targetType} onChange={(event) => setDraft({ ...draft, targetType: event.target.value as TargetType })} className="h-12 rounded-md border border-slate-600 bg-slate-800 px-3 text-white" disabled>
            <option value="book">Book</option>
            <option value="post">Post</option>
          </select>
          <InputField id="home-editorial-target" label="Target ID" value={draft.targetId} onChange={(event) => setDraft({ ...draft, targetId: event.target.value })} />
          <InputField id="home-editorial-slot" label="Slot" type="number" value={String(draft.slot)} onChange={(event) => setDraft({ ...draft, slot: Number(event.target.value) })} />
          <InputField id="home-editorial-boost" label="Boost weight" type="number" value={String(draft.boostWeight)} onChange={(event) => setDraft({ ...draft, boostWeight: Number(event.target.value) })} />
          <InputField id="home-editorial-start" label="Start" type="datetime-local" value={draft.startAt} onChange={(event) => setDraft({ ...draft, startAt: event.target.value })} />
          <InputField id="home-editorial-end" label="End" type="datetime-local" value={draft.endAt} onChange={(event) => setDraft({ ...draft, endAt: event.target.value })} />
          <InputField id="home-editorial-languages" label="Languages (comma)" value={draft.languages.join(',')} onChange={(event) => setDraft({ ...draft, languages: event.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} />
          <InputField id="home-editorial-regions" label="Regions (comma)" value={draft.regions.join(',')} onChange={(event) => setDraft({ ...draft, regions: event.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} />
          <InputField id="home-editorial-reason" label="Editorial reason" value={draft.editorialReason} onChange={(event) => setDraft({ ...draft, editorialReason: event.target.value })} />
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
            Active
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" disabled={!canSubmit || upsertMutation.isPending} onClick={() => upsertMutation.mutate()}>
            {upsertMutation.isPending ? <LoadingSpinner /> : draft.id ? 'Update entry' : 'Create entry'}
          </Button>
          {draft.id && <Button variant="secondary" onClick={() => setDraft(emptyDraft())}>Cancel edit</Button>}
          {upsertMutation.error && <span className="text-sm text-rose-300">{upsertMutation.error.message}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold text-white">Editorial Preview</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <InputField id="home-preview-region" label="Region" value={region} onChange={(event) => setRegion(event.target.value)} />
          <InputField id="home-preview-language" label="Language" value={language} onChange={(event) => setLanguage(event.target.value)} />
        </div>
        <div className="mt-3 text-sm text-slate-300">
          {isPreviewLoading ? <LoadingSpinner /> : preview?.rows.map((row) => (
            <span key={row.row} className="mr-4">{rowLabels[row.row]}: {row.editorialCount}/{row.maxEditorial}</span>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold text-white">Entries</h2>
        {isLoading && <LoadingSpinner />}
        {error && <p className="text-sm text-rose-300">{error.message}</p>}
        <div className="mt-3 space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-white/10 p-3 text-sm text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{rowLabels[entry.row]} · slot {entry.slot} · {entry.mode === 'hard_pin' ? 'editorial placement' : 'editorial lift'}</div>
                  <div className="text-xs text-slate-400">{entry.targetType}:{entry.targetId} · ends {entry.endAt}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDraft({ ...entry, startAt: entry.startAt.slice(0, 16), endAt: entry.endAt.slice(0, 16) })}>Edit</Button>
                  {entry.id && <Button variant="secondary" disabled={!entry.isActive || disableMutation.isPending} onClick={() => disableMutation.mutate(entry.id!)}>Disable</Button>}
                  {entry.id && <Button variant="secondary" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(entry.id!)}>Delete</Button>}
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">{entry.editorialReason}</p>
            </div>
          ))}
          {entries.length === 0 && !isLoading && <p className="text-sm text-slate-400">No Home editorial entries.</p>}
        </div>
      </section>
    </div>
  );
};

export default HomeGovernanceTab;
