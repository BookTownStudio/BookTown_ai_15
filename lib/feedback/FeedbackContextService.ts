import type { View } from "../../types/navigation.ts";

export type FeedbackRuntimeContext = {
  route?: string;
  viewId?: string;
  navigationType?: string;
  activeTab?: string;
  immersiveView?: string;
  stackView?: string;
  entity?: {
    type: string;
    id: string;
  };
  activeFilters?: Record<string, string>;
  layoutMode?: string;
  openModalIds?: string[];
  viewport?: {
    width: number;
    height: number;
  };
  viewportClass?: "mobile" | "tablet" | "desktop";
  locale?: string;
  appVersion?: string;
  platform?: string;
};

type CaptureArgs = {
  currentView: View;
  locale: string;
};

function readRoute(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.pathname}${window.location.search}` || "/";
}

function readViewport(): { width: number; height: number } | undefined {
  if (typeof window === "undefined") return undefined;
  return {
    width: Math.max(1, Math.round(window.innerWidth || 1)),
    height: Math.max(1, Math.round(window.innerHeight || 1)),
  };
}

function classifyViewport(width: number | undefined): FeedbackRuntimeContext["viewportClass"] {
  if (!width) return undefined;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function readActiveFilters(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const filters: Record<string, string> = {};
  params.forEach((value, key) => {
    if (/filter|status|source|intent|q|query|sort/i.test(key) && value.length <= 120) {
      filters[key] = value;
    }
  });
  return Object.keys(filters).length > 0 ? filters : undefined;
}

function entityFromView(view: View): FeedbackRuntimeContext["entity"] {
  const params = view.params ?? {};
  const candidates: Array<[string, unknown]> = [
    ["book", params.bookId],
    ["author", params.authorId],
    ["venue", params.venueId ?? params.spaceSlug ?? params.canonicalSlug],
    ["quote", params.quoteId],
    ["post", params.postId],
    ["shelf", params.shelfId],
    ["project", params.projectId],
    ["publication", params.publicationId],
    ["conversation", params.conversationId],
  ];
  const match = candidates.find(([, value]) => typeof value === "string" && value.trim().length > 0);
  return match ? { type: match[0], id: String(match[1]).trim().slice(0, 190) } : undefined;
}

function viewId(view: View): string {
  return view.id;
}

export const FeedbackContextService = {
  capture(args: CaptureArgs): FeedbackRuntimeContext {
    const viewport = readViewport();
    const context: FeedbackRuntimeContext = {
      route: readRoute(),
      viewId: viewId(args.currentView),
      navigationType: args.currentView.type,
      activeTab: args.currentView.type === "tab" ? args.currentView.id : undefined,
      immersiveView: args.currentView.type === "immersive" ? args.currentView.id : undefined,
      stackView: args.currentView.type === "stack" ? args.currentView.id : undefined,
      entity: entityFromView(args.currentView),
      activeFilters: readActiveFilters(),
      layoutMode: viewport && viewport.width < 768 ? "compact" : "regular",
      openModalIds: [],
      viewport,
      viewportClass: classifyViewport(viewport?.width),
      locale: args.locale,
      appVersion: (import.meta as any).env?.VITE_APP_VERSION ?? "0.0.0",
      platform: typeof navigator === "undefined" ? "unknown" : navigator.platform || "web",
    };

    return Object.fromEntries(
      Object.entries(context).filter(([, value]) => value !== undefined)
    ) as FeedbackRuntimeContext;
  },
};
