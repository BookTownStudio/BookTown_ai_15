import type { WriteBatch, DocumentReference } from "firebase-admin/firestore";

type BookPatch = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDeleteSentinel(value: unknown): boolean {
  return isRecord(value) && "_methodName" in value && value._methodName === "FieldValue.delete";
}

export function assertSafeBookPatch(
  patch: BookPatch,
  context: {
    scriptName: string;
    bookId?: string;
  }
): void {
  if ("literaryForm" in patch) {
    console.warn(
      "[BOOK_SCRIPT_SAFETY][LITERARY_FORM_DIRECT_WRITE]",
      JSON.stringify({
        scriptName: context.scriptName,
        bookId: context.bookId || null,
      })
    );
  }

  if (!("ontology" in patch)) {
    return;
  }

  const ontology = patch.ontology;
  if (ontology == null || isDeleteSentinel(ontology)) {
    throw new Error(
      `[BOOK_SCRIPT_SAFETY] Refusing to remove ontology in ${context.scriptName}.`
    );
  }

  if (!isRecord(ontology) || !asNonEmptyString(ontology.form)) {
    throw new Error(
      `[BOOK_SCRIPT_SAFETY] Refusing to write ontology without ontology.form in ${context.scriptName}.`
    );
  }
}

export function safeBatchSetBookMerge(
  batch: WriteBatch,
  ref: DocumentReference,
  patch: BookPatch,
  context: {
    scriptName: string;
    bookId?: string;
  }
): void {
  assertSafeBookPatch(patch, {
    scriptName: context.scriptName,
    bookId: context.bookId || ref.id,
  });
  batch.set(ref, patch, { merge: true });
}
