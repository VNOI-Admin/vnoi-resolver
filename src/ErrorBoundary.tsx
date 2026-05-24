import { Component, type ErrorInfo, type ReactNode } from 'react';

// A focused error boundary for the audience replay tree. If applyEvent
// throws (e.g. a malformed action arrives over the channel before the
// audience's defensive replay path catches it), this falls back to a
// re-handshake — clearing init and re-issuing hello — instead of letting
// a white screen sit on the projector. The thrown error is surfaced to the
// console for postmortem.
type Props = {
  children: ReactNode;
  onReset?: () => void;
  fallback?: ReactNode;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to console so the operator can post-mortem from devtools.
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="audience-waiting">
          <div className="audience-waiting-card">
            <h2>Reset in progress…</h2>
            <p>
              The audience replay hit an error. Reconnecting to the operator.
            </p>
            <button
              type="button"
              className="audience-fullscreen-btn"
              onClick={this.handleReset}
            >
              Retry now
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
