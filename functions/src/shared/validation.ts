import { z } from "zod";
import { HttpsError } from "firebase-functions/v2/https";

export { z };

/**
 * parseInput
 *
 * Validates `data` against a Zod schema.
 * On failure, throws an HttpsError("invalid-argument") with the first
 * human-readable field error so the caller gets a clear rejection message.
 * Extra fields are rejected when the schema uses `.strict()`.
 */
export function parseInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const flat = result.error.flatten();
    const fieldKeys = Object.keys(flat.fieldErrors);
    const firstField = fieldKeys[0];
    const firstMessage =
      firstField
        ? (flat.fieldErrors[firstField as keyof typeof flat.fieldErrors]?.[0] ?? "Invalid input.")
        : (flat.formErrors[0] ?? "Invalid input.");
    throw new HttpsError("invalid-argument", firstMessage, {
      validation: flat,
    });
  }
  return result.data as T; // ✅ THIS FIXES ~40 ERRORS
}

export const uidSchema = z.string().trim().min(1).max(128);
export const postIdSchema = z.string().trim().min(1).max(190);
export const commentIdSchema = z.string().trim().min(1).max(190);
export const reportIdSchema = z.string().trim().min(1).max(190);
export const bookIdSchema = z.string().trim().min(1).max(128);
export const shelfIdSchema = z.string().trim().min(1).max(190);
export const cursorSchema = z.string().trim().max(2048).optional();
export const limitSchema = z.number().int().min(1).max(200).optional();

const stringArrayField = (maxItems: number) =>
  z
    .array(z.string().trim().min(1))
    .max(maxItems)
    .optional()
    .transform((v: string[] | undefined) => v || []);

const optionalString = (maxLength: number) =>
  z.string().trim().max(maxLength).optional();

const requiredString = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength);

export const adminAuthorCreateSchema = z
  .object({
    canonicalName: requiredString(240),
    displayName: optionalString(240),
    aliases: stringArrayField(40),
    slug: optionalString(120),
    birthDate: optionalString(16),
    deathDate: optionalString(16),
    birthPlace: optionalString(160),
    deathPlace: optionalString(160),
    nationality: optionalString(120),
    languages: stringArrayField(12),
    genres: stringArrayField(16),
    movements: stringArrayField(16),
    period: optionalString(120),
    themes: stringArrayField(20),
    influenceTags: stringArrayField(20),
    shortBio: optionalString(800),
    fullBio: optionalString(5000),
    wikipediaUrl: optionalString(500),
    goodreadsId: optionalString(120),
    openLibraryId: optionalString(120),
    wikidataId: optionalString(120),
    isni: optionalString(120),
    viaf: optionalString(120),
    portraitUrl: optionalString(500),
    gallery: stringArrayField(12),
    knownWorks: stringArrayField(24),
    bookIds: stringArrayField(48),
    status: z.enum(["active", "archived"]).optional(),
    source: optionalString(120),
    primarySource: optionalString(120),
    provenance: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const adminAuthorUpdateSchema = z
  .object({
    authorId: requiredString(180),
    canonicalName: requiredString(240),
    displayName: optionalString(240),
    aliases: stringArrayField(40),
    slug: optionalString(120),
    birthDate: optionalString(16),
    deathDate: optionalString(16),
    birthPlace: optionalString(160),
    deathPlace: optionalString(160),
    nationality: optionalString(120),
    languages: stringArrayField(12),
    genres: stringArrayField(16),
    movements: stringArrayField(16),
    period: optionalString(120),
    themes: stringArrayField(20),
    influenceTags: stringArrayField(20),
    shortBio: optionalString(800),
    fullBio: optionalString(5000),
    wikipediaUrl: optionalString(500),
    goodreadsId: optionalString(120),
    openLibraryId: optionalString(120),
    wikidataId: optionalString(120),
    isni: optionalString(120),
    viaf: optionalString(120),
    portraitUrl: optionalString(500),
    gallery: stringArrayField(12),
    knownWorks: stringArrayField(24),
    bookIds: stringArrayField(48),
    status: z.enum(["active", "archived"]).optional(),
    source: optionalString(120),
    primarySource: optionalString(120),
    provenance: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const adminCreateCanonicalBookSchema = z
  .object({
    title: requiredString(300),
    author: requiredString(240),
    language: optionalString(16),
    description: optionalString(5000),
    coverUrl: optionalString(500),
    titleAliases: stringArrayField(24),
    isbn: z
      .object({
        isbn10: optionalString(20),
        isbn13: optionalString(20),
      })
      .strict()
      .optional(),
  })
  .strict();

export const adminAuthorIdSchema = z.string().trim().min(1).max(180);

export const adminMergeCanonicalBooksSchema = z
  .object({
    sourceBookId: requiredString(180),
    targetBookId: requiredString(180),
  })
  .strict();
