import { Component, type ErrorInfo, type ReactNode } from 'react';

// A focused error boundary for the audience replay tree. If the replay
// render or the Pixi tree throws, this falls back to a re-handshake —
// clearing init and re-issuing hello — instead of letting a white screen
// sit on the projector. The retry is AUTOMATIC after a short delay (nobody
// is standing at the projector to click), with a button for an immediate
// manual kick. The thrown error is surfaced to the console for postmortem.
const AUTO_RETRY_MS = 5000;

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to console so the operator can post-mortem from devtools.
    console.error('[ErrorBoundary]', error, info);
    this.clearTimer();
    this.retryTimer = setTimeout(this.handleReset, AUTO_RETRY_MS);
  }

  componentWillUnmount(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  handleReset = (): void => {
    this.clearTimer();
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <div className="audience-waiting">
          <div className="audience-waiting-card">
            <h2>Reset in progress…</h2>
            <p>
              The audience replay hit an error. Reconnecting to the operator
              automatically in a few seconds.
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
