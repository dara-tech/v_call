import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  onClose?: () => void;
}

interface State {
  error: Error | null;
}

export class TvGardenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[TV Garden]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-dvh min-h-screen flex-col items-center justify-center gap-3 bg-[#050810] p-6 text-center text-zinc-300">
          <p className="text-lg font-semibold text-brand-rose">TV Garden failed to load</p>
          <p className="max-w-md text-sm text-zinc-500">
            {this.state.error.message || 'Something went wrong starting the globe viewer.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            {this.props.onClose && (
              <Button variant="ghost" size="sm" onClick={this.props.onClose}>
                Back
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
