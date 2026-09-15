import { Component } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

/**
 * Catches render-time exceptions.
 *
 * Without one, any thrown error during render unmounts the whole React tree
 * and leaves a blank white page — no message, no navigation, nothing the user
 * can act on. React has no hook equivalent for this; it must be a class.
 *
 * Scoped per route (see App.jsx) so a broken page does not take the shell,
 * navigation and theme with it.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept in the console for now. When an error-reporting service is added,
    // this is the single place to forward from.
    console.error('[ui] render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Clear the error when the route changes, so navigating away from a broken
    // page actually recovers instead of showing the fallback forever.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-surface-sunken text-brand-text flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-ink">
            Something went wrong on this page
          </h1>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            The rest of the app is still working. Try again, or head back to your dashboard.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-4 text-left text-[11px] bg-surface-sunken border border-line rounded-xl p-3 overflow-auto max-h-40 text-ink-soft">
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}

          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="btn-ghost"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
            <a href="/" className="btn-primary">
              <Home className="w-4 h-4" /> Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
