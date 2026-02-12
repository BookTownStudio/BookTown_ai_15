export type SearchQueryInput = {
  query: string;
  ebookOnly: boolean;
};

export type SearchRequestState =
  | "idle"
  | "debouncing"
  | "loading"
  | "success"
  | "error"
  | "cancelled";

export interface SearchControllerState<T> {
  requestId: number;
  status: SearchRequestState;
  data: T[];
  error: Error | null;
}

export type SearchSubscriber<T> = (
  state: SearchControllerState<T>
) => void;
