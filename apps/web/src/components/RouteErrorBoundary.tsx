import { Component, type ErrorInfo, type ReactNode } from 'react';

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('route failed to load', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-semibold text-gray-900 dark:text-white/90">This page could not load.</p>
        <p className="max-w-md text-xs text-gray-500 dark:text-white/50">
          A new release may have replaced this page’s cached files. Reload to use the latest version.
        </p>
        <button className="glass-btn-primary px-4 py-2 text-xs" onClick={() => window.location.reload()}>
          Reload application
        </button>
      </div>
    );
  }
}
