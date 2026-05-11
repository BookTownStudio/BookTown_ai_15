import React, { useMemo, useState } from 'react';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import {
  adminService,
  adminServiceQueryKeys,
  type AdminSpaceRecord,
  type AdminUserSearchResult,
} from '../../lib/services/adminService.ts';
import { useMutation, useQuery, useQueryClient } from '../../lib/react-query.ts';
import {
  EVENT_SPACE_SUBTYPE_OPTIONS,
  VENUE_SPACE_SUBTYPE_OPTIONS,
  type EventSpaceSubtype,
  type VenueSpaceSubtype,
} from '../../lib/spaces/domain.ts';

type SpaceType = 'venue' | 'event';

const SpacesAuthorityTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [spaceType, setSpaceType] = useState<SpaceType>('venue');
  const [displayName, setDisplayName] = useState('');
  const [spaceSubtype, setSpaceSubtype] = useState<VenueSpaceSubtype | EventSpaceSubtype>('bookstore');
  const [imageUrl, setImageUrl] = useState('');
  const [address, setAddress] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [venueName, setVenueName] = useState('');
  const [managedByUid, setManagedByUid] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [spaceQuery, setSpaceQuery] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [selectedSpace, setSelectedSpace] = useState<AdminSpaceRecord | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserSearchResult | null>(null);
  const subtypeOptions = spaceType === 'venue' ? VENUE_SPACE_SUBTYPE_OPTIONS : EVENT_SPACE_SUBTYPE_OPTIONS;

  const { data: spaces = [], isLoading: isSearchingSpaces } = useQuery<AdminSpaceRecord[]>({
    queryKey: adminServiceQueryKeys.spaces(spaceQuery) as unknown as any[],
    queryFn: () => adminService.searchSpaces(spaceQuery),
    enabled: spaceQuery.trim().length >= 2,
  });

  const { data: users = [], isLoading: isSearchingUsers } = useQuery<AdminUserSearchResult[]>({
    queryKey: ['admin', 'users', 'space-stewardship', userQuery.trim().toLowerCase()],
    queryFn: () => adminService.searchUsers(userQuery),
    enabled: userQuery.trim().length >= 2,
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      adminService.seedSpace({
        spaceType,
        spaceSubtype,
        displayName: displayName.trim(),
        imageUrl: imageUrl.trim(),
        ...(spaceType === 'venue'
          ? { address: address.trim() }
          : {
              dateTime,
              isOnline: false,
              venueName: venueName.trim(),
              privacy: 'public' as const,
            }),
        ...(managedByUid.trim() ? { managedByUid: managedByUid.trim() } : {}),
        ...(institutionId.trim() ? { institutionId: institutionId.trim() } : {}),
      }),
    onSuccess: () => {
      setDisplayName('');
      setImageUrl('');
      setAddress('');
      setDateTime('');
      setVenueName('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!selectedSpace || !selectedUser) throw new Error('Select a Space and steward.');
      return adminService.assignSpaceStewardship({
        spaceId: selectedSpace.id,
        spaceType: selectedSpace.spaceType,
        managedByUid: selectedUser.uid,
        ...(institutionId.trim() ? { institutionId: institutionId.trim() } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
      setSelectedSpace(null);
      setSelectedUser(null);
    },
  });

  const canSeed = useMemo(() => {
    if (!displayName.trim() || !imageUrl.trim()) return false;
    if (spaceType === 'venue') return address.trim().length > 0;
    return dateTime.trim().length > 0 && venueName.trim().length > 0;
  }, [address, dateTime, displayName, imageUrl, spaceType, venueName]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold text-white">Seed Canonical Space</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            value={spaceType}
            onChange={(event) => {
              const nextType = event.target.value as SpaceType;
              setSpaceType(nextType);
              setSpaceSubtype(nextType === 'venue' ? 'bookstore' : 'reading_session');
            }}
            className="h-12 rounded-md border border-slate-600 bg-slate-800 px-3 text-white"
          >
            <option value="venue">Venue</option>
            <option value="event">Event</option>
          </select>
          <select
            value={spaceSubtype}
            onChange={(event) => setSpaceSubtype(event.target.value as VenueSpaceSubtype | EventSpaceSubtype)}
            className="h-12 rounded-md border border-slate-600 bg-slate-800 px-3 text-white"
          >
            {subtypeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.labelEn}</option>
            ))}
          </select>
          <InputField id="space-name" label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          <InputField id="space-image" label="HTTPS image URL" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
          {spaceType === 'venue' ? (
            <InputField id="space-address" label="Address" value={address} onChange={(event) => setAddress(event.target.value)} />
          ) : (
            <>
              <InputField id="space-date" label="Date/time" type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} />
              <InputField id="space-venue-name" label="Venue name" value={venueName} onChange={(event) => setVenueName(event.target.value)} />
            </>
          )}
          <InputField id="space-managed-by" label="Managed by UID" value={managedByUid} onChange={(event) => setManagedByUid(event.target.value)} />
          <InputField id="space-institution" label="Institution ID" value={institutionId} onChange={(event) => setInstitutionId(event.target.value)} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" disabled={!canSeed || seedMutation.isPending} onClick={() => seedMutation.mutate()}>
            {seedMutation.isPending ? <LoadingSpinner /> : 'Seed Space'}
          </Button>
          {seedMutation.error && <span className="text-sm text-rose-300">{seedMutation.error.message}</span>}
          {seedMutation.data && <span className="text-sm text-emerald-300">Seeded {seedMutation.data.identity.routePath}</span>}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold text-white">Assign Stewardship</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <InputField id="space-search" label="Search Spaces" value={spaceQuery} onChange={(event) => setSpaceQuery(event.target.value)} />
            <div className="mt-2 max-h-56 overflow-y-auto space-y-2">
              {isSearchingSpaces && <LoadingSpinner />}
              {spaces.map((space) => (
                <button
                  key={`${space.spaceType}:${space.id}`}
                  onClick={() => setSelectedSpace(space)}
                  className={`w-full rounded-md border p-3 text-left text-sm ${selectedSpace?.id === space.id ? 'border-accent text-white' : 'border-white/10 text-slate-300'}`}
                >
                  <div className="font-semibold">{space.displayName}</div>
                  <div className="text-xs text-slate-400">{space.spaceType} · {space.claimState} · {space.managedByUid || 'unassigned'}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <InputField id="user-search" label="Search Users" value={userQuery} onChange={(event) => setUserQuery(event.target.value)} />
            <div className="mt-2 max-h-56 overflow-y-auto space-y-2">
              {isSearchingUsers && <LoadingSpinner />}
              {users.map((user) => (
                <button
                  key={user.uid}
                  onClick={() => setSelectedUser(user)}
                  className={`w-full rounded-md border p-3 text-left text-sm ${selectedUser?.uid === user.uid ? 'border-accent text-white' : 'border-white/10 text-slate-300'}`}
                >
                  <div className="font-semibold">{user.displayName || user.email || user.uid}</div>
                  <div className="text-xs text-slate-400">{user.uid}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" disabled={!selectedSpace || !selectedUser || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
            {assignMutation.isPending ? <LoadingSpinner /> : 'Assign Steward'}
          </Button>
          {assignMutation.error && <span className="text-sm text-rose-300">{assignMutation.error.message}</span>}
          {assignMutation.data && <span className="text-sm text-emerald-300">Stewardship assigned</span>}
        </div>
      </section>
    </div>
  );
};

export default SpacesAuthorityTab;
