import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/40 p-6 text-red-200">
          <h3 className="font-bold text-red-300 mb-2">Something went wrong</h3>
          <pre className="text-xs whitespace-pre-wrap break-words">{this.state.error.message}</pre>
          <pre className="text-[10px] text-red-400/70 mt-2 whitespace-pre-wrap break-words">{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
