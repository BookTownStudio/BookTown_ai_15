import type { Author } from "../../types/entities.ts";

export type ResolvedAuthorAuthorityState =
  | "canonical"
  | "merged"
  | "superseded"
  | "archived"
  | "candidate"
  | "split"
  | "not_found";

export interface ResolvedAuthorAuthority {
  readonly requestedAuthorId: string;
  readonly resolvedAuthorId: string | null;
  readonly state: ResolvedAuthorAuthorityState;
  readonly author: Author | null;
  readonly redirect: {
    readonly required: boolean;
    readonly targetAuthorId: string | null;
    readonly reason: string;
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lifecycle(author: Author): ResolvedAuthorAuthorityState {
  const raw = author.lifecycleState || author.authorityState || author.status;
  if (
    raw === "canonical" ||
    raw === "merged" ||
    raw === "superseded" ||
    raw === "archived" ||
    raw === "candidate" ||
    raw === "split"
  ) {
    return raw;
  }
  if (author.requiresCanonicalization === true) return "candidate";
  if (author.archived === true) return "archived";
  return "canonical";
}

export function resolveAuthorAuthorityFromRecord(params: {
  readonly requestedAuthorId: string;
  readonly author: Author | null | undefined;
}): ResolvedAuthorAuthority {
  const requestedAuthorId = text(params.requestedAuthorId);
  const author = params.author ?? null;
  if (!requestedAuthorId || !author) {
    return {
      requestedAuthorId,
      resolvedAuthorId: null,
      state: "not_found",
      author: null,
      redirect: {
        required: false,
        targetAuthorId: null,
        reason: "author_not_found",
      },
    };
  }

  const state = lifecycle(author);
  const target =
    state === "merged"
      ? text(author.mergeTargetAuthorId)
      : state === "superseded"
        ? text(author.supersededByAuthorId)
        : "";
  const resolvedAuthorId = target || requestedAuthorId;

  return {
    requestedAuthorId,
    resolvedAuthorId,
    state,
    author,
    redirect: {
      required: Boolean(target && target !== requestedAuthorId),
      targetAuthorId: target || null,
      reason:
        state === "merged"
          ? "merged_author_redirect"
          : state === "superseded"
            ? "superseded_author_redirect"
            : "active_author",
    },
  };
}
