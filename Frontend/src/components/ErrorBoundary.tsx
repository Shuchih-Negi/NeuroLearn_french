import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("NeuroLearn crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center text-slate-100 p-6">
          <div className="max-w-md text-center rounded-3xl border-2 border-[rgba(251,113,133,0.4)] bg-[rgba(10,20,44,0.9)] p-8">
            <div className="text-5xl">🛠️</div>
            <h1 className="pixel-heading text-lg mt-4">Something broke</h1>
            <p className="mt-3 text-sm text-slate-300/80">
              An unexpected error occurred. Reload to get back to your quest — your progress is safe.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-pixel mt-6 px-6 py-3 rounded-xl"
            >
              Reload NeuroLearn
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
