import {
  SearchControllerState,
  SearchQueryInput,
  SearchSubscriber,
} from "./searchTypes";

export class SearchController<T> {
  private requestId = 0;
  private controller: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private subscribers = new Set<SearchSubscriber<T>>();
  private state: SearchControllerState<T> = {
    requestId: 0,
    status: "idle",
    data: [],
    error: null,
  };

  constructor(
    private fetcher: (
      input: SearchQueryInput,
      signal: AbortSignal
    ) => Promise<T[]>,
    private debounceMs = 300
  ) {}

  execute(input: SearchQueryInput): void {
    this.requestId += 1;
    const currentRequestId = this.requestId;

    if (this.controller) {
      this.controller.abort();
    }
    this.controller = new AbortController();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.setState({
      requestId: currentRequestId,
      status: "debouncing",
      data: this.state.data,
      error: null,
    });

    this.debounceTimer = setTimeout(() => {
      if (currentRequestId !== this.requestId) return;

      this.setState({
        requestId: currentRequestId,
        status: "loading",
        data: this.state.data,
        error: null,
      });

      const signal = this.controller?.signal;
      if (!signal) {
        this.setState({
          requestId: currentRequestId,
          status: "cancelled",
          data: this.state.data,
          error: null,
        });
        return;
      }

      this.fetcher(input, signal)
        .then((data) => {
          if (currentRequestId !== this.requestId) return;
          this.setState({
            requestId: currentRequestId,
            status: "success",
            data,
            error: null,
          });
        })
        .catch((err) => {
          if (currentRequestId !== this.requestId) return;

          if (err && typeof err === "object" && "name" in err) {
            const name = (err as { name?: string }).name;
            if (name === "AbortError") {
              this.setState({
                requestId: currentRequestId,
                status: "cancelled",
                data: this.state.data,
                error: null,
              });
              return;
            }
          }

          const error = err instanceof Error ? err : new Error("Search failed");
          this.setState({
            requestId: currentRequestId,
            status: "error",
            data: this.state.data,
            error,
          });
        });
    }, this.debounceMs);
  }

  subscribe(fn: SearchSubscriber<T>): () => void {
    this.subscribers.add(fn);
    fn(this.state);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  getState(): SearchControllerState<T> {
    return this.state;
  }

  private setState(next: SearchControllerState<T>): void {
    this.state = next;
    this.subscribers.forEach((fn) => fn(this.state));
  }
}
