export type LibrarianMode =
  | "Reinforcement"
  | "AdjacentExpansion"
  | "StructuredContrast"
  | "HighConfidencePrecision"
  | "ReReadingReflection";

export interface LibrarianRecommendationContext {
  source: "librarian";
  suggestionSessionId: string;
  suggestionId: string;
  rankPosition: number;
  mode: LibrarianMode;
}
