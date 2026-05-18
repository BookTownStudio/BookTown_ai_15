import {
  type ChunkedManuscriptDraft,
  type ManuscriptChunkRecord,
  type ManuscriptSectionRecord,
} from './chunkedManuscript.ts';

export type ManuscriptSaveAuthority = 'complete' | 'partial';

export interface ChunkAuthorityReconciliationParams {
  draft: ChunkedManuscriptDraft;
  existingSections: ManuscriptSectionRecord[];
  existingChunks: ManuscriptChunkRecord[];
  revision: number;
  authority: ManuscriptSaveAuthority;
  authoritativeSectionIds?: string[];
  affectedChunkIds?: string[];
  now?: string;
}

export interface ChunkAuthorityReconciliation {
  activeSectionId: string;
  sections: ManuscriptSectionRecord[];
  chunks: ManuscriptChunkRecord[];
  sectionUpserts: ManuscriptSectionRecord[];
  chunkUpserts: ManuscriptChunkRecord[];
  sectionDeletes: ManuscriptSectionRecord[];
  chunkDeletes: ManuscriptChunkRecord[];
  dirtyChunkCount: number;
  unchangedChunkCount: number;
  movedChunkCount: number;
  reusedChunkIdentityCount: number;
  newChunkIdentityCount: number;
  preservedUnloadedChunkCount: number;
  affectedChunkCount: number;
  skippedUnaffectedChunkCount: number;
  savePayloadBytes: number;
}

function chunkKey(chunk: Pick<ManuscriptChunkRecord, 'sectionId' | 'chunkId'>): string {
  return `${chunk.sectionId}/${chunk.chunkId}`;
}

function sameSection(a: ManuscriptSectionRecord, b: ManuscriptSectionRecord): boolean {
  return (
    a.sectionId === b.sectionId &&
    a.order === b.order &&
    a.title === b.title &&
    a.kind === b.kind &&
    a.chunkCount === b.chunkCount &&
    a.nodeCount === b.nodeCount &&
    a.wordCount === b.wordCount &&
    a.contentHash === b.contentHash
  );
}

function sameChunk(a: ManuscriptChunkRecord, b: ManuscriptChunkRecord): boolean {
  return (
    a.sectionId === b.sectionId &&
    a.chunkId === b.chunkId &&
    a.order === b.order &&
    a.nodeCount === b.nodeCount &&
    a.byteSize === b.byteSize &&
    a.plainTextSize === b.plainTextSize &&
    a.wordCount === b.wordCount &&
    a.contentHash === b.contentHash
  );
}

function stablePayloadBytes(chunks: ManuscriptChunkRecord[]): number {
  return chunks.reduce((sum, chunk) => sum + chunk.byteSize, 0);
}

function createCollisionSafeId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}_${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function takeByContentHash<T extends { contentHash: string }>(
  index: Map<string, T[]>,
  contentHash: string,
  used: Set<T>
): T | null {
  const candidates = index.get(contentHash) ?? [];
  const match = candidates.find((candidate) => !used.has(candidate));
  if (!match) return null;
  used.add(match);
  return match;
}

function createSectionHashIndex(sections: ManuscriptSectionRecord[]): Map<string, ManuscriptSectionRecord[]> {
  const index = new Map<string, ManuscriptSectionRecord[]>();
  sections.forEach((section) => {
    if (!section.contentHash) return;
    index.set(section.contentHash, [...(index.get(section.contentHash) ?? []), section]);
  });
  return index;
}

function createChunkHashIndex(chunks: ManuscriptChunkRecord[]): Map<string, ManuscriptChunkRecord[]> {
  const index = new Map<string, ManuscriptChunkRecord[]>();
  chunks.forEach((chunk) => {
    if (!chunk.contentHash) return;
    index.set(chunk.contentHash, [...(index.get(chunk.contentHash) ?? []), chunk]);
  });
  return index;
}

function countDraftSectionIds(sections: ManuscriptSectionRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  sections.forEach((section) => counts.set(section.sectionId, (counts.get(section.sectionId) ?? 0) + 1));
  return counts;
}

function reconcileSections(params: {
  draft: ChunkedManuscriptDraft;
  existingSections: ManuscriptSectionRecord[];
  revision: number;
  now: string;
}): {
  sections: ManuscriptSectionRecord[];
  sectionIdByDraftIndex: Map<number, string>;
} {
  const existingById = new Map(params.existingSections.map((section) => [section.sectionId, section]));
  const existingByHash = createSectionHashIndex(params.existingSections);
  const draftIdCounts = countDraftSectionIds(params.draft.sections);
  const usedExistingSections = new Set<ManuscriptSectionRecord>();
  const usedSectionIds = new Set<string>();
  const sectionIdByDraftIndex = new Map<number, string>();

  const matchedSections = params.draft.sections.map((section, index) => {
    const sameId = existingById.get(section.sectionId);
    const draftIdIsDuplicated = (draftIdCounts.get(section.sectionId) ?? 0) > 1;
    const hasAuthoritativeSectionIdentity = params.draft.sectionIdentityHints[index]?.hasStructuralSectionId === true;
    const matched =
      takeByContentHash(existingByHash, section.contentHash, usedExistingSections) ??
      (
        sameId &&
        !usedExistingSections.has(sameId) &&
        (!draftIdIsDuplicated || hasAuthoritativeSectionIdentity)
          ? sameId
          : null
      );
    if (matched) {
      usedExistingSections.add(matched);
      usedSectionIds.add(matched.sectionId);
    }
    return matched;
  });

  const sections = params.draft.sections.map((section, index) => {
    const matched = matchedSections[index];

    const sectionId = matched
      ? matched.sectionId
      : createCollisionSafeId(section.sectionId, usedSectionIds);
    sectionIdByDraftIndex.set(index, sectionId);
    const changed =
      !matched ||
      matched.order !== section.order ||
      matched.title !== section.title ||
      matched.kind !== section.kind ||
      matched.chunkCount !== section.chunkCount ||
      matched.nodeCount !== section.nodeCount ||
      matched.wordCount !== section.wordCount ||
      matched.contentHash !== section.contentHash;

    return {
      ...section,
      sectionId,
      revision: changed ? params.revision : matched?.revision ?? params.revision,
      createdAt: matched?.createdAt ?? section.createdAt,
      updatedAt: changed ? params.now : matched?.updatedAt ?? params.now,
    };
  });

  return {
    sections,
    sectionIdByDraftIndex,
  };
}

export function reconcileChunkAuthority(
  params: ChunkAuthorityReconciliationParams
): ChunkAuthorityReconciliation {
  const now = params.now ?? new Date().toISOString();
  const {
    sections,
    sectionIdByDraftIndex,
  } = reconcileSections({
    draft: params.draft,
    existingSections: params.existingSections,
    revision: params.revision,
    now,
  });
  const existingChunkByKey = new Map(params.existingChunks.map((chunk) => [chunkKey(chunk), chunk]));
  const existingChunkByHash = createChunkHashIndex(params.existingChunks);
  const usedExistingChunks = new Set<ManuscriptChunkRecord>();
  const usedChunkKeys = new Set<string>();
  let movedChunkCount = 0;
  let reusedChunkIdentityCount = 0;
  let newChunkIdentityCount = 0;

  const chunks = params.draft.chunks.map((chunk, index) => {
    const draftSectionIndex = params.draft.chunkSectionIndexes[index] ?? 0;
    const sectionId = sectionIdByDraftIndex.get(draftSectionIndex) ?? chunk.sectionId;
    const baseProposedChunkId = chunk.sectionId === sectionId
      ? chunk.chunkId
      : `${sectionId}_chunk_${String(chunk.order + 1).padStart(4, '0')}`;
    const proposedKey = `${sectionId}/${baseProposedChunkId}`;
    const sameKey = existingChunkByKey.get(proposedKey);
    const matched =
      takeByContentHash(existingChunkByHash, chunk.contentHash, usedExistingChunks) ??
      (sameKey && !usedExistingChunks.has(sameKey) ? sameKey : null);
    if (matched) {
      usedExistingChunks.add(matched);
    }
    const baseChunkId = matched?.chunkId ?? baseProposedChunkId;
    const chunkId = createCollisionSafeId(`${sectionId}/${baseChunkId}`, usedChunkKeys).split('/')[1];
    const changed =
      !matched ||
      matched.sectionId !== sectionId ||
      matched.chunkId !== chunkId ||
      matched.order !== chunk.order ||
      matched.nodeCount !== chunk.nodeCount ||
      matched.byteSize !== chunk.byteSize ||
      matched.plainTextSize !== chunk.plainTextSize ||
      matched.wordCount !== chunk.wordCount ||
      matched.contentHash !== chunk.contentHash;

    if (matched) {
      reusedChunkIdentityCount += 1;
      if (matched.sectionId !== sectionId || matched.order !== chunk.order) {
        movedChunkCount += 1;
      }
    } else {
      newChunkIdentityCount += 1;
    }

    return {
      ...chunk,
      sectionId,
      chunkId,
      revision: changed ? params.revision : matched?.revision ?? params.revision,
      createdAt: matched?.createdAt ?? chunk.createdAt,
      updatedAt: changed ? now : matched?.updatedAt ?? now,
    };
  });

  const authoritativeSectionIds = params.authority === 'complete'
    ? new Set(params.existingSections.map((section) => section.sectionId))
    : new Set(params.authoritativeSectionIds ?? []);
  const nextSectionIds = new Set(sections.map((section) => section.sectionId));
  const nextChunkKeys = new Set(chunks.map((chunk) => chunkKey(chunk)));
  const affectedChunkIds = new Set(params.affectedChunkIds ?? []);
  const authoritativeChunkDeleteScope = params.authority === 'complete'
    ? new Set(params.existingChunks.map((chunk) => chunkKey(chunk)))
    : new Set(
      params.existingChunks
        .filter((chunk) => authoritativeSectionIds.has(chunk.sectionId))
        .map((chunk) => chunkKey(chunk))
    );

  const sectionUpserts = sections.filter((section) => {
    const existing = params.existingSections.find((entry) => entry.sectionId === section.sectionId);
    return !existing || !sameSection(existing, section);
  });
  const changedChunks = chunks.filter((chunk) => {
    const existing = existingChunkByKey.get(chunkKey(chunk));
    return !existing || !sameChunk(existing, chunk);
  });
  const chunkUpserts = changedChunks;
  const chunkDeletes = params.existingChunks.filter((chunk) => (
    authoritativeChunkDeleteScope.has(chunkKey(chunk)) &&
    !nextChunkKeys.has(chunkKey(chunk))
  ));
  const sectionDeletes = params.authority === 'complete'
    ? params.existingSections.filter((section) => !nextSectionIds.has(section.sectionId))
    : [];
  const preservedUnloadedChunkCount = params.existingChunks.filter((chunk) => (
    !authoritativeChunkDeleteScope.has(chunkKey(chunk)) &&
    !nextChunkKeys.has(chunkKey(chunk))
  )).length;
  const unchangedChunkCount = chunks.length - changedChunks.length;
  const skippedUnaffectedChunkCount = 0;
  const activeDraftSectionIndex = Math.max(
    0,
    params.draft.sections.findIndex((section) => section.sectionId === params.draft.activeSectionId)
  );

  return {
    activeSectionId: sectionIdByDraftIndex.get(activeDraftSectionIndex) ?? sections[0]?.sectionId ?? params.draft.activeSectionId,
    sections,
    chunks,
    sectionUpserts,
    chunkUpserts,
    sectionDeletes,
    chunkDeletes,
    dirtyChunkCount: chunkUpserts.length,
    unchangedChunkCount,
    movedChunkCount,
    reusedChunkIdentityCount,
    newChunkIdentityCount,
    preservedUnloadedChunkCount,
    affectedChunkCount: affectedChunkIds.size,
    skippedUnaffectedChunkCount,
    savePayloadBytes: stablePayloadBytes(chunkUpserts),
  };
}
