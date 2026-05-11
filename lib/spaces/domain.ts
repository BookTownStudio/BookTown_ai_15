export const SPACE_SCHEMA_VERSION = 1 as const;

export const SPACE_TYPES = ['venue', 'event'] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const VENUE_SPACE_SUBTYPES = [
  'bookstore',
  'library',
  'reading_cafe',
  'community_space',
  'cultural_center',
  'university_space',
  'publisher',
  'archive',
  'other',
] as const;
export type VenueSpaceSubtype = (typeof VENUE_SPACE_SUBTYPES)[number];

export const EVENT_SPACE_SUBTYPES = [
  'reading_session',
  'author_signing',
  'book_club',
  'launch',
  'workshop',
  'lecture',
  'discussion',
  'festival_session',
  'exhibition',
  'online_session',
  'other',
] as const;
export type EventSpaceSubtype = (typeof EVENT_SPACE_SUBTYPES)[number];

export type SpaceSubtype = VenueSpaceSubtype | EventSpaceSubtype;

export const SPACE_EVENT_STATES = [
  'draft',
  'scheduled',
  'live',
  'completed',
  'cancelled',
  'archived',
] as const;
export type SpaceEventState = (typeof SPACE_EVENT_STATES)[number];

export const SPACE_GOVERNANCE_STATES = [
  'draft',
  'pending_review',
  'published',
  'verified',
  'claimed',
  'archived',
] as const;
export type SpaceGovernanceState = (typeof SPACE_GOVERNANCE_STATES)[number];

export type SpaceProvenanceSource = 'user_created' | 'system_seeded' | 'legacy_import';
export type SpaceCanonicalAuthority = 'user_submitted' | 'system';

export const SPACE_CLAIM_STATES = [
  'unclaimed',
  'claimed',
  'verified',
  'institutional',
] as const;
export type SpaceClaimState = (typeof SPACE_CLAIM_STATES)[number];

export const SPACE_STEWARDSHIP_STATES = [
  'community_created',
  'system_seeded',
  'institutional',
] as const;
export type SpaceStewardshipState = (typeof SPACE_STEWARDSHIP_STATES)[number];

export const SPACE_INBOX_STATUSES = ['disabled', 'available'] as const;
export type SpaceInboxStatus = (typeof SPACE_INBOX_STATUSES)[number];

export const SPACE_RELATIONSHIP_VISIBILITY = ['public', 'private', 'hidden'] as const;
export type SpaceRelationshipVisibility = (typeof SPACE_RELATIONSHIP_VISIBILITY)[number];

export const SPACE_EVENT_CONTINUITY_VISIBILITY = [
  'public_history',
  'private_record',
] as const;
export type SpaceEventContinuityVisibility = (typeof SPACE_EVENT_CONTINUITY_VISIBILITY)[number];

export const SPACE_PUBLICATION_STATES = ['published'] as const;
export type SpacePublicationState = (typeof SPACE_PUBLICATION_STATES)[number];

export interface SpaceProvenance {
  source: SpaceProvenanceSource;
  canonicalAuthority: SpaceCanonicalAuthority;
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
  createdByUid?: string;
}

export interface SpaceIdentity {
  canonicalId: string;
  slug: string;
  displayName: string;
  normalizedName: string;
  routePath: string;
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
}

export interface SpaceAuthorityProfile {
  claimState: SpaceClaimState;
  stewardshipState: SpaceStewardshipState;
  claimedByUid?: string;
  verifiedByUid?: string;
  institutionId?: string;
  seededBy?: 'booktown' | 'partner' | 'import';
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
}

export interface SpaceStewardship {
  canonicalOwnerId: 'booktown';
  createdByUid: string;
  managedByUid?: string;
  adminUids: string[];
  assignedByUid?: string;
  institutionId?: string;
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
}

export interface SpaceCommunication {
  inboxKind: 'space';
  inboxId: string;
  inboxStatus: SpaceInboxStatus;
  ownerUid: string;
  adminUids: string[];
  participantModel: 'space_admins_only';
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
}

export interface SpaceEventContinuity {
  historicalRecord: true;
  visibility: SpaceEventContinuityVisibility;
  lineageKind: 'single_event' | 'series_occurrence';
  seriesId?: string;
  occurrenceId?: string;
  previousEventId?: string;
  nextEventId?: string;
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
}

export interface SpaceRelationshipVisibilityProfile {
  venue: SpaceRelationshipVisibility;
  organization: SpaceRelationshipVisibility;
  books: SpaceRelationshipVisibility;
  authors: SpaceRelationshipVisibility;
  series: SpaceRelationshipVisibility;
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
}

export interface SpacePublicationLifecycle {
  state: SpacePublicationState;
  draftMode: 'none';
  schemaVersion: typeof SPACE_SCHEMA_VERSION;
}

export interface SpaceRelationshipRefs {
  venueId?: string;
  cityId?: string;
  organizationId?: string;
  seriesId?: string;
  bookIds?: string[];
  authorIds?: string[];
}

const VENUE_LEGACY_SUBTYPE_MAP: Record<string, VenueSpaceSubtype> = {
  bookstore: 'bookstore',
  'book-store': 'bookstore',
  'bookshop': 'bookstore',
  'bookstore & cafe': 'bookstore',
  library: 'library',
  'public library': 'library',
  cafe: 'reading_cafe',
  'reading-cafe': 'reading_cafe',
  reading_cafe: 'reading_cafe',
  'reading cafe': 'reading_cafe',
  'community-space': 'community_space',
  community_space: 'community_space',
  'community space': 'community_space',
  'cultural-center': 'cultural_center',
  cultural_center: 'cultural_center',
  'cultural center': 'cultural_center',
  'university-space': 'university_space',
  university_space: 'university_space',
  'university space': 'university_space',
  publisher: 'publisher',
  archive: 'archive',
  other: 'other',
};

const EVENT_LEGACY_SUBTYPE_MAP: Record<string, EventSpaceSubtype> = {
  'reading-session': 'reading_session',
  reading_session: 'reading_session',
  'reading session': 'reading_session',
  'author-signing': 'author_signing',
  author_signing: 'author_signing',
  'author signing': 'author_signing',
  'book-club': 'book_club',
  book_club: 'book_club',
  'book club': 'book_club',
  launch: 'launch',
  workshop: 'workshop',
  talk: 'lecture',
  lecture: 'lecture',
  discussion: 'discussion',
  'festival-session': 'festival_session',
  festival_session: 'festival_session',
  'festival session': 'festival_session',
  exhibition: 'exhibition',
  'online-session': 'online_session',
  online_session: 'online_session',
  'online session': 'online_session',
  other: 'other',
};

const normalizeKey = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/_/g, '_')
    : '';

const normalizeIdentityBase = (value: string): string => {
  const ascii = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return ascii || 'space';
};

const normalizeReadableName = (value: unknown, fallback: string): string => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return name || fallback;
};

const normalizeUidList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 25)
    : [];

const normalizeOptionalUid = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

export function normalizeVenueSpaceSubtype(value: unknown): VenueSpaceSubtype {
  const key = normalizeKey(value);
  return VENUE_LEGACY_SUBTYPE_MAP[key] || 'other';
}

export function normalizeEventSpaceSubtype(
  value: unknown,
  options: { isOnline?: boolean } = {}
): EventSpaceSubtype {
  const key = normalizeKey(value);
  const mapped = EVENT_LEGACY_SUBTYPE_MAP[key];
  if (mapped) return mapped;
  return options.isOnline ? 'online_session' : 'other';
}

export function normalizeSpaceSubtype(
  spaceType: SpaceType,
  value: unknown,
  options: { isOnline?: boolean } = {}
): SpaceSubtype {
  return spaceType === 'event'
    ? normalizeEventSpaceSubtype(value, options)
    : normalizeVenueSpaceSubtype(value);
}

export function normalizeSpaceGovernanceState(value: unknown): SpaceGovernanceState {
  return SPACE_GOVERNANCE_STATES.includes(value as SpaceGovernanceState)
    ? (value as SpaceGovernanceState)
    : 'published';
}

export function normalizeSpaceEventState(
  value: unknown,
  dateTime: string,
  now = new Date()
): SpaceEventState {
  if (SPACE_EVENT_STATES.includes(value as SpaceEventState)) {
    return value as SpaceEventState;
  }

  const eventTime = new Date(dateTime);
  if (!Number.isNaN(eventTime.getTime()) && eventTime.getTime() < now.getTime()) {
    return 'completed';
  }
  return 'scheduled';
}

export function createSpaceIdentity(
  spaceType: SpaceType,
  spaceId: string,
  displayName: string
): SpaceIdentity {
  const canonicalId = `${spaceType}_${spaceId}`;
  const name = normalizeReadableName(displayName, canonicalId);
  const suffix = spaceId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || 'space';
  const slug = `${normalizeIdentityBase(name)}-${suffix}`;
  return {
    canonicalId,
    slug,
    displayName: name,
    normalizedName: name.toLowerCase(),
    routePath: `/spaces/${slug}`,
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function normalizeSpaceIdentity(
  value: unknown,
  spaceType: SpaceType,
  spaceId: string,
  displayName: string
): SpaceIdentity {
  const fallback = createSpaceIdentity(spaceType, spaceId, displayName);
  if (!value || typeof value !== 'object') return fallback;

  const identity = value as Partial<SpaceIdentity>;
  const slug =
    typeof identity.slug === 'string' && identity.slug.trim().length > 0
      ? normalizeIdentityBase(identity.slug)
      : fallback.slug;
  return {
    canonicalId:
      typeof identity.canonicalId === 'string' && identity.canonicalId.trim().length > 0
        ? identity.canonicalId.trim()
        : fallback.canonicalId,
    slug,
    displayName: normalizeReadableName(identity.displayName, fallback.displayName),
    normalizedName: normalizeReadableName(identity.normalizedName, fallback.normalizedName).toLowerCase(),
    routePath:
      typeof identity.routePath === 'string' && identity.routePath.trim().length > 0
        ? identity.routePath.trim()
        : `/spaces/${slug}`,
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function normalizeSpaceClaimState(value: unknown): SpaceClaimState {
  return SPACE_CLAIM_STATES.includes(value as SpaceClaimState)
    ? (value as SpaceClaimState)
    : 'unclaimed';
}

export function normalizeSpaceStewardshipState(value: unknown): SpaceStewardshipState {
  return SPACE_STEWARDSHIP_STATES.includes(value as SpaceStewardshipState)
    ? (value as SpaceStewardshipState)
    : 'community_created';
}

export function createCommunitySpaceAuthorityProfile(): SpaceAuthorityProfile {
  return {
    claimState: 'unclaimed',
    stewardshipState: 'community_created',
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function normalizeSpaceAuthorityProfile(value: unknown): SpaceAuthorityProfile {
  if (!value || typeof value !== 'object') return createCommunitySpaceAuthorityProfile();
  const profile = value as Partial<SpaceAuthorityProfile>;
  return {
    claimState: normalizeSpaceClaimState(profile.claimState),
    stewardshipState: normalizeSpaceStewardshipState(profile.stewardshipState),
    ...(typeof profile.claimedByUid === 'string' && profile.claimedByUid.trim()
      ? { claimedByUid: profile.claimedByUid.trim() }
      : {}),
    ...(typeof profile.verifiedByUid === 'string' && profile.verifiedByUid.trim()
      ? { verifiedByUid: profile.verifiedByUid.trim() }
      : {}),
    ...(typeof profile.institutionId === 'string' && profile.institutionId.trim()
      ? { institutionId: profile.institutionId.trim() }
      : {}),
    ...(profile.seededBy === 'booktown' || profile.seededBy === 'partner' || profile.seededBy === 'import'
      ? { seededBy: profile.seededBy }
      : {}),
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function createSpaceStewardship(createdByUid: string, managedByUid?: string): SpaceStewardship {
  return {
    canonicalOwnerId: 'booktown',
    createdByUid,
    ...(managedByUid ? { managedByUid } : {}),
    adminUids: [],
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function normalizeSpaceStewardship(
  value: unknown,
  createdByUid: string,
  options: { managedByUid?: string; assignedByUid?: string; institutionId?: string } = {}
): SpaceStewardship {
  if (!value || typeof value !== 'object') {
    return createSpaceStewardship(createdByUid, options.managedByUid);
  }
  const stewardship = value as Partial<SpaceStewardship>;
  return {
    canonicalOwnerId: 'booktown',
    createdByUid: normalizeOptionalUid(stewardship.createdByUid) || createdByUid,
    ...(normalizeOptionalUid(stewardship.managedByUid) || options.managedByUid
      ? { managedByUid: normalizeOptionalUid(stewardship.managedByUid) || options.managedByUid }
      : {}),
    adminUids: normalizeUidList(stewardship.adminUids),
    ...(normalizeOptionalUid(stewardship.assignedByUid) || options.assignedByUid
      ? { assignedByUid: normalizeOptionalUid(stewardship.assignedByUid) || options.assignedByUid }
      : {}),
    ...(typeof stewardship.institutionId === 'string' && stewardship.institutionId.trim()
      ? { institutionId: stewardship.institutionId.trim() }
      : options.institutionId
        ? { institutionId: options.institutionId }
        : {}),
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function createSpaceCommunication(spaceId: string, ownerUid: string): SpaceCommunication {
  return {
    inboxKind: 'space',
    inboxId: `space_${spaceId}`,
    inboxStatus: 'disabled',
    ownerUid,
    adminUids: [],
    participantModel: 'space_admins_only',
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function normalizeSpaceCommunication(
  value: unknown,
  spaceId: string,
  ownerUid: string
): SpaceCommunication {
  if (!value || typeof value !== 'object') return createSpaceCommunication(spaceId, ownerUid);
  const communication = value as Partial<SpaceCommunication>;
  const fallback = createSpaceCommunication(spaceId, ownerUid);
  return {
    inboxKind: 'space',
    inboxId:
      typeof communication.inboxId === 'string' && communication.inboxId.trim().length > 0
        ? communication.inboxId.trim()
        : fallback.inboxId,
    inboxStatus: SPACE_INBOX_STATUSES.includes(communication.inboxStatus as SpaceInboxStatus)
      ? (communication.inboxStatus as SpaceInboxStatus)
      : fallback.inboxStatus,
    ownerUid:
      typeof communication.ownerUid === 'string' && communication.ownerUid.trim().length > 0
        ? communication.ownerUid.trim()
        : ownerUid,
    adminUids: normalizeUidList(communication.adminUids),
    participantModel: 'space_admins_only',
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function createEventContinuity(
  visibility: SpaceEventContinuityVisibility = 'public_history'
): SpaceEventContinuity {
  return {
    historicalRecord: true,
    visibility,
    lineageKind: 'single_event',
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function normalizeEventContinuity(
  value: unknown,
  options: { privacy?: 'public' | 'private'; recurrence?: { seriesId?: string; occurrenceId?: string } } = {}
): SpaceEventContinuity {
  const fallback = createEventContinuity(
    options.privacy === 'private' ? 'private_record' : 'public_history'
  );
  if (!value || typeof value !== 'object') {
    return {
      ...fallback,
      ...(options.recurrence?.seriesId
        ? {
            lineageKind: 'series_occurrence',
            seriesId: options.recurrence.seriesId,
            occurrenceId: options.recurrence.occurrenceId,
          }
        : {}),
    };
  }

  const continuity = value as Partial<SpaceEventContinuity>;
  const seriesId =
    typeof continuity.seriesId === 'string' && continuity.seriesId.trim()
      ? continuity.seriesId.trim()
      : options.recurrence?.seriesId;
  return {
    historicalRecord: true,
    visibility: SPACE_EVENT_CONTINUITY_VISIBILITY.includes(
      continuity.visibility as SpaceEventContinuityVisibility
    )
      ? (continuity.visibility as SpaceEventContinuityVisibility)
      : fallback.visibility,
    lineageKind: seriesId ? 'series_occurrence' : 'single_event',
    ...(seriesId ? { seriesId } : {}),
    ...(typeof continuity.occurrenceId === 'string' && continuity.occurrenceId.trim()
      ? { occurrenceId: continuity.occurrenceId.trim() }
      : options.recurrence?.occurrenceId
        ? { occurrenceId: options.recurrence.occurrenceId }
        : {}),
    ...(typeof continuity.previousEventId === 'string' && continuity.previousEventId.trim()
      ? { previousEventId: continuity.previousEventId.trim() }
      : {}),
    ...(typeof continuity.nextEventId === 'string' && continuity.nextEventId.trim()
      ? { nextEventId: continuity.nextEventId.trim() }
      : {}),
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function createSpaceRelationshipVisibility(): SpaceRelationshipVisibilityProfile {
  return {
    venue: 'public',
    organization: 'public',
    books: 'private',
    authors: 'private',
    series: 'private',
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function createPublishedSpaceLifecycle(): SpacePublicationLifecycle {
  return {
    state: 'published',
    draftMode: 'none',
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function normalizeSpaceRelationshipVisibility(value: unknown): SpaceRelationshipVisibilityProfile {
  const fallback = createSpaceRelationshipVisibility();
  if (!value || typeof value !== 'object') return fallback;
  const profile = value as Partial<SpaceRelationshipVisibilityProfile>;
  const read = (key: keyof Omit<SpaceRelationshipVisibilityProfile, 'schemaVersion'>) =>
    SPACE_RELATIONSHIP_VISIBILITY.includes(profile[key] as SpaceRelationshipVisibility)
      ? (profile[key] as SpaceRelationshipVisibility)
      : fallback[key];
  return {
    venue: read('venue'),
    organization: read('organization'),
    books: read('books'),
    authors: read('authors'),
    series: read('series'),
    schemaVersion: SPACE_SCHEMA_VERSION,
  };
}

export function createUserSpaceProvenance(uid: string): SpaceProvenance {
  return {
    source: 'user_created',
    canonicalAuthority: 'user_submitted',
    schemaVersion: SPACE_SCHEMA_VERSION,
    createdByUid: uid,
  };
}

export const VENUE_SPACE_SUBTYPE_OPTIONS: Array<{
  value: VenueSpaceSubtype;
  labelEn: string;
  labelAr: string;
}> = [
  { value: 'bookstore', labelEn: 'Bookstore', labelAr: 'متجر كتب' },
  { value: 'library', labelEn: 'Library', labelAr: 'مكتبة' },
  { value: 'reading_cafe', labelEn: 'Reading Cafe', labelAr: 'مقهى قراءة' },
  { value: 'community_space', labelEn: 'Community Space', labelAr: 'مساحة مجتمعية' },
  { value: 'cultural_center', labelEn: 'Cultural Center', labelAr: 'مركز ثقافي' },
  { value: 'university_space', labelEn: 'University Space', labelAr: 'مساحة جامعية' },
  { value: 'publisher', labelEn: 'Publisher', labelAr: 'دار نشر' },
  { value: 'archive', labelEn: 'Archive', labelAr: 'أرشيف' },
  { value: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

export const EVENT_SPACE_SUBTYPE_OPTIONS: Array<{
  value: EventSpaceSubtype;
  labelEn: string;
  labelAr: string;
}> = [
  { value: 'reading_session', labelEn: 'Reading Session', labelAr: 'جلسة قراءة' },
  { value: 'author_signing', labelEn: 'Author Signing', labelAr: 'توقيع مؤلف' },
  { value: 'book_club', labelEn: 'Book Club', labelAr: 'نادي كتاب' },
  { value: 'launch', labelEn: 'Launch', labelAr: 'إطلاق كتاب' },
  { value: 'workshop', labelEn: 'Workshop', labelAr: 'ورشة عمل' },
  { value: 'lecture', labelEn: 'Lecture', labelAr: 'محاضرة' },
  { value: 'discussion', labelEn: 'Discussion', labelAr: 'نقاش' },
  { value: 'festival_session', labelEn: 'Festival Session', labelAr: 'جلسة مهرجان' },
  { value: 'exhibition', labelEn: 'Exhibition', labelAr: 'معرض' },
  { value: 'online_session', labelEn: 'Online Session', labelAr: 'جلسة عبر الإنترنت' },
  { value: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

export function getSpaceSubtypeLabel(
  spaceType: SpaceType,
  subtype: unknown,
  lang: 'en' | 'ar'
): string {
  const normalized =
    spaceType === 'event'
      ? normalizeEventSpaceSubtype(subtype)
      : normalizeVenueSpaceSubtype(subtype);
  const options = spaceType === 'event' ? EVENT_SPACE_SUBTYPE_OPTIONS : VENUE_SPACE_SUBTYPE_OPTIONS;
  const option = options.find((item) => item.value === normalized);
  if (!option) return normalized;
  return lang === 'ar' ? option.labelAr : option.labelEn;
}

export function getSpaceAuthoritySignal(
  authorityProfile: unknown,
  governanceStatus?: unknown
): 'verified' | 'claimed' | 'institutional' | null {
  const profile = normalizeSpaceAuthorityProfile(authorityProfile);
  if (profile.claimState === 'institutional' || profile.stewardshipState === 'institutional') {
    return 'institutional';
  }
  if (profile.claimState === 'verified' || governanceStatus === 'verified') {
    return 'verified';
  }
  if (profile.claimState === 'claimed' || governanceStatus === 'claimed') {
    return 'claimed';
  }
  return null;
}
