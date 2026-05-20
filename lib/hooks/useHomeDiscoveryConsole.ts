import { useQuery } from "../react-query.ts";
import { callCallableEndpoint } from "../callable.ts";
import { useAuth } from "../auth.tsx";

export type HomeConsoleBookItem = {
  kind: "book";
  bookId: string;
  title: string;
  author: string;
  coverUrl: string;
  source: "algorithmic" | "editorial";
  score: number;
  progress?: number;
  reason?: string;
};

export type HomeConsoleTownSignalItem = {
  kind: "townSignal";
  signalType: "post" | "quote" | "shelf" | "reflection" | "author" | "literaryMoment";
  signalId: string;
  postId?: string;
  title: string;
  subtitle: string;
  source: "algorithmic" | "editorial";
  score: number;
  reason?: string;
};

export type HomeConsoleRow =
  | { type: "continueReading"; items: HomeConsoleBookItem[] }
  | { type: "readNow"; items: HomeConsoleBookItem[] }
  | { type: "dynamicDiscovery"; items: HomeConsoleBookItem[]; editorialCount: number }
  | { type: "fromTheTown"; items: HomeConsoleTownSignalItem[]; editorialCount: number };

export type HomeDiscoveryConsoleDTO = {
  rows: HomeConsoleRow[];
  generatedAt: string;
  ttlSeconds: number;
  governanceVersion: string;
};

function finiteScore(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function normalizeBookItem(value: unknown): HomeConsoleBookItem | null {
  const raw = value && typeof value === "object" ? value as Partial<HomeConsoleBookItem> : null;
  if (!raw || raw.kind !== "book" || typeof raw.bookId !== "string" || !raw.bookId.trim()) return null;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  return {
    kind: "book",
    bookId: raw.bookId.trim(),
    title: raw.title.trim(),
    author: typeof raw.author === "string" && raw.author.trim() ? raw.author.trim() : "Unknown",
    coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl : "",
    source: raw.source === "editorial" ? "editorial" : "algorithmic",
    score: finiteScore(raw.score),
    ...(typeof raw.progress === "number" && Number.isFinite(raw.progress)
      ? { progress: Math.max(0, Math.min(1, raw.progress)) }
      : {}),
    ...(typeof raw.reason === "string" && raw.reason.trim()
      ? { reason: raw.reason.trim().slice(0, 160) }
      : {}),
  };
}

function normalizeTownItem(value: unknown): HomeConsoleTownSignalItem | null {
  const raw = value && typeof value === "object" ? value as Partial<HomeConsoleTownSignalItem> : null;
  if (!raw || raw.kind !== "townSignal") return null;
  const signalType = ["post", "quote", "shelf", "reflection", "author", "literaryMoment"].includes(String(raw.signalType))
    ? raw.signalType as HomeConsoleTownSignalItem["signalType"]
    : "literaryMoment";
  const signalId =
    typeof raw.signalId === "string" && raw.signalId.trim()
      ? raw.signalId.trim()
      : typeof raw.postId === "string" && raw.postId.trim()
        ? raw.postId.trim()
        : "";
  if (!signalId) return null;
  if (typeof raw.title !== "string" || !raw.title.trim()) return null;
  return {
    kind: "townSignal",
    signalType,
    signalId,
    ...(typeof raw.postId === "string" && raw.postId.trim() ? { postId: raw.postId.trim() } : {}),
    title: raw.title.trim(),
    subtitle: typeof raw.subtitle === "string" ? raw.subtitle.trim().slice(0, 240) : "",
    source: raw.source === "editorial" ? "editorial" : "algorithmic",
    score: finiteScore(raw.score),
    ...(typeof raw.reason === "string" && raw.reason.trim()
      ? { reason: raw.reason.trim().slice(0, 160) }
      : {}),
  };
}

function normalizeHomeConsole(value: HomeDiscoveryConsoleDTO): HomeDiscoveryConsoleDTO {
  const rows = Array.isArray(value?.rows) ? value.rows : [];
  const normalizedRows = rows
    .map((row): HomeConsoleRow | null => {
      if (!row || typeof row !== "object") return null;
      if (row.type === "continueReading" || row.type === "readNow") {
        const items = Array.isArray(row.items)
          ? row.items.map(normalizeBookItem).filter((item): item is HomeConsoleBookItem => item !== null)
          : [];
        return items.length > 0 ? { type: row.type, items } : null;
      }
      if (row.type === "dynamicDiscovery") {
        const items = Array.isArray(row.items)
          ? row.items.map(normalizeBookItem).filter((item): item is HomeConsoleBookItem => item !== null)
          : [];
        return items.length > 0
          ? { type: "dynamicDiscovery", items, editorialCount: Math.max(0, Math.trunc(Number(row.editorialCount) || 0)) }
          : null;
      }
      if (row.type === "fromTheTown") {
        const items = Array.isArray(row.items)
          ? row.items.map(normalizeTownItem).filter((item): item is HomeConsoleTownSignalItem => item !== null)
          : [];
        return items.length > 0
          ? { type: "fromTheTown", items, editorialCount: Math.max(0, Math.trunc(Number(row.editorialCount) || 0)) }
          : null;
      }
      return null;
    })
    .filter((row): row is HomeConsoleRow => row !== null)
    .slice(0, 4);

  return {
    rows: normalizedRows,
    generatedAt: typeof value?.generatedAt === "string" ? value.generatedAt : new Date(0).toISOString(),
    ttlSeconds: Number.isFinite(Number(value?.ttlSeconds)) ? Math.max(0, Math.trunc(Number(value.ttlSeconds))) : 0,
    governanceVersion: typeof value?.governanceVersion === "string" ? value.governanceVersion : "unknown",
  };
}

export function useHomeDiscoveryConsole() {
  const { user } = useAuth();

  return useQuery<HomeDiscoveryConsoleDTO>({
    queryKey: ["homeDiscoveryConsole", user?.uid ?? "anonymous"],
    enabled: Boolean(user?.uid),
    queryFn: () =>
      callCallableEndpoint<Record<string, never>, HomeDiscoveryConsoleDTO>(
        "getHomeDiscoveryConsole",
        {}
      ).then(normalizeHomeConsole),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
  });
}
