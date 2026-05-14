export type StructuredEntityType =
  | "book"
  | "author"
  | "quote"
  | "shelf"
  | "venue"
  | "publication";

export type AttachmentRefProjection = {
  attachmentId: string;
  entityId?: string;
  entityOwnerId?: string;
  type: string;
  role: string;
  renderHint: string;
};

export type RenderProjectionHydratedEntity = {
  type: StructuredEntityType;
  id: string;
  ownerId?: string;
  data: Record<string, unknown>;
};

export type PostRenderProjection = {
  v: 1;
  contentText: string | null;
  attachments: AttachmentRefProjection[];
  visibility: string;
  primaryEntityType: StructuredEntityType | null;
  primaryEntityId: string | null;
  hydratedEntity: RenderProjectionHydratedEntity | null;
};

const readText = (value: unknown, maxLength = 2048): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const readNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function compactRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (typeof value === "string") return value.trim().length > 0;
      return value !== undefined && value !== null;
    })
  );
}

function readCovers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readText(item, 2048))
    .filter(Boolean)
    .slice(0, 4);
}

function readShelfBookCount(data: Record<string, unknown>): number {
  const direct =
    readNumber(data.bookCount) ??
    readNumber(data.itemsCount) ??
    readNumber(data.totalBooks) ??
    readNumber((data.counters as Record<string, unknown> | undefined)?.totalBooks);
  return direct === null ? 0 : Math.max(0, Math.trunc(direct));
}

export function buildRenderProjectionEntity(params: {
  type: StructuredEntityType;
  id: string;
  ownerId?: string;
  data: Record<string, unknown>;
}): RenderProjectionHydratedEntity {
  const { data, id, ownerId, type } = params;

  if (type === "book") {
    return {
      type,
      id,
      data: compactRecord({
        titleEn: readText(data.titleEn || data.title),
        titleAr: readText(data.titleAr),
        authorEn: readText(data.authorEn || data.author),
        authorAr: readText(data.authorAr),
        coverUrl: readText(data.coverUrl),
        rating: readNumber(data.rating) ?? 0,
      }),
    };
  }

  if (type === "author") {
    return {
      type,
      id,
      data: compactRecord({
        nameEn: readText(data.nameEn || data.name),
        nameAr: readText(data.nameAr),
        avatarUrl: readText(data.avatarUrl || data.authorPhoto),
        countryEn: readText(data.countryEn || data.country),
        countryAr: readText(data.countryAr),
      }),
    };
  }

  if (type === "quote") {
    const resolvedOwnerId = ownerId || readText(data.ownerId, 128);
    return {
      type,
      id,
      ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}),
      data: compactRecord({
        ownerId: resolvedOwnerId,
        textEn: readText(data.textEn || data.text || data.quoteText, 4000),
        textAr: readText(data.textAr, 4000),
      }),
    };
  }

  if (type === "shelf") {
    const resolvedOwnerId = ownerId || readText(data.ownerId, 128);
    return {
      type,
      id,
      ...(resolvedOwnerId ? { ownerId: resolvedOwnerId } : {}),
      data: compactRecord({
        ownerId: resolvedOwnerId,
        titleEn: readText(data.titleEn || data.title),
        titleAr: readText(data.titleAr),
        bookCount: readShelfBookCount(data),
        covers: readCovers(data.covers),
      }),
    };
  }

  if (type === "venue") {
    return {
      type,
      id,
      data: compactRecord({
        name: readText(data.name || data.title),
        type: readText(data.type || data.venueType),
        locationLabel: readText(data.locationLabel || data.location),
        dateLabel: readText(data.dateLabel || data.eventDate),
      }),
    };
  }

  return {
    type,
    id,
    data: compactRecord({
      title: readText(data.title),
      coverUrl: readText(data.coverUrl),
      author: readText(data.authorDisplayName || data.author),
      canonicalSlug: readText(data.canonicalSlug),
    }),
  };
}

export function buildPostRenderProjection(params: {
  contentText: string | null;
  attachments: AttachmentRefProjection[];
  visibility: string;
  primaryEntityType: StructuredEntityType | null;
  primaryEntityId: string | null;
  hydratedEntity?: RenderProjectionHydratedEntity | null;
}): PostRenderProjection {
  return {
    v: 1,
    contentText: params.contentText,
    attachments: params.attachments,
    visibility: params.visibility,
    primaryEntityType: params.primaryEntityType,
    primaryEntityId: params.primaryEntityId,
    hydratedEntity: params.hydratedEntity ?? null,
  };
}
