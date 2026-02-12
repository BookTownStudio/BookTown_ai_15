import React, { Component, ErrorInfo, ReactNode } from 'react';
import Button from './Button.tsx';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * GlobalErrorBoundary
 * Authoritative catch-all for React rendering exceptions.
 */
class GlobalErrorBoundary extends Component<Props, State> {
  // FIX: Initialize state as a class property for better visibility and to resolve "Property 'state' does not exist" errors
  public state: State = {
    hasError: false,
    error: null,
  };

  constructor(props: Props) {
    super(props);
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[CRITICAL][ERROR_BOUNDARY] Uncaught exception:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    // FIX: Use explicit any cast to ensure setState is recognized if inheritance visibility is broken in the environment
    (this as any).setState({ hasError: false, error: null });
  };

  render() {
    // FIX: state and props are accessed via any cast to satisfy existence checks in strict or misconfigured environments
    const { hasError, error } = (this as any).state;
    const { children } = (this as any).props;

    if (hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-900 p-8 text-center">
            <div className="max-w-md p-8 bg-slate-800 rounded-2xl border border-white/10 shadow-2xl">
                <h2 className="text-3xl font-bold text-white mb-4">Something went wrong</h2>
                <p className="text-slate-300 mb-6">
                    {error?.message || "An unexpected error occurred."}
                </p>
                <div className="flex gap-4 justify-center">
                     <Button onClick={this.handleReset} variant="ghost">
                        Try Again
                    </Button>
                    <Button onClick={this.handleReload} variant="primary">
                        Reload Application
                    </Button>
                </div>
            </div>
        </div>
      );
    }

    return children;
  }
}

export default GlobalErrorBoundary;